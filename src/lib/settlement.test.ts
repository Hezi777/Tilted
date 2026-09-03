import { describe, expect, it } from "vitest";
import { agorot, type Agorot } from "@/lib/money";
import {
  computeNets,
  countedTotal,
  mismatchDelta,
  NoWinnersError,
  potTotal,
  resolveMismatch,
  settle,
  SumMismatchError,
  type PlayerLedger,
  type Transfer,
} from "@/lib/settlement";

/** Terse ledger builder: shekels in, shekels counted back out. */
function p(
  playerId: string,
  seatOrder: number,
  inShekels: number,
  outShekels: number | null,
  adjustmentAgorot = 0,
): PlayerLedger {
  return {
    playerId,
    seatOrder,
    totalIn: agorot(inShekels * 100),
    cashOut: outShekels === null ? null : agorot(outShekels * 100),
    adjustment: agorot(adjustmentAgorot),
  };
}

/** Same, but in raw agorot, for the sub-shekel rounding cases. */
function pa(
  playerId: string,
  seatOrder: number,
  totalIn: number,
  cashOut: number,
): PlayerLedger {
  return {
    playerId,
    seatOrder,
    totalIn: agorot(totalIn),
    cashOut: agorot(cashOut),
    adjustment: agorot(0),
  };
}

function transfersOf(ledgers: PlayerLedger[]): Transfer[] {
  return settle(computeNets(ledgers));
}

/** Every transfer as `from>to:amount`, for compact assertions. */
function shape(transfers: Transfer[]): string[] {
  return transfers.map(
    (t) => `${t.fromPlayerId}>${t.toPlayerId}:${t.amount}`,
  );
}

describe("computeNets", () => {
  it("is cash-out plus adjustment minus total in", () => {
    const nets = computeNets([p("a", 0, 50, 120), p("b", 1, 50, 0, -20)]);
    expect(nets).toEqual([
      { playerId: "a", seatOrder: 0, net: 7000 },
      { playerId: "b", seatOrder: 1, net: -5020 },
    ]);
  });

  it("treats a player who has not cashed out yet as zero counted", () => {
    const [net] = computeNets([p("a", 0, 50, null)]);
    expect(net.net).toBe(-5000);
  });
});

// ---------------------------------------------------------------------------
// The six cases the spec's section 6 requires.
// ---------------------------------------------------------------------------

describe("settle - the spec's required cases", () => {
  it("2 players, one wins everything", () => {
    expect(shape(transfersOf([p("win", 0, 50, 100), p("lose", 1, 50, 0)]))).toEqual([
      "lose>win:5000",
    ]);
  });

  it("3 players, one winner two losers", () => {
    const t = transfersOf([
      p("win", 0, 50, 100),
      p("l1", 1, 50, 20),
      p("l2", 2, 50, 30),
    ]);
    expect(shape(t)).toEqual(["l1>win:3000", "l2>win:2000"]);
  });

  it("4 players, two winners two losers, uneven amounts", () => {
    const t = transfersOf([
      p("w1", 0, 50, 130),
      p("w2", 1, 50, 90),
      p("l1", 2, 100, 30),
      p("l2", 3, 100, 50),
    ]);
    // w1 +80, w2 +40, l1 -70, l2 -50 => sums to zero, at most n-1 transfers.
    expect(shape(t)).toEqual(["l1>w1:7000", "l2>w1:1000", "l2>w2:4000"]);
    expect(t.length).toBeLessThanOrEqual(3);
  });

  it("a player who broke exactly even appears in no transfer", () => {
    const t = transfersOf([
      p("win", 0, 50, 100),
      p("even", 1, 50, 50),
      p("lose", 2, 50, 0),
    ]);
    expect(shape(t)).toEqual(["lose>win:5000"]);
    expect(t.some((x) => x.fromPlayerId === "even" || x.toPlayerId === "even")).toBe(
      false,
    );
  });

  it("a player who rebought 5 times and still lost", () => {
    // One initial buy-in plus five rebuys at ₪50 = ₪300 in, ₪20 back.
    const t = transfersOf([
      p("sucker", 0, 300, 20),
      p("win", 1, 50, 330),
    ]);
    expect(shape(t)).toEqual(["sucker>win:28000"]);
  });

  it("sum-mismatch input must throw", () => {
    expect(() => transfersOf([p("a", 0, 50, 120), p("b", 1, 50, 0)])).toThrow(
      SumMismatchError,
    );
  });
});

