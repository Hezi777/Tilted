/**
 * Executes the cash-out lifecycle against a real Postgres branch.
 *
 * `closeSettlingGame` is a single conditional UPDATE whose predicates decide whether a
 * night can be closed at all. A `.toSQL()` assertion can only prove the text of those
 * predicates; it takes a live database to prove what they match.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  hasIntegrationDb,
  seedActiveGame,
  type SeededGame,
} from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("closeSettlingGame (integration)", () => {
  let db: typeof import("@/db/cashout-queries");
  let live: typeof import("@/db/live-queries");
  let game: SeededGame;

  beforeAll(async () => {
    db = await import("@/db/cashout-queries");
    live = await import("@/db/live-queries");
  });

  beforeEach(async () => {
    game = await seedActiveGame(10_000);
  });

  it("closes a balanced night", async () => {
    await db.beginSettling(game.gameId, game.host.personId);
    await db.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 12_000 }, false);
    await db.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 8_000 }, false);

    const closed = await db.closeSettlingGame(game.gameId, game.host.personId);
    expect(closed.status).toBe("closed");
  });

  /**
   * The regression. A guest leaves early having broken exactly even, the host tidies
   * their empty seat off the table, and the remaining ledger balances -- the cash-out
   * screen says so. The night must still close.
   */
  it("closes after a player who already cashed out is removed from the table", async () => {
    // The guest exits early, breaking even.
    await db.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 10_000 }, true);
    // The host removes the seat they left behind.
    await live.deleteLivePlayer(game.gameId, game.guest.playerId, game.host.personId);

    await db.beginSettling(game.gameId, game.host.personId);
    await db.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 10_000 }, false);

    // What the host is looking at: a table that adds up.
    const state = await db.getCashoutState(game.gameId);
    expect(state?.difference).toBe(0);

    const closed = await db.closeSettlingGame(game.gameId, game.host.personId);
    expect(closed.status).toBe("closed");
  });

  /**
   * The other half of the same filter: a removed player's own numbers must not be
   * quietly absorbed either. Their ₪150 leaves with them, so the table is short and
   * the host is told so, rather than being handed a silent failure to close.
   */
  it("reports a removed winner's missing chips as a real difference", async () => {
    await db.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 15_000 }, true);
    await live.deleteLivePlayer(game.gameId, game.guest.playerId, game.host.personId);

    await db.beginSettling(game.gameId, game.host.personId);
    await db.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 5_000 }, false);

    const state = await db.getCashoutState(game.gameId);
    expect(state?.difference).toBe(-5_000);
    await expect(db.closeSettlingGame(game.gameId, game.host.personId)).rejects.toThrow();
  });
});
