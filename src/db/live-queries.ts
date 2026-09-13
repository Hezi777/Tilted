/** Queries and mutations used by the live game screen (spec section 5.4). */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, people, players } from "@/db/schema";
import {
  assertCanDeleteBuyIn,
  assertCanInsertBuyIn,
  assertCanManageRoster,
  requireActiveGame,
  requireActor,
  AuthzError,
  type ActorPlayer,
  type BuyInRow,
} from "@/lib/authz";
import { firstAvailableAvatarKey } from "@/lib/avatar";
import { agorot, sumAgorot } from "@/lib/money";

export interface LivePlayer {
  id: string;
  personId: string | null;
  name: string;
  avatarKey: string | null;
  seatOrder: number;
  isHost: boolean;
  isYou: boolean;
  isSettled: boolean;
  /** True while this seat is the one the host made and its owner has not opened the
   * game yet (`device_id IS NULL`) -- an invite, not an empty chair. */
  isWaiting: boolean;
  totalIn: number;
  buyInCount: number;
  /** v2: the physical chair chosen around the table (plan item 10). Null until the
   * player picks one; distinct from `seatOrder`, which the pot and settlement rely on
   * and must never be reshuffled to match the room. */
  tableSeat: number | null;
}

/** Physical chairs available around the table (design system's nine-seat layout). */
export const MAX_TABLE_SEATS = 9;

export interface LiveFeedItem {
  id: string;
  opId: string;
  playerId: string;
  playerName: string;
  amount: number;
  kind: "initial" | "rebuy";
  createdAt: string;
}

export interface LiveGame {
  id: string;
  code: string;
  name: string | null;
  /** Added by the game route's ownership/detail projection. */
  location?: string | null;
  notes?: string | null;
  createdByPersonId?: string | null;
  status: "active" | "settling" | "closed" | "cancelled";
  buyIn: number;
  rebuyAmount: number;
  startedAt: string;
  plannedEndAt: string;
  pot: number;
  players: LivePlayer[];
  feed: LiveFeedItem[];
  /**
   * Every live buy-in on the viewer's own seat, newest first -- the whole evening, not
   * the twelve rows the shared feed keeps. A player correcting a rebuy from two hands
   * ago has to be able to see it, and the feed had long since scrolled past it.
   */
  yourBuyIns: LiveFeedItem[];
  youId: string | null;
  isHost: boolean;
}

export interface RebuyInput {
  gameId: string;
  playerId: string;
  amount: number;
  opId: string;
  deviceId: string;
}

export interface RebuyResult {
  id: string;
  opId: string;
  playerId: string;
  amount: number;
  kind: "rebuy";
  createdAt: string;
  inserted: boolean;
}

interface ActorRow extends ActorPlayer {
  gameId: string;
  status: "active" | "settling" | "closed" | "cancelled";
}

function toActor(row: {
  id: string;
  isHost: boolean;
  deviceId: string | null;
  settledAt: Date | null;
  deletedAt: Date | null;
}): ActorPlayer {
  return {
    id: row.id,
    isHost: row.isHost,
    deviceId: row.deviceId,
    settledAt: row.settledAt,
    deletedAt: row.deletedAt,
  };
}

async function getActor(gameId: string, deviceId: string): Promise<ActorRow> {
  const [row] = await db
    .select({
      id: players.id,
      isHost: players.isHost,
      deviceId: players.deviceId,
      settledAt: players.settledAt,
      deletedAt: players.deletedAt,
      gameId: games.id,
      status: games.status,
    })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(and(eq(players.gameId, gameId), eq(players.deviceId, deviceId)))
    .limit(1);
  if (!row) {
    requireActor(null);
    throw new Error("unreachable");
  }
  return row;
}

