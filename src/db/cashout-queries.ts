/**
 * Cash-out and game-lifecycle queries for milestone 6.
 *
 * Neon's HTTP driver does not support interactive transactions. Any operation
 * that changes more than one row therefore uses db.batch(), which Neon executes
 * as one atomic Postgres transaction (the same pattern used by game creation).
 */

import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, cashOuts, games, players } from "@/db/schema";
import {
  assertCanCashOutEarly,
  assertCanSettle,
  requireActor,
  type ActorPlayer,
} from "@/lib/authz";
import {
  agorot,
  MAX_AGOROT,
} from "@/lib/money";
import {
  countedTotal,
  mismatchDelta,
  potTotal,
  resolveMismatch,
  type MismatchResolution,
  type PlayerLedger,
} from "@/lib/settlement";

export interface CashoutPlayer {
  id: string;
  name: string;
  avatarKey: string | null;
  seatOrder: number;
  settledAt: string | null;
  totalIn: number;
  buyInCount: number;
  cashOut: number | null;
  adjustment: number;
}

export interface CashoutState {
  id: string;
  name: string | null;
  status: "active" | "settling" | "closed" | "cancelled";
  createdAt: string;
  closedAt: string | null;
  pot: number;
  counted: number;
  difference: number;
  mismatchKind: "none" | "recount" | "split" | "assigned";
  mismatchAmount: number | null;
  mismatchPlayerId: string | null;
  players: CashoutPlayer[];
}

interface GameRow {
  id: string;
  name: string | null;
  status: CashoutState["status"];
  createdAt: Date;
  closedAt: Date | null;
  mismatchKind: CashoutState["mismatchKind"];
  mismatchAmount: number | null;
  mismatchPlayerId: string | null;
}

interface ActorLookup {
  game: GameRow;
  actor: ActorPlayer;
}

function toLedger(player: CashoutPlayer): PlayerLedger {
  return {
    playerId: player.id,
    seatOrder: player.seatOrder,
    totalIn: agorot(player.totalIn),
    cashOut: player.cashOut === null ? null : agorot(player.cashOut),
    adjustment: agorot(player.adjustment),
  };
}

async function getGameRow(gameId: string): Promise<GameRow | null> {
  const [row] = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      createdAt: games.createdAt,
      closedAt: games.closedAt,
      mismatchKind: games.mismatchKind,
      mismatchAmount: games.mismatchAmount,
      mismatchPlayerId: games.mismatchPlayerId,
    })
    .from(games)
    .where(eq(games.id, gameId));

  return row
    ? {
        ...row,
        status: row.status as GameRow["status"],
        mismatchKind: row.mismatchKind as GameRow["mismatchKind"],
      }
    : null;
}

/** Loads a game and the device's seat for server-side host authorization. */
export async function getActorForGame(
  gameId: string,
  deviceId: string,
): Promise<ActorLookup | null> {
  const game = await getGameRow(gameId);
  if (!game) return null;

  const [row] = await db
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
    );

  return row ? { game, actor: requireActor(row) } : null;
}

/** Complete cash-out view. Deleted seats are deliberately absent from settlement. */
export async function getCashoutState(
  gameId: string,
): Promise<CashoutState | null> {
  const game = await getGameRow(gameId);
  if (!game) return null;

  const playerRows = await db
    .select({
      id: players.id,
      name: players.name,
      avatarKey: players.avatarKey,
      seatOrder: players.seatOrder,
      settledAt: players.settledAt,
      cashOut: cashOuts.amount,
      adjustment: cashOuts.adjustment,
    })
    .from(players)
    .leftJoin(
      cashOuts,
      and(
        eq(cashOuts.playerId, players.id),
        eq(cashOuts.gameId, gameId),
      ),
    )
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)))
    .orderBy(asc(players.seatOrder));

  const buyInRows = await db
    .select({
      playerId: buyIns.playerId,
      totalIn: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
      buyInCount: sql<number>`count(${buyIns.id})`,
    })
    .from(buyIns)
    .where(and(eq(buyIns.gameId, gameId), isNull(buyIns.deletedAt)))
    .groupBy(buyIns.playerId);
  const totals = new Map(
    buyInRows.map((row) => [row.playerId, { totalIn: Number(row.totalIn), buyInCount: Number(row.buyInCount) }]),
  );

  const resultPlayers: CashoutPlayer[] = playerRows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarKey: row.avatarKey,
    seatOrder: row.seatOrder,
    settledAt: row.settledAt?.toISOString() ?? null,
    totalIn: totals.get(row.id)?.totalIn ?? 0,
    buyInCount: totals.get(row.id)?.buyInCount ?? 0,
    cashOut: row.cashOut === null ? null : Number(row.cashOut),
    adjustment: Number(row.adjustment ?? 0),
  }));
  const ledgers = resultPlayers.map(toLedger);

  return {
    id: game.id,
    name: game.name,
    status: game.status,
    createdAt: game.createdAt.toISOString(),
    closedAt: game.closedAt?.toISOString() ?? null,
    pot: Number(potTotal(ledgers)),
    counted: Number(countedTotal(ledgers)),
    difference: mismatchDelta(ledgers),
    mismatchKind: game.mismatchKind,
    mismatchAmount: game.mismatchAmount,
    mismatchPlayerId: game.mismatchPlayerId,
    players: resultPlayers,
  };
}

