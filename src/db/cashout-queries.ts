/**
 * Cash-out and game-lifecycle queries for milestone 6.
 *
 * Neon's HTTP driver does not support interactive transactions. Any operation
 * that changes more than one row therefore uses db.batch(), which Neon executes
 * as one atomic Postgres transaction (the same pattern used by game creation).
 */

import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  buyIns,
  cashOutChips,
  cashOuts,
  games,
  people,
  players,
  seatMembers,
} from "@/db/schema";
import { getChipSet, type ChipSetDetail } from "@/db/chip-queries";
import {
  assertCanCashOutEarly,
  assertCanEnterResult,
  assertCanHandoffHost,
  assertCanSettle,
  requireActor,
  AuthzError,
  type ActorPlayer,
  type ResultEntry,
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
import { totalAgorotForCounts, type ChipCounts } from "@/lib/chips";

export interface CashoutPlayer {
  id: string;
  personId: string | null;
  name: string;
  avatarKey: string | null;
  seatOrder: number;
  settledAt: string | null;
  totalIn: number;
  buyInCount: number;
  cashOut: number | null;
  adjustment: number;
  chipCounts: ChipCounts;
  /** The seat's own record of "finished counting" (plan item 5). Never a substitute
   * for `cashOut !== null` -- both are required to close. */
  countDoneAt: string | null;
  /** Who actually typed the current `cashOut` (plan item 3): a Person, so a shared
   * seat's members are told apart even though they share `id` above. */
  enteredByPersonId: string | null;
  enteredByName: string | null;
  /** Other Persons attached to this seat (plan item 9), excluding the primary
   * occupant, for display only -- money is always attributed to `personId` alone. */
  memberNames: string[];
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
  chipSet: ChipSetDetail | null;
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
  chipSetId: string | null;
  resultEntry: ResultEntry;
}

interface ActorLookup {
  game: GameRow;
  actor: ActorPlayer;
}

export interface SeatActorRow {
  id: string;
  isHost: boolean;
  deviceId: string | null;
  settledAt: Date | null;
  deletedAt: Date | null;
}

/**
 * Resolves who a Person acts as in this game.
 *
 * Their own seat first, matched the way every write already has -- through
 * `players.device_id`, which despite its name has held the signed-in Person's id since
 * M10 (see `src/lib/auth/session.ts`). Only if that fails, a seat they are attached to
 * as a shared member (plan item 9).
 *
 * **A member resolved this way is never the host, regardless of whose seat it is.**
 * `seat_members` confers seat ownership and never `players.is_host` -- resolving a
 * member through the seat's own Player row would otherwise hand them the seat's real
 * `is_host` flag and, with it, every host-only action in this file.
 */
export async function resolveSeatActor(
  gameId: string,
  personId: string,
): Promise<SeatActorRow | null> {
  const [own] = await db
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
        eq(players.deviceId, personId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);
  if (own) return own;

  const [member] = await db
    .select({
      id: players.id,
      deviceId: players.deviceId,
      settledAt: players.settledAt,
      deletedAt: players.deletedAt,
    })
    .from(seatMembers)
    .innerJoin(players, eq(players.id, seatMembers.playerId))
    .where(
      and(
        eq(seatMembers.gameId, gameId),
        eq(seatMembers.personId, personId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);
  if (!member) return null;
  return { ...member, isHost: false };
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
      chipSetId: games.chipSetId,
      resultEntry: games.resultEntry,
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

  const row = await resolveSeatActor(gameId, deviceId);
  return row ? { game, actor: requireActor(row) } : null;
}

/** Complete cash-out view. Deleted seats are deliberately absent from settlement. */
export async function getCashoutState(
  gameId: string,
): Promise<CashoutState | null> {
  const enteredBy = alias(people, "entered_by_person");
  // Five reads with no dependency between them, on a screen every phone polls while
  // the host counts chips out loud. One round trip instead of five.
  const [game, playerRows, buyInRows, chipCountRows, memberRows] = await Promise.all([
    getGameRow(gameId),
    db
      .select({
        id: players.id,
        personId: players.personId,
        name: players.name,
        avatarKey: players.avatarKey,
        seatOrder: players.seatOrder,
        settledAt: players.settledAt,
        countDoneAt: players.countDoneAt,
        cashOut: cashOuts.amount,
        adjustment: cashOuts.adjustment,
        enteredByPersonId: cashOuts.enteredByPersonId,
        enteredByName: enteredBy.name,
      })
      .from(players)
      .leftJoin(
        cashOuts,
        and(
          eq(cashOuts.playerId, players.id),
          eq(cashOuts.gameId, gameId),
        ),
      )
      .leftJoin(enteredBy, eq(enteredBy.id, cashOuts.enteredByPersonId))
      .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)))
      .orderBy(asc(players.seatOrder)),
    db
      .select({
        playerId: buyIns.playerId,
        totalIn: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
        buyInCount: sql<number>`count(${buyIns.id})`,
      })
      .from(buyIns)
      .where(and(eq(buyIns.gameId, gameId), isNull(buyIns.deletedAt)))
      .groupBy(buyIns.playerId),
    db
      .select({
        playerId: cashOuts.playerId,
        denominationId: cashOutChips.denominationId,
        count: cashOutChips.count,
      })
      .from(cashOutChips)
      .innerJoin(cashOuts, eq(cashOutChips.cashOutId, cashOuts.id))
      .where(eq(cashOuts.gameId, gameId)),
    // Attached members other than the seat's own occupant (plan item 9), for display.
    db
      .select({
        playerId: seatMembers.playerId,
        name: people.name,
        personId: seatMembers.personId,
      })
      .from(seatMembers)
      .innerJoin(people, eq(people.id, seatMembers.personId))
      .innerJoin(players, eq(players.id, seatMembers.playerId))
      .where(
        and(
          eq(seatMembers.gameId, gameId),
          sql`${seatMembers.personId} IS DISTINCT FROM ${players.personId}`,
        ),
      ),
  ]);
  if (!game) return null;

  const totals = new Map(
    buyInRows.map((row) => [row.playerId, { totalIn: Number(row.totalIn), buyInCount: Number(row.buyInCount) }]),
  );

  const countsByPlayer = new Map<string, ChipCounts>();
  for (const row of chipCountRows) {
    const counts = countsByPlayer.get(row.playerId) ?? {};
    counts[row.denominationId] = row.count;
    countsByPlayer.set(row.playerId, counts);
  }

  const membersByPlayer = new Map<string, string[]>();
  for (const row of memberRows) {
    const names = membersByPlayer.get(row.playerId) ?? [];
    names.push(row.name);
    membersByPlayer.set(row.playerId, names);
  }

  const resultPlayers: CashoutPlayer[] = playerRows.map((row) => ({
    id: row.id,
    personId: row.personId,
    name: row.name,
    avatarKey: row.avatarKey,
    seatOrder: row.seatOrder,
    settledAt: row.settledAt?.toISOString() ?? null,
    countDoneAt: row.countDoneAt?.toISOString() ?? null,
    totalIn: totals.get(row.id)?.totalIn ?? 0,
    buyInCount: totals.get(row.id)?.buyInCount ?? 0,
    cashOut: row.cashOut === null ? null : Number(row.cashOut),
    adjustment: Number(row.adjustment ?? 0),
    chipCounts: countsByPlayer.get(row.id) ?? {},
    enteredByPersonId: row.enteredByPersonId,
    enteredByName: row.enteredByName,
    memberNames: membersByPlayer.get(row.id) ?? [],
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
    chipSet: game.chipSetId ? await getChipSet(game.chipSetId) : null,
    players: resultPlayers,
  };
}

function assertAmount(amount: number): asserts amount is number {
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AGOROT) {
    throw new Error("סכום לא תקין");
  }
}

const MAX_CHIP_COUNT = 1_000_000;

export type CashoutEntry =
  | { amount: number; chipCounts?: never }
  | { amount?: never; chipCounts: ChipCounts };

async function resolveCashoutEntry(
  chipSetId: string | null,
  entry: CashoutEntry,
): Promise<{ amount: number; chipCounts: ChipCounts | null }> {
  if (entry.chipCounts === undefined) {
    assertAmount(entry.amount);
    return { amount: entry.amount, chipCounts: null };
  }
  if (!chipSetId) throw new Error("לא הוגדרה חבילת ז׳יטונים למשחק");

  const chipSet = await getChipSet(chipSetId);
  if (!chipSet) throw new Error("חבילת הז׳יטונים לא נמצאה");
  const denominationIds = new Set(
    chipSet.denominations.map((denomination) => denomination.id),
  );
  for (const [denominationId, count] of Object.entries(entry.chipCounts)) {
    if (!denominationIds.has(denominationId)) {
      throw new Error("ז׳יטון לא שייך לחבילה של המשחק");
    }
    if (!Number.isInteger(count) || count < 0 || count > MAX_CHIP_COUNT) {
      throw new Error("כמות ז׳יטונים לא תקינה");
    }
  }

  const canonicalCounts = Object.fromEntries(
    chipSet.denominations
      .map((denomination) => [
        denomination.id,
        entry.chipCounts[denomination.id] ?? 0,
      ] as const)
      .filter(([, count]) => count > 0),
  );
  const amount = Number(
    totalAgorotForCounts(
      chipSet.denominations.map((denomination) => ({
        id: denomination.id,
        value: agorot(denomination.value),
      })),
      canonicalCounts,
    ),
  );
  assertAmount(amount);
  return { amount, chipCounts: canonicalCounts };
}

function insertChipCountsSql(chipCounts: ChipCounts | null) {
  const rows = Object.entries(chipCounts ?? {});
  if (rows.length === 0) {
    return sql`SELECT NULL::uuid AS id WHERE false`;
  }
  const values = sql.join(
    rows.map(
      ([denominationId, count]) =>
        sql`(${denominationId}::uuid, ${count}::integer)`,
    ),
    sql.raw(", "),
  );
  return sql`
    INSERT INTO cash_out_chips (id, cash_out_id, denomination_id, count)
    SELECT gen_random_uuid(), saved.id, chip_value.denomination_id, chip_value.count
    FROM saved
    CROSS JOIN (VALUES ${values}) AS chip_value(denomination_id, count)
    CROSS JOIN (SELECT count(*) FROM deleted_counts) AS deletion_barrier
    RETURNING id
  `;
}

/**
 * Saves one count. A raw edit clears every old adjustment and mismatch marker,
 * forcing the host to resolve the newly observed difference again.
 *
 * `done` is the seat's own "סיימתי לספור" intent (plan item 5), persisted in the same
 * statement as the count -- never a separate write, or a window opens where close sees
 * the new amount with the old done flag still set. `false` is not just "not yet
 * pressed the button": every autosave from an in-progress edit calls this with
 * `done: false`, which is what re-opens a seat that had already finished once an edit
 * changes it again.
 *
 * A frozen seat (an early exit, or a host override of one) is the one exception: it
 * always ends up done, because the player who left cannot come back later to press
 * the button, and `done: false` must not be able to re-block a close on their behalf.
 */
export async function saveCashout(
  gameId: string,
  deviceId: string,
  playerId: string,
  entry: CashoutEntry,
  early: boolean,
  // Defaults to true for callers below the HTTP route (existing tests, and any other
  // server code that writes a final count directly): writing a number has always
  // meant "this is the result" to them. The route itself always passes an explicit
  // value -- an in-progress autosave sends `false`, and only the "סיימתי לספור"
  // action sends `true` -- so this default never reaches a real user's tap.
  done: boolean = true,
): Promise<CashoutState> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");
  const { amount, chipCounts } = await resolveCashoutEntry(
    access.game.chipSetId,
    entry,
  );
  const insertedChipCounts = insertChipCountsSql(chipCounts);
  // `deviceId` is the signed-in Person's id (see resolveSeatActor) -- the actual
  // identity that typed this number, which is not always `access.actor.id`'s own
  // Person: a shared-seat member's actor resolves to the *seat's* player id, and
  // `players.device_id` on that row is the primary occupant's, not this caller's.
  const enteredByPersonId = deviceId;

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
    // An early exit always finishes counting in the same statement -- the departing
    // player cannot come back to press "סיימתי לספור" once they are gone.
    const saved = await db.execute<{ id: string }>(sql`
      WITH active_game AS (
        SELECT id FROM games
        WHERE id = ${gameId}::uuid AND status = 'active'
        FOR UPDATE
      ), saved AS (
        INSERT INTO cash_outs (id, game_id, player_id, amount, adjustment, entered_by_person_id)
        SELECT gen_random_uuid(), g.id, p.id, ${amount}, 0, ${enteredByPersonId}::uuid
        FROM active_game g
        JOIN players p ON p.game_id = g.id
        WHERE p.id = ${playerId}::uuid
          AND p.deleted_at IS NULL
        ON CONFLICT (game_id, player_id)
        DO UPDATE SET
          amount = EXCLUDED.amount,
          adjustment = 0,
          entered_by_person_id = EXCLUDED.entered_by_person_id
        RETURNING id, player_id
      ), deleted_counts AS (
        DELETE FROM cash_out_chips
        WHERE cash_out_id IN (SELECT id FROM saved)
        RETURNING id
      ), inserted_counts AS (
        ${insertedChipCounts}
      ), settled AS (
        UPDATE players p
        SET settled_at = coalesce(p.settled_at, now()),
            count_done_at = coalesce(p.count_done_at, now())
        FROM saved
        WHERE p.id = saved.player_id
        RETURNING p.id
      )
      SELECT id FROM saved
    `);
    if (!saved.rows[0]) throw new Error("השחקן או המשחק כבר לא פעילים");
  } else {
    assertCanEnterResult(access.game.status, access.actor, target);
    // Guard every write by settling status. If close wins a race first, this
    // statement inserts nothing and cannot edit an already closed game. The
    // settled_at check repeats what assertCanEnterResult already checked, for the
    // same reason every other mutation here repeats its guard in the statement --
    // a JS-side check before the query cannot stop a race with another request that
    // reads its authorization a moment earlier, and an early-exit's frozen result
    // must never be overwritten by an incidental write during finalization. The
    // host's own deliberate override is the one case this lets through, and it must
    // not be able to clear a frozen seat's done flag either -- see `count_done_at`
    // below.
    const saved = await db.execute<{ id: string }>(sql`
      WITH settling_game AS (
        SELECT id FROM games
        WHERE id = ${gameId}::uuid AND status = 'settling'
        FOR UPDATE
      ), saved AS (
        INSERT INTO cash_outs (id, game_id, player_id, amount, adjustment, entered_by_person_id)
        SELECT gen_random_uuid(), g.id, p.id, ${amount}, 0, ${enteredByPersonId}::uuid
        FROM settling_game g
        JOIN players p ON p.game_id = g.id
        WHERE p.id = ${playerId}::uuid
          AND p.deleted_at IS NULL
          AND (p.settled_at IS NULL OR ${access.actor.isHost})
        ON CONFLICT (game_id, player_id)
        DO UPDATE SET
          amount = EXCLUDED.amount,
          adjustment = 0,
          entered_by_person_id = EXCLUDED.entered_by_person_id
        RETURNING id, game_id, player_id
      ), deleted_counts AS (
        DELETE FROM cash_out_chips
        WHERE cash_out_id IN (SELECT id FROM saved)
        RETURNING id
      ), inserted_counts AS (
        ${insertedChipCounts}
      ), marked_done AS (
        -- Cleared in the same statement as the edit: a raw edit that is not the
        -- explicit "סיימתי לספור" action re-opens the seat (done: false), and a
        -- frozen seat (early exit, or the host's override of one) can never go back
        -- to not-done -- its player is not coming back to reconfirm.
        UPDATE players p
        SET count_done_at = CASE
          WHEN p.settled_at IS NOT NULL THEN coalesce(p.count_done_at, now())
          WHEN ${done}::boolean THEN now()
          ELSE NULL
        END
        FROM saved
        WHERE p.id = saved.player_id
        RETURNING p.id
      ), cleared AS (
        UPDATE cash_outs
        SET adjustment = 0
        WHERE game_id IN (SELECT game_id FROM saved)
        RETURNING game_id
      ), cleared_game AS (
        UPDATE games
        SET mismatch_kind = 'none', mismatch_amount = NULL, mismatch_player_id = NULL
        WHERE id IN (SELECT game_id FROM cleared)
        RETURNING id
      )
      SELECT id FROM saved
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
  // Completion, not row existence (plan item 5): a seat can carry a stale
  // `cash_outs` row from before its last edit re-opened it, and allocating a gap
  // over an unconfirmed draft is exactly what this gate exists to prevent.
  if (state.players.some((player) => player.countDoneAt === null)) {
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
 * Puts a settling game back on the table.
 *
 * "סיום לכולם" sits a thumb's width from "יציאה רק שלי" and ends the playable phase
 * for everybody, so a mis-tap used to cost the rest of the night: `requireActiveGame`
 * then refuses every rebuy, and nothing anywhere moved a game back to active.
 *
 * Seats already counted are left exactly as they are. They keep `settled_at`, so
 * `assertCanInsertBuyIn` goes on refusing rebuys for them and their frozen number
 * cannot move; only the seats still playing become writable again. That is why this
 * needs no "nobody has been counted yet" condition -- reopening a half-counted night
 * is the honest description of a table where three people cashed out and the rest
 * kept playing.
 */
export async function reopenSettlingGame(
  gameId: string,
  deviceId: string,
): Promise<CashoutState> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");
  assertCanSettle(access.game.status, access.actor);

  // The status flip and the done-flag reset are one statement: play resuming and a
  // stale done flag surviving into the next pass must not be two separately-failable
  // writes. Early-settled seats (`settled_at IS NOT NULL`) are the exception -- they
  // keep both their counted amount and their done flag, same as their frozen number.
  // The status predicate on `reopened` is what keeps two phones racing from both
  // reopening, and a game someone just closed from being silently reopened.
  const result = await db.execute<{ id: string }>(sql`
    WITH reopened AS (
      UPDATE games
      SET status = 'active'
      WHERE id = ${gameId}::uuid AND status = 'settling'
      RETURNING id
    ), cleared AS (
      UPDATE players p
      SET count_done_at = NULL
      FROM reopened
      WHERE p.game_id = reopened.id
        AND p.settled_at IS NULL
        AND p.deleted_at IS NULL
      RETURNING p.id
    )
    SELECT id FROM reopened
  `);
  if (!result.rows[0]) throw new Error("המשחק כבר לא בספירה");

  const state = await getCashoutState(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  return state;
}

/**
 * Closes only a complete, balanced settling game. All predicates are in the
 * conditional UPDATE so cash-out edits cannot make a closed ledger unbalanced.
 *
 * Both sides of the balance check exclude removed seats. A player who cashed out and
 * was then taken off the table keeps their `cash_outs` row as an audit record, and
 * counting it against a pot their buy-ins had already left made the sums disagree by
 * exactly their count -- so the UPDATE matched nothing and the night could not be
 * closed, while `getCashoutState` (live seats only, on both sides) went on reporting a
 * difference of zero. Whatever a removed player took off the table now surfaces as an
 * ordinary difference for the host to split or assign.
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
      -- One row filter for both required facts (plan item 5): a live seat blocks
      -- the close if it has no cash_outs row OR is not marked done. Splitting these
      -- into two separate predicates compared against each other is exactly the
      -- "two aggregates, two row filters" shape that made a night unclosable once
      -- (AGENTS.md) -- here they are one NOT EXISTS over one row filter instead.
      AND NOT EXISTS (
        SELECT 1 FROM players p
        WHERE p.game_id = g.id
          AND p.deleted_at IS NULL
          AND (
            p.count_done_at IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM cash_outs co
              WHERE co.game_id = g.id AND co.player_id = p.id
            )
          )
      )
      AND coalesce((
        SELECT sum(co.amount + co.adjustment)
        FROM cash_outs co
        JOIN players p ON p.id = co.player_id
        WHERE co.game_id = g.id
          AND p.deleted_at IS NULL
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

/**
 * The host leaves alone (the "יציאה רק שלי" path): their own result is saved and
 * frozen, and operational host (`players.is_host`) moves to the chosen successor --
 * in one statement, so a failure never leaves the table with a saved exit and the
 * old host still in charge, or a new host with no departing player settled.
 *
 * `games.created_by_person_id` is untouched. That is permanent ownership, and this
 * handoff only ever moves who currently runs the table.
 */
export async function exitHostAsSuccessor(
  gameId: string,
  deviceId: string,
  successorPlayerId: string,
  entry: CashoutEntry,
): Promise<CashoutState> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");
  if (access.game.status !== "active") throw new Error("המשחק כבר לא פעיל");

  const [successorRow] = await db
    .select({
      id: players.id,
      settledAt: players.settledAt,
      deletedAt: players.deletedAt,
      hasAccount: sql<boolean>`${people.userId} IS NOT NULL`,
    })
    .from(players)
    .leftJoin(people, eq(people.id, players.personId))
    .where(and(eq(players.id, successorPlayerId), eq(players.gameId, gameId)))
    .limit(1);
  if (!successorRow) throw new Error("השחקן לא נמצא");
  assertCanHandoffHost(access.game.status, access.actor, successorRow);

  const { amount, chipCounts } = await resolveCashoutEntry(
    access.game.chipSetId,
    entry,
  );
  const insertedChipCounts = insertChipCountsSql(chipCounts);
  const hostPlayerId = access.actor.id;

  // The eligibility check is recomputed here, against the row locked by
  // active_game, rather than trusted from the read above -- the same reason every
  // other mutation in this file repeats its guard inside the statement that writes.
  const result = await db.execute<{ id: string }>(sql`
    WITH active_game AS (
      SELECT id FROM ${games}
      WHERE id = ${gameId}::uuid AND status = 'active'
      FOR UPDATE
    ), eligible_successor AS (
      SELECT p.id FROM ${players} p
      INNER JOIN ${people} pe ON pe.id = p.person_id
      WHERE p.id = ${successorPlayerId}::uuid
        AND p.game_id = (SELECT id FROM active_game)
        AND p.deleted_at IS NULL
        AND p.settled_at IS NULL
        AND p.id <> ${hostPlayerId}::uuid
        AND pe.user_id IS NOT NULL
    ), saved AS (
      INSERT INTO ${cashOuts} (id, game_id, player_id, amount, adjustment, entered_by_person_id)
      SELECT gen_random_uuid(), g.id, ${hostPlayerId}::uuid, ${amount}, 0, ${deviceId}::uuid
      FROM active_game g
      WHERE EXISTS (SELECT 1 FROM eligible_successor)
      ON CONFLICT (game_id, player_id)
      DO UPDATE SET
        amount = EXCLUDED.amount,
        adjustment = 0,
        entered_by_person_id = EXCLUDED.entered_by_person_id
      RETURNING id
    ), deleted_counts AS (
      DELETE FROM ${cashOutChips}
      WHERE cash_out_id IN (SELECT id FROM saved)
      RETURNING id
    ), inserted_counts AS (
      ${insertedChipCounts}
    ), demoted_host AS (
      -- The departing host is also an early exit: their own result is frozen and
      -- done in the same statement as everyone else's early cash-out.
      UPDATE ${players}
      SET settled_at = coalesce(settled_at, now()),
          count_done_at = coalesce(count_done_at, now()),
          is_host = false
      WHERE id = ${hostPlayerId}::uuid AND EXISTS (SELECT 1 FROM saved)
      RETURNING id
    ), promoted_successor AS (
      UPDATE ${players}
      SET is_host = true
      WHERE id = ${successorPlayerId}::uuid AND EXISTS (SELECT 1 FROM demoted_host)
      RETURNING id
    )
    SELECT id FROM promoted_successor
  `);

  if (!result.rows[0]) {
    throw new Error(
      "היציאה לא נשמרה. אולי המשחק כבר לא פעיל או שהשחקן שנבחר כבר לא פנוי",
    );
  }

  const state = await getCashoutState(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  return state;
}

/**
 * Attaches a Person to a seat as a shared member (plan item 9).
 *
 * The host or the seat's own primary occupant may do this; nobody else. Money never
 * moves for this write, but membership must still be restricted to a game that is
 * `active` or `settling` -- attaching a member to a closed night grants it full
 * access to that night through `isSeatedInGame`, which every closed-game statistic
 * and view depends on being immutable.
 */
export async function attachSeatMember(
  gameId: string,
  deviceId: string,
  playerId: string,
  memberPersonId: string,
): Promise<void> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new Error("המשחק לא נמצא");

  // The seat's PRIMARY occupant (`players.person_id`), not the resolved actor id --
  // an attached member resolves to the same `players.id` as the seat (see
  // `resolveSeatActor`), so comparing player ids would let one attached member
  // attach further people. Only the host or that seat's own account may extend it.
  const [seat] = await db
    .select({ personId: players.personId })
    .from(players)
    .where(
      and(
        eq(players.id, playerId),
        eq(players.gameId, gameId),
        isNull(players.deletedAt),
      ),
    );
  if (!seat) throw new Error("המקום לא נמצא");
  if (!access.actor.isHost && seat.personId !== deviceId) {
    throw new AuthzError("not_your_seat");
  }

  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, memberPersonId), sql`${people.userId} IS NOT NULL`));
  if (!person) throw new Error("לא נמצא חשבון שחקן");

  // `unique(game_id, person_id)` is the backstop against one Person holding two
  // seats at one table (their own elsewhere, or another shared seat) -- this is the
  // readable refusal in front of it, not a replacement for it.
  //
  // The authorization is repeated here, live, against the row being written --
  // the JS check above reads a snapshot taken before this statement runs, and a
  // host demoted between that read and this insert (or a primary occupant who
  // released the seat in the meantime) must not still get to attach someone.
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO seat_members (id, game_id, player_id, person_id)
    SELECT gen_random_uuid(), ${gameId}::uuid, p.id, ${memberPersonId}::uuid
    FROM players p
    WHERE p.id = ${playerId}::uuid
      AND p.game_id = ${gameId}::uuid
      AND p.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM ${games} gm
        WHERE gm.id = ${gameId}::uuid AND gm.status IN ('active', 'settling')
      )
      AND (
        p.person_id = ${deviceId}::uuid
        OR EXISTS (
          SELECT 1 FROM players host
          WHERE host.game_id = ${gameId}::uuid
            AND host.device_id = ${deviceId}
            AND host.deleted_at IS NULL
            AND host.is_host
        )
      )
    ON CONFLICT (game_id, person_id) DO NOTHING
    RETURNING id
  `);
  if (!result.rows[0]) {
    throw new Error("אי אפשר לצרף את החשבון למקום הזה");
  }
}

/**
 * Detaches the caller from a seat they were attached to as a shared member.
 *
 * Self only, and only a non-primary attachment: the seat's own primary occupant
 * (`players.person_id`) is not "attached" in this sense, and leaving or releasing
 * their own seat is a different action (`releasePlayerClaim`) with its own rules
 * about what happens to the seat itself. This never touches that row.
 *
 * Restricted to a game that is still `active` or `settling` -- detaching from a
 * closed night would retroactively change profile, streak and head-to-head figures,
 * which are computed from current membership rows. Membership of a closed night
 * must be immutable.
 */
export async function detachSeatMember(
  gameId: string,
  deviceId: string,
): Promise<void> {
  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM seat_members sm
    USING players p, ${games} gm
    WHERE sm.game_id = ${gameId}::uuid
      AND sm.person_id = ${deviceId}::uuid
      AND p.id = sm.player_id
      AND p.person_id IS DISTINCT FROM sm.person_id
      AND gm.id = ${gameId}::uuid
      AND gm.status IN ('active', 'settling')
    RETURNING sm.id
  `);
  if (!result.rows[0]) {
    throw new Error("לא נמצאה השתתפות להסרה");
  }
}
