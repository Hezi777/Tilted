import { describe, expect, it } from "vitest";
import { afterCreateSettles, mergePendingGame, nextPollDelay, POLL_MAX_MS, POLL_MIN_MS, removePendingGame, shouldApplyPoll, type PendingRebuy } from "@/hooks/useLiveGame";
import type { LiveGame } from "@/db/live-queries";

const game: LiveGame = {
  id: "game", code: "ABCD", name: null, status: "active", buyIn: 5_000, rebuyAmount: 5_000,
  startedAt: "2026-09-03T20:00:00.000Z", plannedEndAt: "2026-09-04T00:00:00.000Z",
  pot: 10_000, youId: "p1", isHost: false, chipSet: null,
  players: [{ id: "p1", personId: "person-1", name: "א", avatarKey: null, seatOrder: 0, isHost: false, isYou: true, isSettled: false, isWaiting: false, totalIn: 10_000, buyInCount: 2, tableSeat: null }],
  feed: [],
  yourBuyIns: [],
  allBuyIns: [],
  yourResult: null,
};

const pending: PendingRebuy = { opId: "op1", playerId: "p1", amount: 5_000, playerName: "א", createdAt: "2026-09-03T20:01:00.000Z" };

describe("live game optimistic ordering", () => {
  it("merges a pending rebuy until the server row appears", () => {
    const merged = mergePendingGame(game, [pending]);
    expect(merged.game.pot).toBe(15_000);
    expect(merged.game.players[0]?.totalIn).toBe(15_000);
    expect(merged.pending).toHaveLength(1);
    const confirmed = mergePendingGame({ ...merged.game, pot: 15_000, feed: [{ ...merged.game.feed[0]!, id: "b1" }] }, [pending]);
    expect(confirmed.pending).toHaveLength(0);
    expect(removePendingGame(merged.game, pending.opId).pot).toBe(10_000);
  });

  it("drops a poll response older than the newest applied sequence", () => {
    expect(shouldApplyPoll(4, 5)).toBe(false);
    expect(shouldApplyPoll(5, 5)).toBe(true);
    expect(shouldApplyPoll(6, 5)).toBe(true);
  });

  it("runs delete only after an in-flight create settles", async () => {
    let release!: () => void;
    let created = false;
    const create = new Promise<void>((resolve) => { release = () => { created = true; resolve(); }; });
    let deleteStarted = false;
    const deletion = afterCreateSettles(create, async () => {
      deleteStarted = true;
      expect(created).toBe(true);
      return "deleted";
    });
    expect(deleteStarted).toBe(false);
    release();
    await expect(deletion).resolves.toBe("deleted");
    expect(deleteStarted).toBe(true);
  });
});

describe("poll pacing", () => {
  it("stretches the gap while the table is quiet", () => {
    let delay = POLL_MIN_MS;
    const seen = [delay];
    for (let step = 0; step < 8; step += 1) {
      delay = nextPollDelay(delay);
      seen.push(delay);
    }
    // Strictly growing until it reaches the ceiling, then flat.
    expect(seen[1]).toBeGreaterThan(seen[0]);
    expect(Math.max(...seen)).toBe(POLL_MAX_MS);
    expect(seen.at(-1)).toBe(POLL_MAX_MS);
  });

  it("never waits longer than the ceiling, however long it has been quiet", () => {
    expect(nextPollDelay(POLL_MAX_MS)).toBe(POLL_MAX_MS);
    expect(nextPollDelay(POLL_MAX_MS * 10)).toBe(POLL_MAX_MS);
  });

  it("reaches the ceiling slowly enough to stay responsive early on", () => {
    // Two quiet polls must still be well under a second and a half apart, so a rebuy
    // by somebody else lands on the others' screens while they are still looking.
    expect(nextPollDelay(POLL_MIN_MS)).toBeLessThan(2_500);
  });
});