function assertAmount(amount: number): asserts amount is number {
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AGOROT) {
    throw new Error("סכום לא תקין");
  }
}

/**
 * Saves one count. A raw edit clears every old adjustment and mismatch marker,
 * forcing the host to resolve the newly observed difference again.
 */
export async function saveCashout(
  gameId: string,
  deviceId: string,
  playerId: string,
  amount: number,
  early: boolean,
): Promise<CashoutState> {
  assertAmount(amount);
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");

  const [target] = await db
    .select({
      id: players.id,
      settledAt: players.settledAt,
      deletedAt: players.deletedAt,
    })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.gameId, gameId)));
  if (!target || target.deletedAt !== null) throw new Error("השחקן לא נמצא");

  if (access.game.status === "active") {
    if (!early) throw new Error("יש לסיים את המשחק לפני ספירת הקופה");
    assertCanCashOutEarly(access.game.status, access.actor, target);

    // The INSERT is conditional on active status and a live player. This keeps an
    // early cash-out from landing after a concurrent active -> settling transition.
    const saved = await db.execute<{ id: string }>(sql`
      WITH active_game AS (
        SELECT id FROM games
        WHERE id = ${gameId}::uuid AND status = 'active'
        FOR UPDATE
      ), saved AS (
        INSERT INTO cash_outs (id, game_id, player_id, amount, adjustment)
        SELECT gen_random_uuid(), g.id, p.id, ${amount}, 0
        FROM active_game g
        JOIN players p ON p.game_id = g.id
        WHERE p.id = ${playerId}::uuid
          AND p.deleted_at IS NULL
        ON CONFLICT (game_id, player_id)
        DO UPDATE SET amount = EXCLUDED.amount, adjustment = 0
        RETURNING player_id
      )
      UPDATE players p
      SET settled_at = coalesce(p.settled_at, now())
      FROM saved
      WHERE p.id = saved.player_id
      RETURNING p.id
    `);
    if (!saved.rows[0]) throw new Error("השחקן או המשחק כבר לא פעילים");
  } else {
    assertCanSettle(access.game.status, access.actor);
    // Guard every write by settling status. If close wins a race first, this
    // statement inserts nothing and cannot edit an already closed game.
    const saved = await db.execute<{ id: string }>(sql`
      WITH settling_game AS (
        SELECT id FROM games
        WHERE id = ${gameId}::uuid AND status = 'settling'
        FOR UPDATE
      ), saved AS (
        INSERT INTO cash_outs (id, game_id, player_id, amount, adjustment)
        SELECT gen_random_uuid(), g.id, p.id, ${amount}, 0
        FROM settling_game g
        JOIN players p ON p.game_id = g.id
        WHERE p.id = ${playerId}::uuid
          AND p.deleted_at IS NULL
        ON CONFLICT (game_id, player_id)
        DO UPDATE SET amount = EXCLUDED.amount, adjustment = 0
        RETURNING game_id
      ), cleared AS (
        UPDATE cash_outs
        SET adjustment = 0
        WHERE game_id IN (SELECT game_id FROM saved)
        RETURNING game_id
      )
      UPDATE games
      SET mismatch_kind = 'none', mismatch_amount = NULL, mismatch_player_id = NULL
      WHERE id IN (SELECT game_id FROM cleared)
      RETURNING id
    `);
    if (!saved.rows[0]) throw new Error("השחקן או המשחק כבר לא פעילים");
  }

  const state = await getCashoutState(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  if (early && state.status !== "active") {
    throw new Error("המשחק עבר לספירה");
  }
  if (!early && state.status !== "settling") {
    throw new Error("המשחק כבר נסגר");
  }
  return state;
}

