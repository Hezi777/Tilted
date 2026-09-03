import { describe, expect, it } from "vitest";
import { gamesThroughClosedAt, settlementOutcome } from "@/db/streak-queries";
import type { StreakGame } from "@/lib/streaks";

describe("settlementOutcome", () => {
  it("marks a positive result that follows a streak as extended", () => {
    expect(settlementOutcome(100, 2, 3)).toBe("extended");
  });

  it("marks a non-winning result after a streak as broken", () => {
    expect(settlementOutcome(0, 3, null)).toBe("broken");
    expect(settlementOutcome(-100, 3, null)).toBe("broken");
  });

  it("does not label a first win", () => {
    expect(settlementOutcome(100, null, null)).toBeNull();
  });

  it("marks the win that creates streak two as extended", () => {
    expect(settlementOutcome(100, null, 2)).toBe("extended");
  });

  it("does not label an absence as a break", () => {
    expect(settlementOutcome(0, null, null)).toBeNull();
  });
});

describe("gamesThroughClosedAt", () => {
  it("ignores later results when computing an older settlement", () => {
    const games: StreakGame[] = [
      { id: "older", status: "closed", closedAt: new Date("2026-01-01"), players: [] },
      { id: "target", status: "closed", closedAt: new Date("2026-01-08"), players: [] },
      { id: "later", status: "closed", closedAt: new Date("2026-01-15"), players: [] },
    ];
    expect(
      gamesThroughClosedAt(games, new Date("2026-01-08")).map((game) => game.id),
    ).toEqual(["older", "target"]);
  });
});
