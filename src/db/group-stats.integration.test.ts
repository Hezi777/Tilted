/**
 * Crew scoping (PLAN.md wave 1a item 4), against a real Postgres branch.
 *
 * `loadGroupStats`'s member query already scopes by shared games
 * (`players.gameId in viewerGames`), but it never checked `people.user_id IS NOT
 * NULL` the way `getPeopleWhoPlayedWith` does -- so a legacy, account-less Person row
 * (a "ghost") that once shared a closed night with the viewer showed up in the crew
 * list even though nobody could actually be that row today.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

async function seedClosedGame(seats: { personId: string; name: string; userId: string | null }[]) {
  const { db } = await import("@/db");
  const { games, people, players } = await import("@/db/schema");

  const gameId = randomUUID();
  await db.insert(people).values(
    seats.map((seat) => ({ id: seat.personId, name: seat.name, userId: seat.userId })),
  );
  await db.insert(games).values({
    id: gameId,
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב סגור",
    buyIn: 10_000,
    rebuyAmount: 10_000,
    status: "closed",
    closedAt: new Date(),
    createdByPersonId: seats[0].personId,
  });
  await db.insert(players).values(
    seats.map((seat, index) => ({
      id: randomUUID(),
      gameId,
      personId: seat.personId,
      name: seat.name,
      seatOrder: index,
      deviceId: seat.personId,
      isHost: index === 0,
    })),
  );
  return gameId;
}

describe.skipIf(!hasIntegrationDb)("loadGroupStats crew scoping (integration)", () => {
  let groupStats: typeof import("@/db/group-stats");

  beforeAll(async () => {
    groupStats = await import("@/db/group-stats");
  });

  it("excludes a legacy account-less person from the crew list", async () => {
    const viewer = randomUUID();
    const ghost = randomUUID();
    await seedClosedGame([
      { personId: viewer, name: "אני", userId: `user_${viewer}` },
      { personId: ghost, name: "רוח רפאים", userId: null },
    ]);

    const stats = await groupStats.loadGroupStats(viewer);
    const memberIds = stats.members.map((m) => m.personId);
    expect(memberIds).toContain(viewer);
    expect(memberIds).not.toContain(ghost);
  });

  /**
   * Retired requirement, deliberately inverted.
   *
   * This test used to assert that two viewers' crews could not see each other --
   * brief item 4, "a player should only see people they have actually played a game
   * with". The product owner reversed that after seeing it built: in an app for one
   * group of friends, somebody who has signed up but not yet finished a night with you
   * is still one of the group, and hiding them was the bug.
   *
   * What it asserts now is the pair that matters, because membership and the figures
   * beside it are deliberately computed over DIFFERENT row filters: every account
   * holder is a member, while `nightsPlayed` and `lastPlayedAt` still count only
   * closed nights the viewer shared. Assert one side alone and the dangerous version
   * of this query passes -- widening the statistics along with the membership returns
   * a silently wrong night count rather than an error.
   */
  it("shows every account holder, but counts only nights the viewer shared", async () => {
    const viewerA = randomUUID();
    const partnerA = randomUUID();
    const viewerB = randomUUID();
    const partnerB = randomUUID();

    await seedClosedGame([
      { personId: viewerA, name: "א", userId: `user_${viewerA}` },
      { personId: partnerA, name: "שותף א", userId: `user_${partnerA}` },
    ]);
    await seedClosedGame([
      { personId: viewerB, name: "ב", userId: `user_${viewerB}` },
      { personId: partnerB, name: "שותף ב", userId: `user_${partnerB}` },
    ]);

    const statsA = await groupStats.loadGroupStats(viewerA);
    const byId = new Map(statsA.members.map((m) => [m.personId, m]));

    // Membership: unscoped. Everyone with an account is part of the group now,
    // including people this viewer has never sat at a table with.
    expect(byId.has(partnerA)).toBe(true);
    expect(byId.has(partnerB)).toBe(true);
    expect(byId.has(viewerB)).toBe(true);

    // Statistics: still scoped. The night viewer A actually played counts; the night
    // that happened without them does not leak into anybody's figures.
    expect(byId.get(partnerA)?.nightsPlayed).toBe(1);
    expect(byId.get(partnerB)?.nightsPlayed).toBe(0);
    expect(byId.get(partnerB)?.lastPlayedAt).toBeNull();
  });
});