/** Replaces every cash-out adjustment in one atomic batch. */
export async function applyMismatchResolution(
  gameId: string,
  deviceId: string,
  resolution: MismatchResolution | { kind: "recount" },
): Promise<CashoutState> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");
  assertCanSettle(access.game.status, access.actor);
  if (access.game.status !== "settling") {
    throw new Error("יש לסיים את המשחק לפני פתרון ההפרש");
  }

  const state = await getCashoutState(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  if (state.players.some((player) => player.cashOut === null)) {
    throw new Error("יש להזין ספירה לכל השחקנים");
  }

  const ledgers = state.players.map(toLedger);
  const delta = mismatchDelta(ledgers);
  if (resolution.kind === "split" || resolution.kind === "assign") {
    const replacement = resolveMismatch(ledgers, resolution);
    const writes = state.players.map((player) =>
      db
        .update(cashOuts)
        .set({ adjustment: Number(replacement.get(player.id) ?? agorot(0)) })
        .where(
          and(
            eq(cashOuts.gameId, gameId),
            eq(cashOuts.playerId, player.id),
            exists(
              db
                .select({ id: games.id })
                .from(games)
                .where(and(eq(games.id, gameId), eq(games.status, "settling"))),
            ),
          ),
        ),
    );
    const gameUpdate = db
      .update(games)
      .set({
        mismatchKind: resolution.kind === "split" ? "split" : "assigned",
        mismatchAmount: delta,
        mismatchPlayerId:
          resolution.kind === "assign" ? resolution.playerId : null,
      })
      .where(and(eq(games.id, gameId), eq(games.status, "settling")));
    await db.batch([
      db.execute(sql`
        SELECT id FROM ${games}
        WHERE id = ${gameId}::uuid AND status = 'settling'
        FOR UPDATE
      `),
      gameUpdate,
      ...writes,
    ]);
  } else {
    await db.batch([
      db.execute(sql`
        SELECT id FROM ${games}
        WHERE id = ${gameId}::uuid AND status = 'settling'
        FOR UPDATE
      `),
      db
        .update(cashOuts)
        .set({ adjustment: 0 })
        .where(
          and(
            eq(cashOuts.gameId, gameId),
            exists(
              db
                .select({ id: games.id })
                .from(games)
                .where(and(eq(games.id, gameId), eq(games.status, "settling"))),
            ),
          ),
        ),
      db
        .update(games)
        .set({
          mismatchKind: "recount",
          mismatchAmount: delta,
          mismatchPlayerId: null,
        })
        .where(and(eq(games.id, gameId), eq(games.status, "settling"))),
    ]);
  }

  const next = await getCashoutState(gameId);
  if (!next) throw new Error("המשחק לא נמצא");
  if (next.status !== "settling") throw new Error("המשחק כבר נסגר");
  return next;
}

/** Atomically moves an active game to settling; a concurrent close becomes a no-op. */
export async function beginSettling(
  gameId: string,
  deviceId: string,
): Promise<CashoutState> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");
  assertCanSettle(access.game.status, access.actor);
  if (access.game.status !== "active") throw new Error("המשחק כבר נסגר");

  const [changed] = await db
    .update(games)
    .set({ status: "settling" })
    .where(and(eq(games.id, gameId), eq(games.status, "active")))
    .returning({ id: games.id });
  if (!changed) throw new Error("המשחק כבר עבר לספירה");

  const state = await getCashoutState(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  return state;
}

/**
 * Closes only a complete, balanced settling game. All predicates are in the
 * conditional UPDATE so cash-out edits cannot make a closed ledger unbalanced.
 */
export async function closeSettlingGame(
  gameId: string,
  deviceId: string,
): Promise<CashoutState> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");
  assertCanSettle(access.game.status, access.actor);
  if (access.game.status !== "settling") throw new Error("המשחק אינו בספירה");

  await db.execute(sql`
    UPDATE games g
    SET status = 'closed', closed_at = now()
    WHERE g.id = ${gameId}::uuid
      AND g.status = 'settling'
      AND NOT EXISTS (
        SELECT 1 FROM players p
        WHERE p.game_id = g.id
          AND p.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM cash_outs co
            WHERE co.game_id = g.id AND co.player_id = p.id
          )
      )
      AND coalesce((
        SELECT sum(co.amount + co.adjustment)
        FROM cash_outs co WHERE co.game_id = g.id
      ), 0) = coalesce((
        SELECT sum(bi.amount)
        FROM buy_ins bi
        JOIN players p ON p.id = bi.player_id
        WHERE bi.game_id = g.id
          AND bi.deleted_at IS NULL
          AND p.deleted_at IS NULL
      ), 0)
  `);

  const state = await getCashoutState(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  if (state.status !== "closed") {
    throw new Error("אי אפשר לסגור לפני שכל הסכומים מאוזנים");
  }
  return state;
}
