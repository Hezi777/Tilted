/**
 * The chip-count completion state machine (plan item 5), extracted as a pure model so
 * it is testable without a database. The real writes live in
 * `src/db/cashout-queries.ts` (`saveCashout`, `closeSettlingGame`), which mirror this
 * logic inside a single SQL statement -- this module exists to pin down the rules in
 * one place a test can hit directly.
 *
 * `cash_outs` (a counted amount) and `players.count_done_at` (the intent) are two
 * separate facts on purpose. Closing requires both; neither is ever a substitute for
 * the other.
 */

export type CountState = "not_started" | "counting" | "done";

export interface SeatCount {
  /** Agorot, or null before anything has been saved. ₪0 is a real, finished count --
   * it must never collapse to "not started". */
  cashOut: number | null;
  countDoneAt: string | null;
}

/** Where one seat is in the counting flow, for display. */
export function countState(seat: SeatCount): CountState {
  if (seat.cashOut === null) return "not_started";
  return seat.countDoneAt !== null ? "done" : "counting";
}

/**
 * The next `count_done_at`, computed the same way the settling-branch UPDATE in
 * `saveCashout` computes it: a frozen seat (an early exit, or the host's override of
 * one) can only ever end up done, and never edited back to not-done. Everyone else's
 * done flag is exactly whatever this save asked for.
 */
export function nextCountDoneAt(
  current: { frozen: boolean; countDoneAt: string | null },
  done: boolean,
  now: () => string,
): string | null {
  if (current.frozen) return current.countDoneAt ?? now();
  return done ? now() : null;
}

/**
 * The close gate: every live seat must have both a counted amount and a done flag,
 * read from one predicate -- matching `closeSettlingGame`'s single `NOT EXISTS`,
 * which is what keeps this from splitting into two aggregates compared against each
 * other (AGENTS.md's "two aggregates, one row filter" rule).
 */
export function allSeatsDone(seats: readonly SeatCount[]): boolean {
  return seats.every((seat) => seat.cashOut !== null && seat.countDoneAt !== null);
}

export interface FlushablePlayer {
  id: string;
  chipCounts: Record<string, number>;
  cashOut: number | null;
}

export type CashoutSaveBody =
  | { playerId: string; chipCounts: Record<string, number>; early: false; done: false }
  | { playerId: string; amount: number; early: false; done: false };

/**
 * The request `CashoutScreen`'s unmount cleanup sends for a seat still inside its
 * 350ms debounce window (`docs/2026-09-audit.md` open item 5). `chipSaveTimers` used
 * to store timeout handles only and cleanup merely cancelled them, so a chip tapped a
 * moment before navigating away was silently lost. This is the exact pending value --
 * never `done: true`, because an unmount is not the explicit "סיימתי לספור" tap.
 */
export function buildCashoutFlushBody(
  player: FlushablePlayer,
  hasChipSet: boolean,
): CashoutSaveBody {
  return hasChipSet
    ? { playerId: player.id, chipCounts: player.chipCounts, early: false, done: false }
    : { playerId: player.id, amount: player.cashOut ?? 0, early: false, done: false };
}