/** Reads a live game by UUID, with the requesting device's seat marked as `isYou`. */
export async function getLiveGame(
  gameId: string,
  deviceId: string,
): Promise<LiveGame | null> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return null;

  const playerRows = await db
    .select({
      id: players.id,
      personId: players.personId,
      name: players.name,
      avatarKey: players.avatarKey,
      seatOrder: players.seatOrder,
      isHost: players.isHost,
      deviceId: players.deviceId,
      settledAt: players.settledAt,
      tableSeat: players.tableSeat,
      totalIn: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
      buyInCount: sql<number>`count(${buyIns.id})`,
    })
    .from(players)
    .leftJoin(
      buyIns,
      and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)),
    )
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)))
    .groupBy(players.id)
    .orderBy(asc(players.seatOrder));

  const feedRows = await db
    .select({
      id: buyIns.id,
      opId: buyIns.opId,
      playerId: buyIns.playerId,
      playerName: players.name,
      amount: buyIns.amount,
      kind: buyIns.kind,
      createdAt: buyIns.createdAt,
    })
    .from(buyIns)
    .innerJoin(players, eq(players.id, buyIns.playerId))
    .where(and(eq(buyIns.gameId, gameId), isNull(buyIns.deletedAt)))
    .orderBy(desc(buyIns.createdAt), desc(buyIns.id))
    .limit(12);

  const playersOut = playerRows.map((row) => ({
    id: row.id,
    personId: row.personId,
    name: row.name,
    avatarKey: row.avatarKey,
    seatOrder: row.seatOrder,
    isHost: row.isHost,
    isYou: row.deviceId === deviceId,
    isSettled: row.settledAt !== null,
    isWaiting: row.deviceId === null,
    totalIn: Number(row.totalIn),
    buyInCount: Number(row.buyInCount),
    tableSeat: row.tableSeat,
  }));

  const youRow = playersOut.find((player) => player.isYou) ?? null;
  const yourRows = youRow
    ? await db
        .select({
          id: buyIns.id,
          opId: buyIns.opId,
          playerId: buyIns.playerId,
          amount: buyIns.amount,
          kind: buyIns.kind,
          createdAt: buyIns.createdAt,
        })
        .from(buyIns)
        .where(
          and(
            eq(buyIns.gameId, gameId),
            eq(buyIns.playerId, youRow.id),
            isNull(buyIns.deletedAt),
          ),
        )
        .orderBy(desc(buyIns.createdAt), desc(buyIns.id))
    : [];

  return {
    id: game.id,
    code: game.code,
    name: game.name,
    status: game.status,
    buyIn: game.buyIn,
    rebuyAmount: game.rebuyAmount,
    startedAt: game.createdAt.toISOString(),
    plannedEndAt: (game.plannedEndAt ?? new Date(game.createdAt.getTime() + 4 * 60 * 60 * 1000)).toISOString(),
    pot: Number(sumAgorot(playersOut.map((player) => agorot(player.totalIn)))),
    players: playersOut,
    feed: feedRows.map((row) => ({
      id: row.id,
      opId: row.opId,
      playerId: row.playerId,
      playerName: row.playerName,
      amount: row.amount,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
    })),
    yourBuyIns: yourRows.map((row) => ({
      id: row.id,
      opId: row.opId,
      playerId: row.playerId,
      playerName: youRow?.name ?? "",
      amount: row.amount,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
    })),
    youId: youRow?.id ?? null,
    isHost: playersOut.some((player) => player.isYou && player.isHost),
  };
}

export async function extendPlannedEnd(
  gameId: string,
  deviceId: string,
  minutes: 30 | 60,
): Promise<string> {
  const actorRow = await getActor(gameId, deviceId);
  const actor = requireActor(toActor(actorRow));
  assertCanManageRoster(actorRow.status, actor);

  const [updated] = await db
    .update(games)
    .set({
      plannedEndAt: sql`greatest(coalesce(${games.plannedEndAt}, ${games.createdAt} + interval '4 hours'), now()) + ${minutes} * interval '1 minute'`,
    })
    .where(and(eq(games.id, gameId), eq(games.status, "active")))
    .returning({ plannedEndAt: games.plannedEndAt });

  if (!updated?.plannedEndAt) throw new Error("המשחק כבר לא פעיל");
  return updated.plannedEndAt.toISOString();
}

