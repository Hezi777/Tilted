/** Queries and mutations for the account-backed room roster. */

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { buyIns, games, people, players } from "@/db/schema";
import { AVATAR_KEYS, avatarKeyForPlayer } from "@/lib/avatar";
import type { JoinGameDetail, PendingInvite } from "@/lib/api";
import {
  assertCanManageRoster,
  requireActor,
  type ActorPlayer,
  type GameStatus,
} from "@/lib/authz";
import { buildInviteNotificationPayload } from "@/lib/push-payload";

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

/**
 * Seats the signed-in account at a table it was never added to (spec 5.3: a guest
 * "picks their name from the roster, or adds it if the host has not").
 *
 * Self-service, so there is no host guard -- knowing the four-character code is the
 * whole entitlement, which is what makes a share link work. Everything else is the
 * same seat `addPlayerToGame` makes: a Player bound to this Person and the next seat
 * around the felt, plus its initial buy-in, written immediately because there is
 * nothing left to accept. A seat the host already made is a different story -- it
 * still owes its initial buy-in, which `claimInvitedSeat` writes below.
 */
export async function joinGameByCode(
  code: string,
  actorPersonId: string,
): Promise<{ gameId: string; playerId: string }> {
  const [game] = await db
    .select({ id: games.id, buyIn: games.buyIn })
    .from(games)
    .where(and(eq(games.code, code), eq(games.status, "active")))
    .limit(1);
  if (!game) throw new RosterConflictError("המשחק לא נמצא או שכבר נסגר");

  const [person] = await db
    .select({ id: people.id, name: people.name, avatarKey: people.avatarKey })
    .from(people)
    .where(and(eq(people.id, actorPersonId), sql`${people.userId} IS NOT NULL`));
  if (!person) throw new RosterConflictError("לא נמצא חשבון שחקן");

  const seated = await db
    .select({
      id: players.id,
      personId: players.personId,
      avatarKey: players.avatarKey,
      deviceId: players.deviceId,
    })
    .from(players)
    .where(and(eq(players.gameId, game.id), isNull(players.deletedAt)));

  // Already at this table -- the host added them, or they tapped the link twice. Hand
  // back the seat they have rather than making a second one. A seat the host made is
  // still unclaimed (no device, no buy-in yet) -- claiming it here is what writes the
  // initial buy-in the host's seat deferred (spec 5.3 + the seat-costs-nothing rule).
  const existing = seated.find((row) => row.personId === person.id);
  if (existing) {
    if (existing.deviceId === null) {
      await claimInvitedSeat(game.id, existing.id, actorPersonId);
    }
    return { gameId: game.id, playerId: existing.id };
  }

  const avatarKey = avatarKeyForPlayer(
    person.avatarKey,
    seated.map((row) => row.avatarKey),
  );
  if (!avatarKey) throw new RosterConflictError("אין עוד דמויות פנויות בשולחן");

  const playerId = randomUUID();
  const result = await db.execute<{ player_id: string }>(sql`
    WITH active_game AS (
      SELECT id, buy_in FROM ${games}
      WHERE id = ${game.id}::uuid AND status = 'active'
      FOR UPDATE
    ), inserted_player AS (
      INSERT INTO ${players}
        (id, game_id, person_id, name, avatar_key, seat_order, device_id, is_host)
      SELECT ${playerId}::uuid, g.id, ${person.id}::uuid, ${person.name},
        ${avatarKey},
        coalesce((SELECT max(existing.seat_order) + 1 FROM ${players} existing WHERE existing.game_id = g.id), 0),
        ${actorPersonId}, false
      FROM active_game g
      WHERE NOT EXISTS (
          SELECT 1 FROM ${players} duplicate
          WHERE duplicate.game_id = g.id
            AND duplicate.person_id = ${person.id}::uuid
            AND duplicate.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM ${players} occupied
          WHERE occupied.game_id = g.id
            AND occupied.avatar_key = ${avatarKey}
            AND occupied.deleted_at IS NULL
        )
      RETURNING id, game_id
    ), inserted_buyin AS (
      INSERT INTO ${buyIns}
        (id, game_id, player_id, amount, kind, op_id, created_by_device)
      SELECT ${randomUUID()}::uuid, p.game_id, p.id, g.buy_in, 'initial',
        ${randomUUID()}::uuid, ${actorPersonId}
      FROM inserted_player p
      INNER JOIN active_game g ON g.id = p.game_id
      RETURNING player_id
    )
    SELECT player_id FROM inserted_buyin
  `);

  if (!result.rows[0]) {
    throw new RosterConflictError("המשחק כבר לא פעיל או שהמקום נתפס");
  }
  return { gameId: game.id, playerId };
}

/**
 * Claims a seat the host already made and writes its deferred initial buy-in in the
 * same statement -- the shared second half of `joinGameByCode`'s existing-seat branch
 * and the notifications panel's accept action ("do not write a second path").
 *
 * A no-op if the seat is not this Person's, is already claimed, or its game is not
 * active; the caller decides whether that is worth surfacing as an error.
 */
