/** Queries and mutations for the account-backed room roster. */

import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, people, players } from "@/db/schema";
import { AVATAR_KEYS, firstAvailableAvatarKey } from "@/lib/avatar";
import type { JoinGameDetail } from "@/lib/api";
import {
  assertCanManageRoster,
  requireActor,
  type ActorPlayer,
  type GameStatus,
} from "@/lib/authz";

/** Returns only games whose room code is still in circulation. */
export async function getGameByRoomCode(
  code: string,
  actorPersonId: string,
): Promise<JoinGameDetail | null> {
  const [game] = await db
    .select({
      id: games.id,
      code: games.code,
      name: games.name,
      status: games.status,
    })
    .from(games)
    .where(
      and(
        eq(games.code, code),
        sql`${games.status} NOT IN ('closed', 'cancelled')`,
      ),
    )
    .limit(1);

  if (!game) return null;

  const rosterRows = await db
    .select({
      id: players.id,
      name: players.name,
      nickname: people.nickname,
      avatarKey: players.avatarKey,
      seatOrder: players.seatOrder,
      isHost: players.isHost,
      personId: players.personId,
      deviceId: players.deviceId,
    })
    .from(players)
    .leftJoin(people, eq(people.id, players.personId))
    .where(and(eq(players.gameId, game.id), isNull(players.deletedAt)))
    .orderBy(players.seatOrder);

  // A signed-in player may only see and claim the seat tied to their account. This
  // keeps the UI honest too, but claimPlayer repeats the ownership predicate in SQL
  // because a request body is always untrusted.
  const visibleRows = rosterRows.filter(
    (player) => player.personId === actorPersonId,
  );
  const current = visibleRows.find(
    (player) => player.deviceId === actorPersonId,
  );
  return {
    id: game.id,
    code: game.code,
    name: game.name,
    status: game.status,
    takenAvatarKeys: rosterRows
      .map((player) => player.avatarKey)
      .filter((key): key is string => key !== null),
    players: visibleRows.map((player) => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      avatarKey: player.avatarKey,
      seatOrder: player.seatOrder,
      isHost: player.isHost,
      claimed: player.deviceId !== null,
      claimedByCurrentDevice: player.deviceId === actorPersonId,
    })),
    currentPlayerId: current?.id ?? null,
    currentPlayerIsHost: current?.isHost ?? false,
  };
}

export class ClaimConflictError extends Error {
  constructor(message = "אי אפשר לצרף את החשבון למקום הזה") {
    super(message);
    this.name = "ClaimConflictError";
  }
}

/**
 * Claims the caller's own account-backed seat in one conditional UPDATE. The
 * authenticated Person id is both the ownership predicate and the legacy actor key
 * stored in `players.device_id`; no client-supplied identity participates.
 */
export async function claimPlayer(
  gameId: string,
  playerId: string,
  actorPersonId: string,
  avatarKey: string,
): Promise<{ id: string }> {
  if (!AVATAR_KEYS.includes(avatarKey as (typeof AVATAR_KEYS)[number])) {
    throw new ClaimConflictError("הדמות שבחרתם לא זמינה");
  }
  const result = await db.execute<{ id: string }>(sql`
    WITH active_game AS (
      SELECT id FROM ${games}
      WHERE id = ${gameId}::uuid AND status = 'active'
      FOR UPDATE
    ), claimed AS (
      UPDATE ${players} p
      SET device_id = ${actorPersonId}, avatar_key = ${avatarKey}
      FROM active_game g
      WHERE p.id = ${playerId}::uuid
        AND p.game_id = g.id
        AND p.person_id = ${actorPersonId}::uuid
        AND p.deleted_at IS NULL
        AND (p.device_id IS NULL OR p.device_id = ${actorPersonId})
        AND NOT EXISTS (
          SELECT 1 FROM ${players} occupied
          WHERE occupied.game_id = g.id
            AND occupied.id <> p.id
            AND occupied.avatar_key = ${avatarKey}
            AND occupied.deleted_at IS NULL
        )
      RETURNING p.id
    )
    SELECT id FROM claimed
  `);

  const claimed = result.rows[0];
  if (!claimed) {
    throw new ClaimConflictError("המקום לא שייך לחשבון הזה או שהדמות כבר תפוסה");
  }
  return claimed;
}

export class RosterConflictError extends Error {
  constructor(message = "השחקן כבר נמצא במשחק") {
    super(message);
    this.name = "RosterConflictError";
  }
}

interface RosterActorRow {
  id: string;
  isHost: boolean;
  deviceId: string | null;
  settledAt: Date | null;
  deletedAt: Date | null;
}

