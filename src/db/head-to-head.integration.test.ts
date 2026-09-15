/**
 * Head-to-head against a real branch, because the thing under test is whether the two
 * sides of a night find each other -- a property of the rows and the joins, not of the
 * statement text. A mocked version of this would have passed while reporting every
 * opponent as dead even, which is the failure it exists to catch.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("head to head", () => {
  let loadHeadToHead: typeof import("@/db/head-to-head").loadHeadToHead;

  // No per-test truncation: `globalSetup` clears the branch once, and vitest runs test
  // files in parallel, so a reset here wipes the rows another suite is mid-way through.
  // Every row below carries a fresh uuid instead, which is what keeps them apart.
  beforeAll(async () => {
    ({ loadHeadToHead } = await import("@/db/head-to-head"));
  });

  /**
   * One closed night: `winner` puts in 3,000 and takes out 16,200; `loser` puts in
   * 12,000 and never cashes out. The numbers are the ones from a real evening.
   */
  async function seedNight(options: { closed: boolean }) {
    const { db } = await import("@/db");
    const { buyIns, cashOuts, games, people, players } = await import("@/db/schema");

    const winner = { personId: randomUUID(), playerId: randomUUID() };
    const loser = { personId: randomUUID(), playerId: randomUUID() };
    const gameId = randomUUID();

    await db.insert(people).values([
      { id: winner.personId, name: "מנצח", userId: `user_${winner.personId}` },
      { id: loser.personId, name: "מפסיד", userId: `user_${loser.personId}` },
    ]);
    await db.insert(games).values({
      id: gameId,
      code: randomUUID().slice(0, 6).toUpperCase(),
      name: "ערב בדיקה",
      buyIn: 3_000,
      rebuyAmount: 3_000,
      status: options.closed ? "closed" : "active",
      closedAt: options.closed ? new Date() : null,
      createdByPersonId: winner.personId,
    });
    await db.insert(players).values([
      { id: winner.playerId, gameId, personId: winner.personId, name: "מנצח", seatOrder: 0, isHost: true, deviceId: `d_${winner.personId}` },
      { id: loser.playerId, gameId, personId: loser.personId, name: "מפסיד", seatOrder: 1, isHost: false, deviceId: `d_${loser.personId}` },
    ]);
    await db.insert(buyIns).values([
      { gameId, playerId: winner.playerId, amount: 3_000, kind: "initial", opId: randomUUID() },
      { gameId, playerId: loser.playerId, amount: 3_000, kind: "initial", opId: randomUUID() },
      { gameId, playerId: loser.playerId, amount: 9_000, kind: "rebuy", opId: randomUUID() },
    ]);
    await db.insert(cashOuts).values([
      { gameId, playerId: winner.playerId, amount: 16_200, adjustment: 0 },
    ]);
    return { winner, loser, gameId };
  }

  it("does not report a night with a clear winner as even", async () => {
    const { winner, loser } = await seedNight({ closed: true });

    const fromWinner = await loadHeadToHead(winner.personId, loser.personId);
    expect(fromWinner.nightsTogether).toBe(1);
    // +13,200 against -12,000 is a 25,200 gap. Reporting 0 here is the bug.
    expect(fromWinner.netDifference).toBe(25_200);
    expect(fromWinner.youAhead).toBe(1);
    expect(fromWinner.themAhead).toBe(0);
  });

  it("is exactly symmetric from the other side", async () => {
    const { winner, loser } = await seedNight({ closed: true });

    const fromLoser = await loadHeadToHead(loser.personId, winner.personId);
    expect(fromLoser.netDifference).toBe(-25_200);
    expect(fromLoser.youAhead).toBe(0);
    expect(fromLoser.themAhead).toBe(1);
  });

  it("counts nothing until the night has closed", async () => {
    const { winner, loser } = await seedNight({ closed: false });

    const open = await loadHeadToHead(winner.personId, loser.personId);
    expect(open.nightsTogether).toBe(0);
    expect(open.netDifference).toBe(0);
  });

  it("has nothing to say about you against yourself", async () => {
    const { winner } = await seedNight({ closed: true });

    const self = await loadHeadToHead(winner.personId, winner.personId);
    expect(self.nightsTogether).toBe(0);
  });
});