export async function claimInvitedSeat(
  gameId: string,
  playerId: string,
  actorPersonId: string,
): Promise<{ id: string }> {
  const result = await db.execute<{ player_id: string }>(sql`
    WITH active_game AS (
      SELECT id, buy_in FROM ${games}
      WHERE id = ${gameId}::uuid AND status = 'active'
      FOR UPDATE
    ), claimed AS (
      UPDATE ${players} p
      SET device_id = ${actorPersonId}
      FROM active_game g
      WHERE p.id = ${playerId}::uuid
        AND p.game_id = g.id
        AND p.person_id = ${actorPersonId}::uuid
        AND p.deleted_at IS NULL
        AND p.device_id IS NULL
      RETURNING p.id, g.buy_in AS buy_in
    ), inserted_buyin AS (
      INSERT INTO ${buyIns}
        (id, game_id, player_id, amount, kind, op_id, created_by_device)
      SELECT ${randomUUID()}::uuid, ${gameId}::uuid, c.id, c.buy_in, 'initial',
        ${randomUUID()}::uuid, ${actorPersonId}
      FROM claimed c
      RETURNING player_id
    )
    SELECT player_id FROM inserted_buyin
  `);
  if (!result.rows[0]) {
    throw new RosterConflictError("ההזמנה לא נמצאה או שהמשחק כבר לא פעיל");
  }
  return { id: playerId };
}

/**
 * Declines a seat the host made before it was ever claimed -- the invitee's own
 * choice, not roster management, so it does not go through `assertCanManageRoster`.
 * Only the Person the seat belongs to may decline it, and only while it is still
 * unclaimed; a claimed seat is left alone (releasing or leaving a live seat is a
 * different action).
 */
export async function declineInvite(
  gameId: string,
  playerId: string,
  actorPersonId: string,
): Promise<void> {
  const result = await db.execute<{ id: string }>(sql`
    WITH target AS (
      SELECT p.id
      FROM ${players} p
      WHERE p.id = ${playerId}::uuid
        AND p.game_id = ${gameId}::uuid
        AND p.person_id = ${actorPersonId}::uuid
        AND p.device_id IS NULL
        AND p.deleted_at IS NULL
    ), deleted_buyins AS (
      UPDATE ${buyIns} bi
      SET deleted_at = now()
      FROM target
      WHERE bi.player_id = target.id AND bi.deleted_at IS NULL
    ), deleted_player AS (
      UPDATE ${players} p
      SET deleted_at = now()
      FROM target
      WHERE p.id = target.id
      RETURNING p.id
    )
    SELECT id FROM deleted_player
  `);
  if (!result.rows[0]) {
    throw new RosterConflictError("ההזמנה לא נמצאה");
  }
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

/**
 * Adds a missing seat; roster management is host-only. The seat has no buy-in yet --
 * it costs the table nothing until its owner accepts the invite (`claimInvitedSeat`),
 * so a person who never shows up was never in the pot.
 */
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
    .select({ id: people.id, name: people.name, avatarKey: people.avatarKey })
    .from(people)
    .where(and(eq(people.id, input.personId), sql`${people.userId} IS NOT NULL`));
  if (!person) throw new Error("לא נמצא חשבון שחקן");

  const usedAvatars = await db
    .select({ avatarKey: players.avatarKey })
    .from(players)
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)));
  const avatarKey = avatarKeyForPlayer(
    person.avatarKey,
    usedAvatars.map((row) => row.avatarKey),
  );
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

  // No buy-in yet: the seat costs nothing until its owner accepts it. `joinGameByCode`
  // and `claimInvitedSeat` write the initial buy-in when the invite is claimed.
  const result = await db.execute<{ id: string }>(sql`
        WITH active_game AS (
          SELECT id FROM ${games}
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
          RETURNING id
        )
        SELECT id FROM inserted_player
      `);

  if (!result.rows[0]) {
    throw new RosterConflictError("המשחק כבר לא פעיל או שהשחקן כבר נמצא במשחק");
  }

  // Push comes after the seat is committed, and never fails this request --
  // `sendPushToPerson` catches and logs internally. The host's own name (not their
  // per-game snapshot) is what the invitee sees.
  const [host] = await db
    .select({ name: people.name })
    .from(people)
    .where(eq(people.id, actorPersonId));
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .where(eq(games.id, gameId));
  const { sendPushToPerson } = await import("@/lib/push");
  await sendPushToPerson(
    person.id,
    buildInviteNotificationPayload({
      hostName: host?.name ?? "מארח",
      gameName: game?.name ?? null,
      gameId,
    }),
  );

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

/**
 * Every active game where this Person holds a seat the host made that they have not
 * opened yet -- the notifications panel's list. A separate function from
 * `buildPendingInvitesQuery` only so the query itself can be inspected with
 * `.toSQL()` in a test without a database (see `src/db/history-queries.ts`).
 */
export function buildPendingInvitesQuery(personId: string) {
  const host = alias(players, "host");
  const seated = alias(players, "seated");
  return db
    .select({
      gameId: games.id,
      playerId: players.id,
      gameName: games.name,
      createdAt: games.createdAt,
      location: games.location,
      hostName: host.name,
      seatedCount: sql<number>`count(distinct ${seated.id})`,
    })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .innerJoin(
      host,
      and(eq(host.gameId, games.id), eq(host.isHost, true), isNull(host.deletedAt)),
    )
    .leftJoin(seated, and(eq(seated.gameId, games.id), isNull(seated.deletedAt)))
    .where(
      and(
        eq(players.personId, personId),
        isNull(players.deviceId),
        isNull(players.deletedAt),
        eq(games.status, "active"),
      ),
    )
    .groupBy(games.id, players.id, host.name)
    .orderBy(desc(games.createdAt));
}

export async function listPendingInvitesForPerson(
  personId: string,
): Promise<PendingInvite[]> {
  const rows = await buildPendingInvitesQuery(personId);
  return rows.map((row) => ({
    gameId: row.gameId,
    playerId: row.playerId,
    gameName: row.gameName,
    createdAt: row.createdAt.toISOString(),
    location: row.location,
    hostName: row.hostName,
    seatedCount: Number(row.seatedCount),
  }));
}