describe("settle - invariants", () => {
  it("never emits a zero or negative transfer", () => {
    const t = transfersOf([
      p("w", 0, 50, 100),
      p("e", 1, 50, 50),
      p("l", 2, 50, 0),
    ]);
    expect(t.every((x) => x.amount > 0)).toBe(true);
  });

  it("returns nothing when everybody broke even", () => {
    expect(transfersOf([p("a", 0, 50, 50), p("b", 1, 50, 50)])).toEqual([]);
  });

  it("carries the mismatch size on the error", () => {
    try {
      transfersOf([p("a", 0, 50, 120), p("b", 1, 50, 0)]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SumMismatchError);
      expect((error as SumMismatchError).delta).toBe(2000);
    }
  });
});

// ---------------------------------------------------------------------------
// The worked example from the spec's section 7, end to end.
// ---------------------------------------------------------------------------

describe("the section 7 worked example", () => {
  const ledgers = [
    p("alon", 0, 50, 230),
    p("din", 1, 50, 90),
    p("yuval", 2, 100, 100),
    p("shay", 3, 150, 60),
    p("roi", 4, 150, 20),
  ];

  it("produces the spec's nets", () => {
    expect(computeNets(ledgers).map((n) => n.net)).toEqual([
      18000, 4000, 0, -9000, -13000,
    ]);
  });

  it("reproduces the spec's transfer list exactly, in order", () => {
    expect(shape(transfersOf(ledgers))).toEqual([
      "roi>alon:13000",
      "shay>alon:5000",
      "shay>din:4000",
    ]);
  });

  it("has a pot of ₪500", () => {
    expect(potTotal(ledgers)).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// Mismatch reconciliation (spec section 5.5).
// ---------------------------------------------------------------------------

describe("mismatchDelta", () => {
  it("is zero when the chips match the pot", () => {
    expect(mismatchDelta([p("a", 0, 50, 100), p("b", 1, 50, 0)])).toBe(0);
  });

  it("is negative when chips are missing, matching the spec's ₪480 of ₪500", () => {
    const ledgers = [p("a", 0, 250, 480), p("b", 1, 250, 0)];
    expect(potTotal(ledgers)).toBe(50000);
    expect(countedTotal(ledgers)).toBe(48000);
    expect(mismatchDelta(ledgers)).toBe(-2000);
  });

  it("ignores existing adjustments, so it always reports the raw count", () => {
    const ledgers = [p("a", 0, 250, 480, 2000), p("b", 1, 250, 0)];
    expect(mismatchDelta(ledgers)).toBe(-2000);
  });
});

describe("resolveMismatch - assign to one player", () => {
  it("puts the whole difference on the chosen player", () => {
    const ledgers = [p("a", 0, 250, 480), p("b", 1, 250, 0)];
    // The ₪20 of chips is missing but the ₪20 of cash is not -- everyone paid it
    // in. Whoever pocketed the chip is credited with it, so the correction is
    // positive. This is also the only sign that makes the nets sum to zero.
    const adj = resolveMismatch(ledgers, { kind: "assign", playerId: "b" });
    expect(adj.get("b")).toBe(2000);
    expect(adj.get("a")).toBe(0);
  });

  it("makes the ledger settleable", () => {
    const ledgers = [p("a", 0, 250, 480), p("b", 1, 250, 0)];
    const applied = applyAdjustments(
      ledgers,
      resolveMismatch(ledgers, { kind: "assign", playerId: "b" }),
    );
    expect(() => transfersOf(applied)).not.toThrow();
    expect(sumNets(applied)).toBe(0);
  });

  it("rejects an unknown player", () => {
    expect(() =>
      resolveMismatch([p("a", 0, 250, 480), p("b", 1, 250, 0)], {
        kind: "assign",
        playerId: "ghost",
      }),
    ).toThrow(/ghost/);
  });
});

describe("resolveMismatch - split across winners", () => {
  it("distributes proportionally to the winners' pre-adjustment nets", () => {
    // Pot ₪500. Counted ₪470, so ₪30 is missing. The winners are +₪120 and +₪60
    // before adjustment, a 2:1 ratio, so they absorb ₪20 and ₪10.
    const ledgers = [
      p("w1", 0, 100, 220),
      p("w2", 1, 100, 160),
      p("l1", 2, 100, 90),
      p("l2", 3, 100, 0),
      p("l3", 4, 100, 0),
    ];
    expect(potTotal(ledgers)).toBe(50000);
    expect(countedTotal(ledgers)).toBe(47000);
    expect(mismatchDelta(ledgers)).toBe(-3000);

    const adj = resolveMismatch(ledgers, { kind: "split" });
    expect(adj.get("w1")).toBe(2000);
    expect(adj.get("w2")).toBe(1000);
    expect(adj.get("l1")).toBe(0);
    expect(sumOf(adj)).toBe(3000);
    expect(sumNets(applyAdjustments(ledgers, adj))).toBe(0);
  });

  it("does not over-adjust when the exact share is a half agora", () => {
    // The naive floor-per-winner bug: two exactly equal winners, one agora
    // missing, each quota is exactly 0.5, and rounding both up removes two.
    const short = [
      pa("w1", 0, 10000, 15000),
      pa("w2", 1, 10000, 15000),
      pa("l1", 2, 10000, 5000),
      pa("l2", 3, 10000, 4999),
    ];
    expect(mismatchDelta(short)).toBe(-1);

    const adj = resolveMismatch(short, { kind: "split" });
    expect(sumOf(adj)).toBe(1);
    expect(sumNets(applyAdjustments(short, adj))).toBe(0);
  });

  it("breaks a remainder tie by seat order", () => {
    // One agora over-counted, two identical winners: the earlier seat gives it up.
    const over = [
      pa("w1", 0, 10000, 15000),
      pa("w2", 1, 10000, 15000),
      pa("l1", 2, 10000, 5000),
      pa("l2", 3, 10000, 5001),
    ];
    expect(mismatchDelta(over)).toBe(1);

    const adj = resolveMismatch(over, { kind: "split" });
    expect(adj.get("w1")).toBe(-1);
    expect(adj.get("w2")).toBe(0);
  });

  it("throws when nobody is a winner, so the UI must offer the other options", () => {
    // Chips vanished entirely: there is no winner to absorb the difference.
    const ledgers = [p("a", 0, 100, 40), p("b", 1, 100, 40)];
    expect(mismatchDelta(ledgers)).toBe(-12000);
    expect(() => resolveMismatch(ledgers, { kind: "split" })).toThrow(NoWinnersError);
  });

  it("is a replacement, not an increment, when re-resolved", () => {
    const raw = [p("a", 0, 250, 480), p("b", 1, 250, 0)];
    const first = resolveMismatch(raw, { kind: "assign", playerId: "b" });
    const once = applyAdjustments(raw, first);
    // The host changes their mind and assigns it to A instead. The second call
    // sees a ledger that already carries B's adjustment and must ignore it.
    const second = resolveMismatch(once, { kind: "assign", playerId: "a" });
    expect(second.get("a")).toBe(2000);
    expect(second.get("b")).toBe(0);
    expect(sumNets(applyAdjustments(once, second))).toBe(0);
  });

  it("returns all zeroes when there is nothing to reconcile", () => {
    const ledgers = [p("a", 0, 50, 100), p("b", 1, 50, 0)];
    const adj = resolveMismatch(ledgers, { kind: "split" });
    expect(sumOf(adj)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property tests over random ledgers.
// ---------------------------------------------------------------------------

/** Deterministic PRNG so a failure is always reproducible from its seed. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("properties over random ledgers", () => {
  it("holds for 500 random balanced games", () => {
    const random = rng(20260903);

    for (let run = 0; run < 500; run += 1) {
      const count = 2 + Math.floor(random() * 7);
      const ledgers: PlayerLedger[] = [];
      let pot = 0;

      for (let i = 0; i < count; i += 1) {
        const buyIns = 1 + Math.floor(random() * 6);
        const totalIn = buyIns * 5000;
        pot += totalIn;
        ledgers.push({
          playerId: `p${i}`,
          seatOrder: i,
          totalIn: agorot(totalIn),
          cashOut: agorot(0),
          adjustment: agorot(0),
        });
      }

      // Deal the whole pot back out at random so the game always balances.
      let left = pot;
      for (let i = 0; i < count - 1; i += 1) {
        const take = Math.floor(random() * (left + 1));
        ledgers[i].cashOut = agorot(take);
        left -= take;
      }
      ledgers[count - 1].cashOut = agorot(left);

      const nets = computeNets(ledgers);
      const transfers = settle(nets);
      const seed = `run ${run}`;

      // 1. The ledger balances.
      expect(nets.reduce((s, n) => s + n.net, 0), seed).toBe(0);

      // 2. At most n-1 transfers, per the spec's step 5.
      expect(transfers.length, seed).toBeLessThanOrEqual(count - 1);

      // 3. No transfer is zero, negative, or from a player to themselves.
      for (const t of transfers) {
        expect(t.amount, seed).toBeGreaterThan(0);
        expect(t.fromPlayerId, seed).not.toBe(t.toPlayerId);
      }

      // 4. Transfers settle every player exactly: applying them zeroes all nets.
      const remaining = new Map(nets.map((n) => [n.playerId, n.net]));
      for (const t of transfers) {
        remaining.set(t.fromPlayerId, remaining.get(t.fromPlayerId)! + t.amount);
        remaining.set(t.toPlayerId, remaining.get(t.toPlayerId)! - t.amount);
      }
      for (const [playerId, value] of remaining) {
        expect(value, `${seed} ${playerId}`).toBe(0);
      }

      // 5. Money only ever flows from a loser to a winner.
      const netOf = new Map(nets.map((n) => [n.playerId, n.net]));
      for (const t of transfers) {
        expect(netOf.get(t.fromPlayerId)!, seed).toBeLessThan(0);
        expect(netOf.get(t.toPlayerId)!, seed).toBeGreaterThan(0);
      }
    }
  });

  it("any resolvable mismatch is fully absorbed by a split", () => {
    const random = rng(4711);

    for (let run = 0; run < 300; run += 1) {
      const count = 2 + Math.floor(random() * 5);
      const ledgers: PlayerLedger[] = [];
      for (let i = 0; i < count; i += 1) {
        ledgers.push({
          playerId: `p${i}`,
          seatOrder: i,
          totalIn: agorot(5000),
          cashOut: agorot(Math.floor(random() * 15000)),
          adjustment: agorot(0),
        });
      }

      const delta = mismatchDelta(ledgers);
      const hasWinner = computeNets(ledgers).some((n) => n.net > 0);
      if (!hasWinner && delta !== 0) {
        expect(() => resolveMismatch(ledgers, { kind: "split" })).toThrow(
          NoWinnersError,
        );
        continue;
      }

      const adj = resolveMismatch(ledgers, { kind: "split" });
      const applied = applyAdjustments(ledgers, adj);
      expect(sumNets(applied), `run ${run}`).toBe(0);
      expect(() => settle(computeNets(applied)), `run ${run}`).not.toThrow();
    }
  });
});

// --- helpers ---------------------------------------------------------------

function applyAdjustments(
  ledgers: PlayerLedger[],
  adjustments: ReadonlyMap<string, Agorot>,
): PlayerLedger[] {
  return ledgers.map((l) => ({
    ...l,
    adjustment: agorot(adjustments.get(l.playerId) ?? 0),
  }));
}

function sumNets(ledgers: PlayerLedger[]): number {
  return computeNets(ledgers).reduce((total, n) => total + n.net, 0);
}

function sumOf(adjustments: ReadonlyMap<string, Agorot>): number {
  let total = 0;
  for (const value of adjustments.values()) total += value;
  return total;
}
