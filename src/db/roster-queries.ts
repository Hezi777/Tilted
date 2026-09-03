/** Queries and mutations for the shared-room join roster (spec sections 5.3 and 10). */

import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, people, players } from "@/db/schema";
import { avatarKeyForPerson } from "@/lib/avatar";
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
  deviceId: string,
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
      seatOrder: players.seatOrder,
      isHost: players.isHost,
      deviceId: players.deviceId,
    })
    .from(players)
    .leftJoin(people, eq(people.id, players.personId))
    .where(and(eq(players.gameId, game.id), isNull(players.deletedAt)))
    .orderBy(players.seatOrder);

  const current = rosterRows.find((player) => player.deviceId === deviceId);
  return {
    id: game.id,
    code: game.code,
    name: game.name,
    status: game.status,
    players: rosterRows.map((player) => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      seatOrder: player.seatOrder,
      isHost: player.isHost,
      claimed: player.deviceId !== null,
      claimedByCurrentDevice: player.deviceId === deviceId,
    })),
    currentPlayerId: current?.id ?? null,
    currentPlayerIsHost: current?.isHost ?? false,
  };
}

export class ClaimConflictError extends Error {
  constructor() {
    super("המקום כבר נתפס במכשיר אחר");
    this.name = "ClaimConflictError";
  }
}

/**
 * Claims one seat in a single conditional UPDATE. A normal claim can only fill an
 * empty seat or repeat the same device's claim; force mode intentionally replaces
 * any device claim, including the host claim, after an explicit UI confirmation.
 *
 * Security tradeoff (approved plan): the spoken room code is not a security boundary;
 * force-claim is available to anyone holding it so a dead phone cannot strand a game.
 */
export async function claimPlayer(
  gameId: string,
  playerId: string,
  deviceId: string,
  force = false,
): Promise<{ id: string }> {
  const result = await db.execute<{ id: string }>(force
    ? sql`
        WITH active_game AS (
          SELECT id FROM ${games}
          WHERE id = ${gameId}::uuid AND status = 'active'
          FOR UPDATE
        ), claimed AS (
          UPDATE ${players} p
          SET device_id = ${deviceId}
          FROM active_game g
          WHERE p.id = ${playerId}::uuid
            AND p.game_id = g.id
            AND p.deleted_at IS NULL
          RETURNING p.id
        )
        SELECT id FROM claimed
      `
    : sql`
        WITH active_game AS (
          SELECT id FROM ${games}
          WHERE id = ${gameId}::uuid AND status = 'active'
          FOR UPDATE
        ), claimed AS (
          UPDATE ${players} p
          SET device_id = ${deviceId}
          FROM active_game g
          WHERE p.id = ${playerId}::uuid
            AND p.game_id = g.id
            AND p.deleted_at IS NULL
            AND (p.device_id IS NULL OR p.device_id = ${deviceId})
          RETURNING p.id
        )
        SELECT id FROM claimed
      `);

  const claimed = result.rows[0];
  if (!claimed) throw new ClaimConflictError();
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

async function getRosterContext(gameId: string, deviceId: string) {
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
        eq(players.deviceId, deviceId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);

  return { game, actor: (actorRow ?? null) as RosterActorRow | null };
}

export interface AddPlayerInput {
  personId?: string;
  name?: string;
  nickname?: string | null;
}

/** Adds a missing seat and its initial buy-in; roster management is host-only. */
export async function addPlayerToGame(
  gameId: string,
  deviceId: string,
  input: AddPlayerInput,
): Promise<{ id: string }> {
  const context = await getRosterContext(gameId, deviceId);
  if (!context) throw new Error("המשחק לא נמצא");
  const actor = requireActor(context.actor as ActorPlayer | null);
  assertCanManageRoster(context.game.status as GameStatus, actor);

  let person: { id: string; name: string } | undefined;
  const newPersonId = input.personId ? null : randomUUID();
  if (input.personId) {
    const [existing] = await db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(eq(people.id, input.personId));
    if (!existing) throw new Error("השחקן לא נמצא");
    person = existing;
  } else if (input.name) {
    person = { id: newPersonId!, name: input.name };
  }
  if (!person) throw new Error("חסר שם שחקן");

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

  const result = newPersonId
    ? await db.execute<{ player_id: string }>(sql`
        WITH active_game AS (
          SELECT id, buy_in FROM ${games}
          WHERE id = ${gameId}::uuid AND status = 'active'
          FOR UPDATE
        ), inserted_person AS (
          INSERT INTO ${people} (id, name, nickname)
          SELECT ${newPersonId}::uuid, ${person.name}, ${input.nickname ?? null}
          FROM active_game
          RETURNING id
        ), inserted_player AS (
          INSERT INTO ${players}
            (id, game_id, person_id, name, avatar_key, seat_order, device_id, is_host)
          SELECT ${playerId}::uuid, g.id, p.id, ${person.name},
            ${avatarKeyForPerson(person.id)},
            coalesce((SELECT max(existing.seat_order) + 1 FROM ${players} existing WHERE existing.game_id = g.id), 0),
            NULL, false
          FROM inserted_person p CROSS JOIN active_game g
          RETURNING id, game_id
        ), inserted_buyin AS (
          INSERT INTO ${buyIns}
            (id, game_id, player_id, amount, kind, op_id, created_by_device)
          SELECT ${randomUUID()}::uuid, p.game_id, p.id, g.buy_in, 'initial',
            ${opId}::uuid, ${deviceId}
          FROM inserted_player p
          INNER JOIN active_game g ON g.id = p.game_id
          RETURNING player_id
        )
        SELECT player_id FROM inserted_buyin
      `)
    : await db.execute<{ player_id: string }>(sql`
        WITH active_game AS (
          SELECT id, buy_in FROM ${games}
          WHERE id = ${gameId}::uuid AND status = 'active'
          FOR UPDATE
        ), inserted_player AS (
          INSERT INTO ${players}
            (id, game_id, person_id, name, avatar_key, seat_order, device_id, is_host)
          SELECT ${playerId}::uuid, g.id, ${person.id}::uuid, ${person.name},
            ${avatarKeyForPerson(person.id)},
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
            ${opId}::uuid, ${deviceId}
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
  deviceId: string,
): Promise<void> {
  const context = await getRosterContext(gameId, deviceId);
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