/** Active buy-in insertion. The game/player predicates live in the INSERT statement. */
export async function insertRebuy(input: RebuyInput): Promise<RebuyResult> {
  const actorRow = await getActor(input.gameId, input.deviceId);
  const actor = requireActor(toActor(actorRow));
  const [target] = await db
    .select({ id: players.id, settledAt: players.settledAt, deletedAt: players.deletedAt })
    .from(players)
    .where(and(eq(players.id, input.playerId), eq(players.gameId, input.gameId)))
    .limit(1);
  if (!target) throw new Error("player_not_found");
  assertCanInsertBuyIn(actorRow.status, actor, target);

  // Keep this as one statement: a rebuy racing an active -> settling transition must
  // be rejected, rather than being committed after the pot was counted.
  const id = randomUUID();
  const result = await db.execute<{
    id: string;
    op_id: string;
    player_id: string;
    amount: number;
    kind: "rebuy";
    created_at: Date;
  }>(sql`
    WITH active_game AS (
      SELECT id FROM ${games}
      WHERE id = ${input.gameId}::uuid AND status = 'active'
      FOR UPDATE
    )
    INSERT INTO ${buyIns} (id, game_id, player_id, amount, kind, op_id, created_by_device)
    SELECT ${id}, g.id, p.id, ${input.amount}, 'rebuy', ${input.opId}::uuid, ${input.deviceId}
    FROM ${players} p
    INNER JOIN active_game g ON g.id = p.game_id
    WHERE p.id = ${input.playerId}
      AND p.settled_at IS NULL
      AND p.deleted_at IS NULL
    ON CONFLICT (op_id) DO NOTHING
    RETURNING id, op_id, player_id, amount, kind, created_at
  `);

  const row = result.rows[0];
  if (row) {
    return {
      id: row.id,
      opId: row.op_id,
      playerId: row.player_id,
      amount: Number(row.amount),
      kind: "rebuy",
      createdAt: new Date(row.created_at).toISOString(),
      inserted: true,
    };
  }

  const [existing] = await db
    .select({
      id: buyIns.id,
      opId: buyIns.opId,
      playerId: buyIns.playerId,
      amount: buyIns.amount,
      kind: buyIns.kind,
      createdAt: buyIns.createdAt,
      deletedAt: buyIns.deletedAt,
    })
    .from(buyIns)
    .where(and(eq(buyIns.opId, input.opId), eq(buyIns.gameId, input.gameId)))
    .limit(1);
  if (existing) {
    if (
      existing.playerId !== input.playerId ||
      existing.amount !== input.amount ||
      existing.kind !== "rebuy"
    ) {
      throw new Error("op_id_conflict");
    }
    return {
      ...existing,
      kind: "rebuy",
      createdAt: existing.createdAt.toISOString(),
      inserted: false,
    };
  }
  const [conflict] = await db
    .select({ gameId: buyIns.gameId })
    .from(buyIns)
    .where(eq(buyIns.opId, input.opId))
    .limit(1);
  if (conflict && conflict.gameId !== input.gameId) throw new Error("op_id_conflict");
  throw new Error("game_not_active");
}

