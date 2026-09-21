/**
 * Wave 4, item A / "Item 9, corrected by the product owner": a shared seat is how two
 * people play together without the night landing on either of their personal
 * records. Not split, not halved -- excluded entirely from profile net/wins/streak
 * and from head-to-head, on both sides of the seat, while the ledger itself (the
 * settlement line, the transfer) is untouched.
 *
 * Each of `profile-stats.ts`, `streak-queries.ts` and `head-to-head.ts` already
 * documents having shipped a "two aggregates, one row filter" zero-total bug once
 * (see AGENTS.md); the exclusion here is exactly that shape of risk again, so it is
 * proven against a real branch rather than asserted on `.toSQL()` text.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

/** One closed night: `primary` occupies a seat attached to `member` as well; `solo`
 * plays their own, unshared seat. `primary` nets a win, `solo` nets a loss. */
async function seedNightWithSharedSeat() {
  const { db } = await import("@/db");
  const { buyIns, cashOuts, games, people, players, seatMembers } = await import(
    "@/db/schema"
  );

  const primary = { personId: randomUUID(), playerId: randomUUID() };
  const member = { personId: randomUUID() };
  const solo = { personId: randomUUID(), playerId: randomUUID() };
  const gameId = randomUUID();

  await db.insert(people).values([
    { id: primary.personId, name: "עיקרי", userId: `user_${primary.personId}` },
    { id: member.personId, name: "שותף/ה", userId: `user_${member.personId}` },
    { id: solo.personId, name: "עצמאי", userId: `user_${solo.personId}` },
  ]);
  await db.insert(games).values({
    id: gameId,
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב בדיקה",
    buyIn: 10_000,
    rebuyAmount: 10_000,
    status: "closed",
    closedAt: new Date(),
    createdByPersonId: primary.personId,
  });
  await db.insert(players).values([
    {
      id: primary.playerId,
      gameId,
      personId: primary.personId,
      name: "עיקרי",
      seatOrder: 0,
      isHost: true,
      deviceId: primary.personId,
    },
    {
      id: solo.playerId,
      gameId,
      personId: solo.personId,
      name: "עצמאי",
      seatOrder: 1,
      isHost: false,
      deviceId: solo.personId,
    },
  ]);
  await db.insert(seatMembers).values([
    { id: randomUUID(), gameId, playerId: primary.playerId, personId: primary.personId },
    { id: randomUUID(), gameId, playerId: primary.playerId, personId: member.personId },
  ]);
  await db.insert(buyIns).values([
    { gameId, playerId: primary.playerId, amount: 10_000, kind: "initial", opId: randomUUID() },
    { gameId, playerId: solo.playerId, amount: 10_000, kind: "initial", opId: randomUUID() },
  ]);
  await db.insert(cashOuts).values([
    { gameId, playerId: primary.playerId, amount: 15_000, adjustment: 0 },
    { gameId, playerId: solo.playerId, amount: 5_000, adjustment: 0 },
  ]);

  return { primary, member, solo, gameId };
}

describe.skipIf(!hasIntegrationDb)("shared-seat stats exclusion (wave 4, item A)", () => {
  let profileStats: typeof import("@/db/profile-stats");
  let streakQueries: typeof import("@/db/streak-queries");
  let headToHead: typeof import("@/db/head-to-head");

  beforeAll(async () => {
    profileStats = await import("@/db/profile-stats");
    streakQueries = await import("@/db/streak-queries");
    headToHead = await import("@/db/head-to-head");
  });

  it("is absent from the primary occupant's profile net and win count", async () => {
    const { primary } = await seedNightWithSharedSeat();
    const stats = await profileStats.loadProfileStats(primary.personId);
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.wins).toBe(0);
    expect(Number(stats.net)).toBe(0);
  });

  it("never appears in an attached member's profile either (no seat of their own)", async () => {
    const { member } = await seedNightWithSharedSeat();
    const stats = await profileStats.loadProfileStats(member.personId);
    expect(stats.gamesPlayed).toBe(0);
  });

  it("does not extend a streak for the primary occupant", async () => {
    const { primary } = await seedNightWithSharedSeat();
    const games = await streakQueries.getClosedStreakGames();
    const gameWithSeat = games.find((game) =>
      game.players.some((p) => p.personId === primary.personId),
    );
    expect(gameWithSeat).toBeUndefined();
  });

  it("does not count toward either side's head-to-head", async () => {
    const { primary, solo } = await seedNightWithSharedSeat();
    const record = await headToHead.loadHeadToHead(primary.personId, solo.personId);
    expect(record.nightsTogether).toBe(0);
    const reverse = await headToHead.loadHeadToHead(solo.personId, primary.personId);
    expect(reverse.nightsTogether).toBe(0);
  });

  it("an unshared seat's own night is unaffected by the exclusion", async () => {
    const { solo } = await seedNightWithSharedSeat();
    const stats = await profileStats.loadProfileStats(solo.personId);
    expect(stats.gamesPlayed).toBe(1);
    expect(Number(stats.net)).toBe(-5_000);
  });
});
