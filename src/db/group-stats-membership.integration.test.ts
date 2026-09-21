/**
 * Wave 4, item B (owner reversal of part of brief item 4): `loadGroupStats`'s member
 * list is driven from `people` where `user_id IS NOT NULL`, with play history
 * LEFT-joined -- not from `players` inner-joined to `people`, which made membership a
 * side effect of having played. See PLAN.md "Wave 4 scope" for the full reasoning.
 *
 * This is explicitly flagged there as "the single most dangerous change left in the
 * run": membership and the statistics beside it now come from *different* row
 * filters, which is exactly the "two aggregates, one row filter" shape AGENTS.md
 * documents having shipped here twice, silently, as zeros. These tests pin both
 * sides: membership must widen, and the count beside it must not widen with it.
 *
 * `src/db/group-stats.integration.test.ts` (wave 1a) asserted the opposite --
 * disjoint, viewer-scoped crews -- which is the delivered behaviour this change
 * deliberately undoes on the owner's instruction. That test is not edited here; its
 * "disjoint crews" case is now expected to fail, and that is reported separately.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

async function seedPerson(userId: string | null, name = "אדם") {
  const { db } = await import("@/db");
  const { people } = await import("@/db/schema");
  const id = randomUUID();
  await db.insert(people).values({ id, name, userId });
  return id;
}

async function seedGame(
  status: "active" | "closed",
  seats: { personId: string }[],
) {
  const { db } = await import("@/db");
  const { games, players } = await import("@/db/schema");
  const gameId = randomUUID();
  await db.insert(games).values({
    id: gameId,
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב בדיקה",
    buyIn: 10_000,
    rebuyAmount: 10_000,
    status,
    closedAt: status === "closed" ? new Date() : null,
    createdByPersonId: seats[0].personId,
  });
  await db.insert(players).values(
    seats.map((seat, index) => ({
      id: randomUUID(),
      gameId,
      personId: seat.personId,
      name: "שחקן",
      seatOrder: index,
      deviceId: seat.personId,
      isHost: index === 0,
    })),
  );
  return gameId;
}

describe.skipIf(!hasIntegrationDb)("loadGroupStats membership (wave 4, item B)", () => {
  let groupStats: typeof import("@/db/group-stats");

  beforeAll(async () => {
    groupStats = await import("@/db/group-stats");
  });

  it("a person with an account and no shared night appears, with zero nights", async () => {
    const viewer = await seedPerson(`user_${randomUUID()}`, "הצופה");
    await seedGame("closed", [{ personId: viewer }]);
    const strangerWithAccount = await seedPerson(`user_${randomUUID()}`, "זר עם חשבון");

    const stats = await groupStats.loadGroupStats(viewer);
    const member = stats.members.find((m) => m.personId === strangerWithAccount);
    expect(member).toBeDefined();
    expect(member?.nightsPlayed).toBe(0);
    expect(member?.lastPlayedAt).toBeNull();
  });

  it("a person with three shared closed nights appears with exactly three", async () => {
    const viewer = await seedPerson(`user_${randomUUID()}`, "הצופה");
    const regular = await seedPerson(`user_${randomUUID()}`, "קבוע");
    for (let i = 0; i < 3; i += 1) {
      await seedGame("closed", [{ personId: viewer }, { personId: regular }]);
    }

    const stats = await groupStats.loadGroupStats(viewer);
    const member = stats.members.find((m) => m.personId === regular);
    expect(member?.nightsPlayed).toBe(3);
  });

  it("a person with no account does not appear", async () => {
    const viewer = await seedPerson(`user_${randomUUID()}`, "הצופה");
    await seedGame("closed", [{ personId: viewer }]);
    const ghost = await seedPerson(null, "רוח רפאים");
    await seedGame("closed", [{ personId: viewer }, { personId: ghost }]);

    const stats = await groupStats.loadGroupStats(viewer);
    expect(stats.members.some((m) => m.personId === ghost)).toBe(false);
  });

  it("an in-progress shared game does not inflate anyone's night count", async () => {
    const viewer = await seedPerson(`user_${randomUUID()}`, "הצופה");
    const partner = await seedPerson(`user_${randomUUID()}`, "שותף");
    await seedGame("closed", [{ personId: viewer }, { personId: partner }]);
    await seedGame("active", [{ personId: viewer }, { personId: partner }]);

    const stats = await groupStats.loadGroupStats(viewer);
    const member = stats.members.find((m) => m.personId === partner);
    expect(member?.nightsPlayed).toBe(1);
  });
});