export async function deleteRebuy(
  gameId: string,
  opId: string,
  deviceId: string,
  tombstone?: { playerId: string; amount: number },
): Promise<boolean> {
  const actorRow = await getActor(gameId, deviceId);
  const actor = requireActor(toActor(actorRow));
  const [row] = await db
    .select({
      id: buyIns.id,
      playerId: buyIns.playerId,
      kind: buyIns.kind,
      createdByDevice: buyIns.createdByDevice,
      createdAt: buyIns.createdAt,
      deletedAt: buyIns.deletedAt,
    })
    .from(buyIns)
    .where(and(eq(buyIns.gameId, gameId), eq(buyIns.opId, opId)))
    .limit(1);
  if (!row && !tombstone) return false;

  if (!row && tombstone) {
    const [target] = await db
      .select({ id: players.id, settledAt: players.settledAt, deletedAt: players.deletedAt })
      .from(players)
      .where(and(eq(players.gameId, gameId), eq(players.id, tombstone.playerId)))
      .limit(1);
    if (!target) throw new Error("player_not_found");
    assertCanInsertBuyIn(actorRow.status, actor, target);

    const result = await db.execute<{ id: string }>(sql`
      WITH active_game AS (
        SELECT id FROM ${games}
        WHERE id = ${gameId}::uuid AND status = 'active'
        FOR UPDATE
      ), target AS (
        SELECT p.id, p.game_id
        FROM ${players} p
        INNER JOIN active_game g ON g.id = p.game_id
        WHERE p.id = ${tombstone.playerId}::uuid
          AND p.settled_at IS NULL
          AND p.deleted_at IS NULL
      ), inserted AS (
        INSERT INTO ${buyIns}
          (id, game_id, player_id, amount, kind, op_id, created_by_device, deleted_at)
        SELECT ${randomUUID()}::uuid, p.game_id, p.id, ${tombstone.amount},
          'rebuy', ${opId}::uuid, ${deviceId}, now()
        FROM target p
        ON CONFLICT (op_id) DO NOTHING
        RETURNING id
      )
      SELECT id FROM inserted
    `);
    if (result.rows[0]) return true;

    const [raced] = await db
      .select({
        id: buyIns.id,
        gameId: buyIns.gameId,
        playerId: buyIns.playerId,
        kind: buyIns.kind,
        amount: buyIns.amount,
        createdByDevice: buyIns.createdByDevice,
        createdAt: buyIns.createdAt,
        deletedAt: buyIns.deletedAt,
      })
      .from(buyIns)
      .where(eq(buyIns.opId, opId))
      .limit(1);
    if (!raced || raced.gameId !== gameId) throw new Error("op_id_conflict");
    if (raced.playerId !== tombstone.playerId || raced.amount !== tombstone.amount) {
      throw new Error("op_id_conflict");
    }
    if (raced.deletedAt !== null) return true;
    assertCanDeleteBuyIn(actorRow.status, actor, raced);
    return softDeleteRebuy(gameId, raced.id);
  }

  if (!row) return false;
  if (row.deletedAt !== null) return true;
  const check: BuyInRow = { ...row };
  assertCanDeleteBuyIn(actorRow.status, actor, check);
  return softDeleteRebuy(gameId, row.id);
}

