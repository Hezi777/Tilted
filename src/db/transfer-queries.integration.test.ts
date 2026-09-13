/**
 * Executes the transfer read/write path against a real Postgres branch.
 *
 * The identifiers the settlement screen holds are only stable if the rows behind them
 * are. That is a property of what the write actually does to the table, which no
 * `.toSQL()` assertion can reach.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  hasIntegrationDb,
  seedActiveGame,
  type SeededGame,
} from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("listTransfers (integration)", () => {
  let cashout: typeof import("@/db/cashout-queries");
  let transfers: typeof import("@/db/transfer-queries");
  let game: SeededGame;

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
    transfers = await import("@/db/transfer-queries");
  });

  beforeEach(async () => {
    game = await seedActiveGame(10_000);
    // A settled night the guest lost ₪50 on, so exactly one transfer exists.
    await cashout.beginSettling(game.gameId, game.host.personId);
    await cashout.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 15_000 }, false);
    await cashout.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 5_000 }, false);
  });

  it("computes the one transfer the settlement owes", async () => {
    const records = await transfers.listTransfers(game.gameId);
    expect(records).toHaveLength(1);
    expect(records?.[0]).toMatchObject({
      from: { playerId: game.guest.playerId },
      to: { playerId: game.host.playerId },
      amount: 5_000,
      paidAt: null,
    });
  });

  /**
   * The regression. Two phones open the settlement screen; the second one's load must
   * not invalidate the row the first one is holding.
   */
  it("keeps transfer ids stable across repeated reads", async () => {
    const first = await transfers.listTransfers(game.gameId);
    const second = await transfers.listTransfers(game.gameId);

    expect(first?.[0].id).toBeDefined();
    expect(second?.map((t) => t.id)).toEqual(first?.map((t) => t.id));
  });

  it("marks a transfer paid using an id read before another client refreshed", async () => {
    const [transfer] = (await transfers.listTransfers(game.gameId)) ?? [];
    // A second phone opens the same screen.
    await transfers.listTransfers(game.gameId);

    // The first phone taps "סמנו כשולם" on the row it is still showing.
    const updated = await transfers.setTransferPaid(
      game.gameId,
      game.guest.personId,
      transfer.id,
      true,
    );
    expect(updated[0].paidAt).not.toBeNull();
  });

  it("drops a pair that stops owing after the counts are corrected", async () => {
    expect(await transfers.listTransfers(game.gameId)).toHaveLength(1);

    // The host recounts: everyone broke even, so nobody owes anyone.
    await cashout.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 10_000 }, false);
    await cashout.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 10_000 }, false);

    expect(await transfers.listTransfers(game.gameId)).toEqual([]);
    // And a second read with nothing to write is still a clean no-op.
    expect(await transfers.listTransfers(game.gameId)).toEqual([]);
  });

  it("carries paid state across a re-sync after the numbers change", async () => {
    const [transfer] = (await transfers.listTransfers(game.gameId)) ?? [];
    await transfers.setTransferPaid(game.gameId, game.guest.personId, transfer.id, true);

    const after = await transfers.listTransfers(game.gameId);
    expect(after?.[0].paidAt).not.toBeNull();
    expect(after?.[0].markedByDevice).toBe(game.guest.personId);
  });
});
