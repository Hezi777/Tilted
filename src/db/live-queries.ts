/** Queries and mutations used by the live game screen (spec section 5.4). */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, cashOuts, games, people, players } from "@/db/schema";
import {
  assertCanDeleteBuyIn,
  assertCanInsertBuyIn,
  assertCanManageRoster,
  requireActor,
  AuthzError,
  type ActorPlayer,
  type BuyInRow,
} from "@/lib/authz";
import { firstAvailableAvatarKey } from "@/lib/avatar";
import { getChipSet, type ChipSetDetail } from "@/db/chip-queries";
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
  /**
   * Every live buy-in at the table, newest first -- host only, empty for everyone else.
   *
   * The host is the one person who can correct anybody's row, and `feed` is capped at
   * twelve, so "ביטול ריביי אחרון" reported "אין ריביי לביטול" for any rebuy that had
   * scrolled off. Correcting a number has to be able to reach the whole evening, which
   * is the same reason `yourBuyIns` exists for your own seat.
   */
  allBuyIns: LiveFeedItem[];
  youId: string | null;
  isHost: boolean;
  /**
   * The chip set this table counts with, or null when it enters shekels directly.
   *
   * Read here and not only at settlement because an early exit counts a stack too --
   * the same stack, with the same chips on the same table. Without it the live screen
   * could only offer a bare number field while the cash-out screen showed the chips,
   * so the one player counting alone at 1am got the harder version of the job.
   */
  chipSet: ChipSetDetail | null;
  /**
   * How the viewer's own night ended, once they have stepped out -- null while they
   * are still playing.
   *
   * The live screen used to answer "how did I do?" with a "נסגר" badge where the
   * player's total had been: the one moment somebody most wants their number was the
   * moment the screen took it away. They are usually standing in the kitchen by then,
   * not on the cash-out screen the total had moved to.
   */
  yourResult: {
    totalIn: number;
    countedOut: number;
    adjustment: number;
    net: number;
  } | null;
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

/**
 * A fingerprint of everything the live screen draws, in one statement.
 *
 * The full read costs eight round trips, and the table spends most of an evening not
 * changing -- between two hands nothing moves for minutes, and every phone was paying
 * the full price twice a second to be told so. This is what the phones ask instead;
 * they only pay for the full read when the answer differs from the one they hold.
 *
 * It is a hash of state rather than a timestamp because `games` has no `updated_at`
 * and adding one would mean touching every write path to remember to bump it -- a rule
 * that silently rots the first time someone forgets. Counts and extremes over indexed
 * columns cannot be forgotten: a row written, soft-deleted, settled or claimed moves
 * one of them by construction. The caller still refreshes in full on a slow timer, so
 * a field this misses costs a few seconds of staleness, never a wrong number.
 *
 * The two subqueries take the game id directly rather than correlating against `g`.
 * A correlated aggregate inside a LATERAL here resolves to the outer query level and
 * Postgres rejects it ("aggregate functions are not allowed in FROM clause of their
 * own query level"); the integration test is what caught that, and this shape is why
 * it stays uncorrelated.
 */
export async function getLiveGameVersion(gameId: string): Promise<string | null> {
  const result = await db.execute<{ version: string }>(sql`
    WITH b AS (
      SELECT count(*)::text || '/' || coalesce(max(created_at)::text, '')
        || '/' || count(deleted_at)::text
        || '/' || coalesce(max(deleted_at)::text, '') AS f
      FROM buy_ins WHERE game_id = ${gameId}::uuid
    ), p AS (
      -- No max(created_at) here: the players table has no created_at column, and
      -- count(*) already moves when a seat is added.
      SELECT count(*)::text
        || '/' || count(deleted_at)::text
        || '/' || coalesce(max(deleted_at)::text, '')
        || '/' || count(settled_at)::text
        || '/' || coalesce(max(settled_at)::text, '')
        -- A seat being claimed sets device_id and changes nothing else, so the count
        -- of claimed seats has to be in here or "someone just took their seat" is the
        -- one change the table would not see.
        || '/' || count(device_id)::text AS f
      FROM players WHERE game_id = ${gameId}::uuid
    )
    SELECT md5(
      g.status::text
      || coalesce(g.name, '')
      || g.buy_in::text
      || g.rebuy_amount::text
      || coalesce(g.planned_end_at::text, '')
      || coalesce(g.location, '')
      || coalesce(g.notes, '')
      || g.mismatch_kind::text
      || coalesce(g.mismatch_amount::text, '')
      || coalesce(g.chip_set_id::text, '')
      || g.result_entry::text
      || b.f
      || p.f
    ) AS version
    FROM ${games} g, b, p
    WHERE g.id = ${gameId}::uuid
  `);
  return result.rows[0]?.version ?? null;
}

