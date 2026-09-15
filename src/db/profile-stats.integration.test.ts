/**
 * Profile statistics against a real branch.
 *
 * These were all reporting zero in production and nothing caught it, because the
 * defect was in what the statement *did* rather than in its shape: an interpolated
 * drizzle column inside a `sql` template renders unqualified, so `where "player_id" =
 * "id"` compared buy_ins against itself. No error, no empty result -- just sum() over
 * nothing, coalesced to 0. A `.toSQL()` assertion would have passed happily.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("profile stats", () => {
  let loadProfileStats: typeof import("@/db/profile-stats").loadProfileStats;

  // See the note in head-to-head.integration.test.ts: no per-test truncation.
  beforeAll(async () => {
    ({ loadProfileStats } = await import("@/db/profile-stats"));
  });

  /** One closed night for `personId`: `paidIn` in, `tookOut` out. */
  async function seedNight(
    personId: string,
    amounts: { paidIn: number; tookOut: number },
  ) {
    const { db } = await import("@/db");
    const { buyIns, cashOuts, games, players } = await import("@/db/schema");
    const gameId = randomUUID();
    const playerId = randomUUID();
    await db.insert(games).values({
      id: gameId,
      code: randomUUID().slice(0, 6).toUpperCase(),
      buyIn: amounts.paidIn,
      rebuyAmount: amounts.paidIn,
      status: "closed",
      closedAt: new Date(),
      createdByPersonId: personId,
    });
    await db.insert(players).values({
      id: playerId,
      gameId,
      personId,
      name: "בודק",
      seatOrder: 0,
      isHost: true,
      deviceId: `d_${playerId}`,
    });
    await db.insert(buyIns).values({
      gameId,
      playerId,
      amount: amounts.paidIn,
      kind: "initial",
      opId: randomUUID(),
    });
    if (amounts.tookOut > 0) {
      await db
        .insert(cashOuts)
        .values({ gameId, playerId, amount: amounts.tookOut, adjustment: 0 });
    }
  }

  async function seedPerson(): Promise<string> {
    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");
    const personId = randomUUID();
    await db
      .insert(people)
      .values({ id: personId, name: "בודק", userId: `user_${personId}` });
    return personId;
  }

  it("reads a real net rather than zero", async () => {
    const personId = await seedPerson();
    await seedNight(personId, { paidIn: 3_000, tookOut: 16_200 });

    const stats = await loadProfileStats(personId);
    expect(stats.gamesPlayed).toBe(1);
    expect(stats.net).toBe(13_200);
    expect(stats.wins).toBe(1);
    expect(stats.bestNight).toBe(13_200);
  });

  it("counts a night with no cash-out as a loss of everything put in", async () => {
    const personId = await seedPerson();
    await seedNight(personId, { paidIn: 12_000, tookOut: 0 });

    const stats = await loadProfileStats(personId);
    expect(stats.net).toBe(-12_000);
    expect(stats.wins).toBe(0);
    expect(stats.worstNight).toBe(-12_000);
  });

  it("adds nights together and keeps the extremes apart", async () => {
    const personId = await seedPerson();
    await seedNight(personId, { paidIn: 3_000, tookOut: 16_200 });
    await seedNight(personId, { paidIn: 12_000, tookOut: 0 });

    const stats = await loadProfileStats(personId);
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.net).toBe(1_200);
    expect(stats.bestNight).toBe(13_200);
    expect(stats.worstNight).toBe(-12_000);
    expect(stats.winRate).toBe(0.5);
  });
});