async function getRosterContext(gameId: string, actorPersonId: string) {
  const [game] = await db
    .select({ id: games.id, status: games.status, buyIn: games.buyIn })
    .from(games)
    .where(eq(games.id, gameId));
  if (!game) return null;

  const [actorRow] = await db
    .select({
      id: players.id,
      isHost: players.isHost,
      deviceId: players.deviceId,
      settledAt: players.settledAt,
      deletedAt: players.deletedAt,
    })
    .from(players)
    .where(
      and(
        eq(players.gameId, gameId),
        eq(players.deviceId, actorPersonId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);

  return { game, actor: (actorRow ?? null) as RosterActorRow | null };
}

export interface AddPlayerInput {
  personId: string;
}

/** Adds a missing seat and its initial buy-in; roster management is host-only. */
export async function addPlayerToGame(
  gameId: string,
  actorPersonId: string,
  input: AddPlayerInput,
): Promise<{ id: string }> {
  const context = await getRosterContext(gameId, actorPersonId);
  if (!context) throw new Error("המשחק לא נמצא");
  const actor = requireActor(context.actor as ActorPlayer | null);
  assertCanManageRoster(context.game.status as GameStatus, actor);

  const [person] = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(and(eq(people.id, input.personId), sql`${people.userId} IS NOT NULL`));
  if (!person) throw new Error("לא נמצא חשבון שחקן");

  const usedAvatars = await db
    .select({ avatarKey: players.avatarKey })
    .from(players)
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)));
  const avatarKey = firstAvailableAvatarKey(usedAvatars.map((row) => row.avatarKey));
  if (!avatarKey) throw new RosterConflictError("אין עוד דמויות פנויות בשולחן");

  const [duplicate] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.gameId, gameId),
        eq(players.personId, person.id),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);
  if (duplicate) throw new RosterConflictError();

  const playerId = randomUUID();
  const opId = randomUUID();

  const result = await db.execute<{ player_id: string }>(sql`
        WITH active_game AS (
          SELECT id, buy_in FROM ${games}
          WHERE id = ${gameId}::uuid AND status = 'active'
          FOR UPDATE
        ), inserted_player AS (
          INSERT INTO ${players}
            (id, game_id, person_id, name, avatar_key, seat_order, device_id, is_host)
          SELECT ${playerId}::uuid, g.id, ${person.id}::uuid, ${person.name},
            ${avatarKey},
            coalesce((SELECT max(existing.seat_order) + 1 FROM ${players} existing WHERE existing.game_id = g.id), 0),
            NULL, false
          FROM active_game g
          WHERE NOT EXISTS (
              SELECT 1 FROM ${players} duplicate
              WHERE duplicate.game_id = g.id
                AND duplicate.person_id = ${person.id}::uuid
                AND duplicate.deleted_at IS NULL
            )
          RETURNING id, game_id
        ), inserted_buyin AS (
          INSERT INTO ${buyIns}
            (id, game_id, player_id, amount, kind, op_id, created_by_device)
          SELECT ${randomUUID()}::uuid, p.game_id, p.id, g.buy_in, 'initial',
            ${opId}::uuid, ${actorPersonId}
          FROM inserted_player p
          INNER JOIN active_game g ON g.id = p.game_id
          RETURNING player_id
        )
        SELECT player_id FROM inserted_buyin
      `);

  if (!result.rows[0]) {
    throw new RosterConflictError("המשחק כבר לא פעיל או שהשחקן כבר נמצא במשחק");
  }

  return { id: playerId };
}

/** Releases a seat only after the shared host roster guard has passed. */
export async function releasePlayerClaim(
  gameId: string,
  playerId: string,
  actorPersonId: string,
): Promise<void> {
  const context = await getRosterContext(gameId, actorPersonId);
  if (!context) throw new Error("המשחק לא נמצא");
  const actor = requireActor(context.actor as ActorPlayer | null);
  assertCanManageRoster(context.game.status as GameStatus, actor);

  const result = await db.execute<{ id: string }>(sql`
    WITH active_game AS (
      SELECT id FROM ${games}
      WHERE id = ${gameId}::uuid AND status = 'active'
      FOR UPDATE
    ), released AS (
      UPDATE ${players} p
      SET device_id = NULL
      FROM active_game g
      WHERE p.id = ${playerId}::uuid
        AND p.game_id = g.id
        AND p.deleted_at IS NULL
        AND p.device_id IS NOT NULL
      RETURNING p.id
    )
    SELECT id FROM released
  `);

  if (!result.rows[0]) {
    throw new RosterConflictError("המקום לא נמצא או שהמשחק כבר לא פעיל");
  }
}
