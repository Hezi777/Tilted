import { describe, expect, it } from "vitest";
import { afterCreateSettles, mergePendingGame, removePendingGame, shouldApplyPoll, type PendingRebuy } from "@/hooks/useLiveGame";
import type { LiveGame } from "@/db/live-queries";

const game: LiveGame = {
  id: "game", code: "ABCD", name: null, status: "active", buyIn: 5_000, rebuyAmount: 5_000,
  startedAt: "2026-09-03T20:00:00.000Z", plannedEndAt: "2026-09-04T00:00:00.000Z",
  pot: 10_000, youId: "p1", isHost: false,
  players: [{ id: "p1", personId: "person-1", name: "א", avatarKey: null, seatOrder: 0, isHost: false, isYou: true, isSettled: false, totalIn: 10_000, buyInCount: 2, tableSeat: null }],
  feed: [],
  yourBuyIns: [],
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