/**
 * Reads a live game by UUID, with the requesting device's seat marked as `isYou`.
 *
 * Every phone at the table polls this, so its cost is the poll interval's floor.
 * Neon-over-HTTP bills a full round trip per statement, and these used to run one
 * after another -- seven waits for queries that do not depend on each other. They
 * now go out in two waves: everything that only needs the game id, then the three
 * that need to know which seat is the viewer's. Nothing about the data changed.
 */
export async function getLiveGame(
  gameId: string,
  deviceId: string,
): Promise<LiveGame | null> {
  const [[game], playerRows, feedRows] = await Promise.all([
    db.select().from(games).where(eq(games.id, gameId)),
    db
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
      .orderBy(asc(players.seatOrder)),
    db
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
      .limit(12),
  ]);
  if (!game) return null;

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
  const viewerIsHost = playersOut.some((player) => player.isYou && player.isHost);
  const [allRows, yourRows, chipSet, yourCashOutRows] = await Promise.all([
    viewerIsHost
      ? db
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
          // The one query here with no ceiling: it returned every buy-in of the night,
          // to the host, on every poll, growing all evening. It feeds the correction
          // drawer, which shows one player's rebuys -- 200 is far past what a home
          // table reaches (eight seats would need twenty-five rebuys each) and turns
          // an unbounded scan into a bounded one.
          .limit(200)
      : [],
    youRow
      ? db
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
      : [],
    game.chipSetId ? getChipSet(game.chipSetId) : null,
    // Your own counted stack, once you have stepped out. Only fetched for a seat that
    // has actually settled, so an ordinary poll on a live seat pays nothing for it.
    youRow?.isSettled
      ? db
          .select({ amount: cashOuts.amount, adjustment: cashOuts.adjustment })
          .from(cashOuts)
          .where(
            and(eq(cashOuts.gameId, gameId), eq(cashOuts.playerId, youRow.id)),
          )
          .limit(1)
      : [],
  ]);

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
    allBuyIns: allRows.map((row) => ({
      id: row.id,
      opId: row.opId,
      playerId: row.playerId,
      playerName: row.playerName,
      amount: row.amount,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
    })),
    youId: youRow?.id ?? null,
    isHost: viewerIsHost,
    chipSet,
    yourResult: yourCashOutRows[0]
      ? {
          totalIn: youRow?.totalIn ?? 0,
          // The honest count and the mismatch correction stay separate in the table,
          // and they stay separate here: the number the player actually counted is the
          // one they will argue about, so it is the one shown.
          countedOut: yourCashOutRows[0].amount,
          adjustment: yourCashOutRows[0].adjustment,
          net: Number(
            sumAgorot([
              agorot(yourCashOutRows[0].amount),
              agorot(yourCashOutRows[0].adjustment),
              agorot(-(youRow?.totalIn ?? 0)),
            ]),
          ),
        }
      : null,
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

  // A rebuy is the table's agreed stake, so it is also the ceiling. "ריביי בסכום אחר"
  // exists for the halves and the odd smaller top-up, not for entering more than the
  // night's rebuy -- nobody buys in double because they feel like it. Enforced here
  // rather than only in the form, because the amount arrives from a client. A typo of
  // ₪5,000 for ₪50 used to land in the pot and move everybody's settlement.
  const [gameRow] = await db
    .select({ rebuyAmount: games.rebuyAmount })
    .from(games)
    .where(eq(games.id, input.gameId))
    .limit(1);
  if (gameRow && input.amount > gameRow.rebuyAmount) {
    throw new AuthzError("rebuy_above_limit");
  }

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
        -- Never a seat that has already counted out. Removing one soft-deleted its
        -- buy-ins and left its cash_outs row behind, so the money that player won or
        -- lost simply left the books: the night still closed and told the host he had
        -- broken even while he was actually down by their net. The predicate is in the
        -- statement, not around it, so a cash-out committing in the same moment cannot
        -- slip between a check and a write.
        AND NOT EXISTS (
          SELECT 1 FROM ${cashOuts} co
          WHERE co.player_id = p.id AND co.game_id = g.id
        )
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
  if (result.rows.length === 0) {
    // Nothing matched. Say which of the two reasons it was, because "remove" failing
    // silently on a seat the host can see is worse than either answer.
    const [settled] = await db
      .select({ id: cashOuts.id })
      .from(cashOuts)
      .where(and(eq(cashOuts.playerId, playerId), eq(cashOuts.gameId, gameId)))
      .limit(1);
    if (settled) throw new AuthzError("player_settled");
    throw new Error("game_not_active");
  }
}
