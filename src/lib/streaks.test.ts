import { describe, expect, it } from "vitest";
import { agorot } from "@/lib/money";
import type { PlayerLedger } from "@/lib/settlement";
import {
  activeStreaks,
  currentStreak,
  type GameStatus,
  type StreakGame,
} from "@/lib/streaks";

/** Terse ledger builder: shekels in, shekels counted back out. Net = out - in. */
function ledger(
  playerId: string,
  inShekels: number,
  outShekels: number,
): PlayerLedger {
  return {
    playerId,
    seatOrder: 0,
    totalIn: agorot(inShekels * 100),
    cashOut: agorot(outShekels * 100),
    adjustment: agorot(0),
  };
}

/** A closed game where `personId` played with the given in/out, on `date`. */
function game(
  id: string,
  date: string,
  personId: string | null,
  inShekels: number,
  outShekels: number,
  status: GameStatus = "closed",
): StreakGame {
  return {
    id,
    status,
    closedAt: status === "closed" ? new Date(date) : null,
    players: [{ personId, ledger: ledger(`${id}-seat`, inShekels, outShekels) }],
  };
}

const ALICE = "alice";

describe("currentStreak", () => {
  it("reports a clean run of 3 wins", () => {
    const games = [
      game("g1", "2026-01-01", ALICE, 100, 150),
      game("g2", "2026-01-08", ALICE, 100, 120),
      game("g3", "2026-01-15", ALICE, 100, 200),
    ];
    expect(currentStreak(ALICE, games)).toBe(3);
  });

  it("is broken by a loss", () => {
    const games = [
      game("g1", "2026-01-01", ALICE, 100, 50), // loss, oldest
      game("g2", "2026-01-08", ALICE, 100, 150),
      game("g3", "2026-01-15", ALICE, 100, 150),
    ];
    expect(currentStreak(ALICE, games)).toBe(2);
  });

  it("is broken by an exact zero net — zero is not a win", () => {
    const games = [
      game("g1", "2026-01-01", ALICE, 100, 150),
      game("g2", "2026-01-08", ALICE, 100, 100), // exact break-even
      game("g3", "2026-01-15", ALICE, 100, 150),
    ];
    // The newest game alone is a single win — reported as no streak.
    expect(currentStreak(ALICE, games)).toBeNull();
  });

  it("skips a sat-out game in the middle without breaking the streak", () => {
    const games = [
      game("g1", "2026-01-01", ALICE, 100, 150),
      game("g2", "2026-01-08", "bob", 100, 150), // Alice absent, not a break
      game("g3", "2026-01-15", ALICE, 100, 150),
    ];
    expect(currentStreak(ALICE, games)).toBe(2);
  });

  it("reports a single win as no streak", () => {
    const games = [game("g1", "2026-01-01", ALICE, 100, 150)];
    expect(currentStreak(ALICE, games)).toBeNull();
  });

  it("ignores games that are still open (not closed)", () => {
    const games = [
      game("g1", "2026-01-01", ALICE, 100, 150, "active"),
      game("g2", "2026-01-08", ALICE, 100, 150, "settling"),
    ];
    expect(currentStreak(ALICE, games)).toBeNull();
  });

  it("gives a null person_id no streak — a one-off guest", () => {
    const games = [
      game("g1", "2026-01-01", null, 100, 150),
      game("g2", "2026-01-08", null, 100, 150),
      game("g3", "2026-01-15", null, 100, 150),
    ];
    expect(currentStreak("anyone", games)).toBeNull();
  });

  it("sorts by closed_at itself, regardless of input order", () => {
    const games = [
      game("g3", "2026-01-15", ALICE, 100, 50), // newest: a loss
      game("g1", "2026-01-01", ALICE, 100, 150),
      game("g2", "2026-01-08", ALICE, 100, 150),
    ];
    // If the sort were trusted to the caller's order, walking g3 last would
    // wrongly find a win streak. Walking newest-first must hit the loss first.
    expect(currentStreak(ALICE, games)).toBeNull();
  });

  it("ignores a cancelled game in the middle", () => {
    const games = [
      game("g1", "2026-01-01", ALICE, 100, 150),
      game("g2", "2026-01-08", ALICE, 100, 999, "cancelled"),
      game("g3", "2026-01-15", ALICE, 100, 150),
    ];
    // The cancelled game (which would otherwise read as a huge win) never
    // enters the walk at all — same result as if it weren't in the list.
    expect(currentStreak(ALICE, games)).toBe(2);
  });
});

/** A closed game where both Alice and Bob played, on `date`. */
function twoPlayerGame(
  id: string,
  date: string,
  alice: { inShekels: number; outShekels: number },
  bob: { inShekels: number; outShekels: number },
): StreakGame {
  return {
    id,
    status: "closed",
    closedAt: new Date(date),
    players: [
      { personId: ALICE, ledger: ledger(`${id}-alice`, alice.inShekels, alice.outShekels) },
      { personId: "bob", ledger: ledger(`${id}-bob`, bob.inShekels, bob.outShekels) },
    ],
  };
}

describe("activeStreaks", () => {
  it("returns everyone who currently has a streak of 2 or more", () => {
    const games = [
      twoPlayerGame("g1", "2026-01-01", { inShekels: 100, outShekels: 150 }, { inShekels: 100, outShekels: 50 }),
      twoPlayerGame("g2", "2026-01-08", { inShekels: 100, outShekels: 150 }, { inShekels: 100, outShekels: 150 }),
    ];
    const streaks = activeStreaks(games);
    expect(streaks.get(ALICE)).toBe(2);
    expect(streaks.has("bob")).toBe(false);
  });

  it("excludes null person_id guests entirely", () => {
    const games = [
      game("g1", "2026-01-01", null, 100, 150),
      game("g2", "2026-01-08", null, 100, 150),
    ];
    expect(activeStreaks(games).size).toBe(0);
  });
});