async function softDeleteRebuy(gameId: string, buyInId: string): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    WITH active_game AS (
      SELECT id FROM ${games}
      WHERE id = ${gameId}::uuid AND status = 'active'
      FOR UPDATE
    ), deleted AS (
      UPDATE ${buyIns} bi
      SET deleted_at = now()
      FROM active_game g
      WHERE bi.id = ${buyInId}::uuid
        AND bi.game_id = g.id
        AND bi.deleted_at IS NULL
      RETURNING bi.id
    )
    SELECT id FROM deleted
  `);
  if (!result.rows[0]) throw new Error("game_not_active");
  return true;
}

export async function addLivePlayer(
  gameId: string,
  deviceId: string,
  name: string,
  nickname: string | null,
): Promise<string> {
  const actorRow = await getActor(gameId, deviceId);
  const actor = requireActor(toActor(actorRow));
  assertCanManageRoster(actorRow.status, actor);
  const usedAvatars = await db
    .select({ avatarKey: players.avatarKey })
    .from(players)
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)));
  const avatarKey = firstAvailableAvatarKey(usedAvatars.map((row) => row.avatarKey));
  if (!avatarKey) throw new Error("אין עוד דמויות פנויות בשולחן");
  const personId = randomUUID();
  const playerId = randomUUID();
  const buyInId = randomUUID();
  const opId = randomUUID();
  const result = await db.execute<{ player_id: string }>(sql`
    WITH active_game AS (
      SELECT g.id, g.buy_in
      FROM ${games} g
      WHERE g.id = ${gameId}::uuid AND g.status = 'active'
      FOR UPDATE
    ), new_person AS (
      INSERT INTO ${people} (id, name, nickname)
      SELECT ${personId}::uuid, ${name}, ${nickname}
      FROM active_game
      RETURNING id
    ), new_player AS (
      INSERT INTO ${players} (id, game_id, person_id, name, avatar_key, seat_order, device_id, is_host)
      SELECT ${playerId}::uuid, active_game.id, new_person.id, ${name},
        ${avatarKey},
        coalesce((SELECT max(p.seat_order) + 1 FROM ${players} p WHERE p.game_id = active_game.id), 0),
        NULL, false
      FROM active_game CROSS JOIN new_person
      RETURNING id, game_id
    ), initial_buyin AS (
      INSERT INTO ${buyIns} (id, game_id, player_id, amount, kind, op_id, created_by_device)
      SELECT ${buyInId}::uuid, new_player.game_id, new_player.id, active_game.buy_in,
        'initial', ${opId}::uuid, ${deviceId}
      FROM active_game CROSS JOIN new_player
      RETURNING player_id
    )
    SELECT player_id FROM initial_buyin
  `);
  if (result.rows.length === 0) throw new Error("game_not_active");
  return playerId;
}

export async function deleteLivePlayer(
  gameId: string,
  playerId: string,
  deviceId: string,
): Promise<void> {
  const actorRow = await getActor(gameId, deviceId);
  const actor = requireActor(toActor(actorRow));
  assertCanManageRoster(actorRow.status, actor);
  const result = await db.execute<{ id: string }>(sql`
    WITH active_game AS (
      SELECT g.id
      FROM ${games} g
      WHERE g.id = ${gameId}::uuid AND g.status = 'active'
      FOR UPDATE
    ), target AS (
      SELECT p.id
      FROM ${players} p
      INNER JOIN active_game g ON g.id = p.game_id
      WHERE p.id = ${playerId}::uuid AND p.deleted_at IS NULL
    ), deleted_buyins AS (
      UPDATE ${buyIns} bi
      SET deleted_at = now()
      FROM target
      WHERE bi.player_id = target.id AND bi.game_id = ${gameId}::uuid AND bi.deleted_at IS NULL
    ), deleted_player AS (
      UPDATE ${players} p
      SET deleted_at = now()
      FROM target
      WHERE p.id = target.id
      RETURNING p.id
    )
    SELECT id FROM deleted_player
  `);
  if (result.rows.length === 0) throw new Error("game_not_active");
}

/**
 * v2: pick or clear a physical chair (plan item 10). A device may set only its own
 * seat; the host may set anyone's. Two live players in the same game may not hold
 * the same chair — enforced in the UPDATE statement itself so a race between two
 * phones tapping the same empty chair cannot seat them both.
 */
export async function setTableSeat(
  gameId: string,
  playerId: string,
  deviceId: string,
  tableSeat: number | null,
): Promise<void> {
  const actorRow = await getActor(gameId, deviceId);
  const actor = requireActor(toActor(actorRow));
  requireActiveGame(actorRow.status);
  const [target] = await db
    .select({ id: players.id, deletedAt: players.deletedAt })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.gameId, gameId)))
    .limit(1);
  if (!target) throw new Error("player_not_found");
  if (target.deletedAt !== null) throw new AuthzError("player_deleted");
  if (!actor.isHost && actor.id !== playerId) throw new AuthzError("not_your_seat");

  const result = await db.execute<{ id: string }>(sql`
    WITH conflict AS (
      SELECT id FROM ${players}
      WHERE game_id = ${gameId}::uuid
        AND deleted_at IS NULL
        AND id <> ${playerId}::uuid
        AND ${tableSeat}::integer IS NOT NULL
        AND table_seat = ${tableSeat}::integer
    )
    UPDATE ${players}
    SET table_seat = ${tableSeat}
    WHERE id = ${playerId}::uuid
      AND game_id = ${gameId}::uuid
      AND deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM conflict)
    RETURNING id
  `);
  if (result.rows.length > 0) return;

  const [conflict] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.gameId, gameId),
        isNull(players.deletedAt),
        tableSeat === null ? sql`false` : eq(players.tableSeat, tableSeat),
      ),
    )
    .limit(1);
  if (conflict) throw new Error("seat_taken");
  throw new Error("game_not_active");
}
