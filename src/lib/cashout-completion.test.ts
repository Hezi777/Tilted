import { describe, expect, it } from "vitest";
import {
  allSeatsDone,
  buildCashoutFlushBody,
  countState,
  nextCountDoneAt,
} from "@/lib/cashout-completion";

const now = () => "2026-09-19T20:00:00.000Z";

describe("countState", () => {
  it("is not_started before any count is saved", () => {
    expect(countState({ cashOut: null, countDoneAt: null })).toBe("not_started");
  });

  it("is counting once a count is saved but not marked done", () => {
    expect(countState({ cashOut: 5_000, countDoneAt: null })).toBe("counting");
  });

  it("is done once the seat's own count is marked finished", () => {
    expect(countState({ cashOut: 5_000, countDoneAt: now() })).toBe("done");
  });

  it("₪0 is a real, finished count -- never collapses to not_started", () => {
    expect(countState({ cashOut: 0, countDoneAt: now() })).toBe("done");
    expect(countState({ cashOut: 0, countDoneAt: null })).toBe("counting");
  });

  it("an edit after done re-opens the seat back to counting", () => {
    // The edit itself clears count_done_at (nextCountDoneAt below); countState just
    // reads whatever the two fields say afterward.
    expect(countState({ cashOut: 6_000, countDoneAt: null })).toBe("counting");
  });
});

describe("nextCountDoneAt", () => {
  it("marks done on the explicit finish action", () => {
    expect(nextCountDoneAt({ frozen: false, countDoneAt: null }, true, now)).toBe(now());
  });

  it("clears done on any edit that is not the explicit finish action", () => {
    expect(nextCountDoneAt({ frozen: false, countDoneAt: now() }, false, now)).toBeNull();
  });

  it("a frozen seat (early exit, or a host override) is always done", () => {
    expect(nextCountDoneAt({ frozen: true, countDoneAt: null }, false, now)).toBe(now());
    expect(nextCountDoneAt({ frozen: true, countDoneAt: null }, true, now)).toBe(now());
  });

  it("a frozen seat's existing done timestamp is preserved, not reset", () => {
    const original = "2026-09-19T18:00:00.000Z";
    expect(nextCountDoneAt({ frozen: true, countDoneAt: original }, false, now)).toBe(original);
  });
});

describe("allSeatsDone (the close gate)", () => {
  it("refuses to close with one seat outstanding", () => {
    const seats = [
      { cashOut: 5_000, countDoneAt: now() },
      { cashOut: 5_000, countDoneAt: null },
    ];
    expect(allSeatsDone(seats)).toBe(false);
  });

  it("allows closing once every seat is done, including a ₪0 seat", () => {
    const seats = [
      { cashOut: 5_000, countDoneAt: now() },
      { cashOut: 0, countDoneAt: now() },
    ];
    expect(allSeatsDone(seats)).toBe(true);
  });

  it("refuses a seat that has a cash_outs row but was edited back to not-done", () => {
    // The exact regression item 5 exists to prevent: row-existence alone is not
    // completion.
    const seats = [{ cashOut: 5_000, countDoneAt: null }];
    expect(allSeatsDone(seats)).toBe(false);
  });

  it("an empty table is trivially closeable", () => {
    expect(allSeatsDone([])).toBe(true);
  });
});

describe("buildCashoutFlushBody (the unmount debounce flush)", () => {
  it("flushes the exact pending chip counts, not a stale saved value", () => {
    const player = { id: "p1", chipCounts: { red: 3, blue: 1 }, cashOut: 4_500 };
    expect(buildCashoutFlushBody(player, true)).toEqual({
      playerId: "p1",
      chipCounts: { red: 3, blue: 1 },
      early: false,
      done: false,
    });
  });

  it("flushes the plain amount when the table has no chip set", () => {
    const player = { id: "p2", chipCounts: {}, cashOut: 7_000 };
    expect(buildCashoutFlushBody(player, false)).toEqual({
      playerId: "p2",
      amount: 7_000,
      early: false,
      done: false,
    });
  });

  it("never flushes done: true -- an unmount is not the explicit finish tap", () => {
    const player = { id: "p3", chipCounts: { red: 0 }, cashOut: 0 };
    expect(buildCashoutFlushBody(player, true).done).toBe(false);
  });
});
