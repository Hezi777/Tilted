import { describe, expect, it } from "vitest";
import { estimateEquity } from "@/lib/equity";
import type { PlayingCardCode } from "@/lib/cards";

// Seeded so every run of this test sees the exact same shuffles -- no flakiness,
// and the tolerance below is a genuine assertion about accuracy, not a hedge
// against random variation from run to run.
const SEED = 1;
const ITERATIONS = 20_000; // tighter than DEFAULT_EQUITY_ITERATIONS; accuracy matters here, not phone latency.

function equityOf(hole: PlayingCardCode[], opponents: number, seed = SEED, iterations = ITERATIONS) {
  const result = estimateEquity({ hole, opponents, iterations, seed });
  return result.win + result.tie;
}

describe("estimateEquity", () => {
  // The anchor: pocket aces heads-up preflop against one random hand is one of
  // the most frequently cited numbers in poker equity work, at roughly 85%.
  it("gives pocket aces heads-up preflop equity within 3 points of the published ~85%", () => {
    const equity = equityOf(["As", "Ah"], 1);
    expect(Math.abs(equity - 0.852)).toBeLessThan(0.03);
  });

  it("gives pocket aces vs two random hands preflop within 4 points of the published ~73.4%", () => {
    const equity = equityOf(["As", "Ah"], 2);
    expect(Math.abs(equity - 0.734)).toBeLessThan(0.04);
  });

  it("gives pocket aces vs eight random hands preflop within 5 points of the published ~31%", () => {
    const equity = equityOf(["As", "Ah"], 8);
    expect(Math.abs(equity - 0.31)).toBeLessThan(0.05);
  });

  it("is deterministic for a fixed seed", () => {
    const first = estimateEquity({ hole: ["Kh", "Kd"], opponents: 3, iterations: 2000, seed: 7 });
    const second = estimateEquity({ hole: ["Kh", "Kd"], opponents: 3, iterations: 2000, seed: 7 });
    expect(first).toEqual(second);
  });

  it("gives a strong made hand near-certain equity on the river", () => {
    // Hero holds the nut flush with the board complete; only a better flush or a
    // full house beats it, and none is possible with these cards on board.
    const result = estimateEquity({
      hole: ["Ah", "Kh"],
      board: ["2h", "5h", "9h", "3c", "7d"],
      opponents: 1,
      iterations: 5000,
      seed: 3,
    });
    expect(result.win + result.tie).toBeGreaterThan(0.95);
  });

  it("rejects a hole card count other than two", () => {
    expect(() => estimateEquity({ hole: ["As"], opponents: 1 })).toThrow();
  });

  it("rejects an opponent count outside one to nine", () => {
    expect(() => estimateEquity({ hole: ["As", "Ah"], opponents: 0 })).toThrow();
    expect(() => estimateEquity({ hole: ["As", "Ah"], opponents: 10 })).toThrow();
  });
});
