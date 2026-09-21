/**
 * Cross-device avatar visibility (PLAN.md wave 1a item 1), against a real Postgres
 * branch, driven through the two-client harness.
 *
 * Reproduction first: `getLiveGameVersion` is a fingerprint over `players`, and the
 * players CTE hashes count/deleted_at/settled_at/device_id but never `avatar_key` --
 * while `getLiveGame` (what actually renders a seat) reads the character from
 * `players.avatar_key`. A first claim bumps `count(device_id)` from 0 to 1, so it is
 * caught. Re-picking a character on a seat that is already claimed changes only
 * `avatar_key`; `device_id` does not move, so the fingerprint does not move either,
 * and the other phone is stuck on its cached read until the 30s safety refresh. This
 * is the exact "they don't see it" symptom, reproduced without a browser.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";
import { seedTwoClientRoom } from "@/db/test-support/two-client-harness";

describe.skipIf(!hasIntegrationDb)("avatar visibility across two clients (integration)", () => {
  let roster: typeof import("@/db/roster-queries");

  beforeAll(async () => {
    roster = await import("@/db/roster-queries");
  });

  it("changes the fingerprint when a seat already claimed picks a different character", async () => {
    const room = await seedTwoClientRoom();

    const before = await room.pollVersion();

    // The guest's seat is already claimed (device_id = guest.personId, from
    // seedActiveGame). Re-picking a character is the same action a player takes from
    // their profile at the table -- not a first claim.
    await roster.claimPlayer(room.gameId, room.guest.playerId, room.guest.personId, "cap");

    const after = await room.pollVersion();

    // What the host's phone would actually render on its next full read, independent
    // of whether the fingerprint told it to refresh.
    const hostView = await room.readAs(room.host.personId);
    const guestSeat = hostView?.players.find((p) => p.id === room.guest.playerId);
    expect(guestSeat?.avatarKey).toBe("cap");

    expect(after).not.toBe(before);
  });

  it("propagates a claimed character to the person's profile", async () => {
    const room = await seedTwoClientRoom();

    await roster.claimPlayer(room.gameId, room.guest.playerId, room.guest.personId, "glasses");

    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [person] = await db
      .select({ avatarKey: people.avatarKey })
      .from(people)
      .where(eq(people.id, room.guest.personId));

    expect(person?.avatarKey).toBe("glasses");
  });
});

/**
 * Delete player (PLAN.md wave 1a item 2). Three gates guard this, and the plan
 * requires proving each one directly at the data layer, as the wrong user, rather
 * than through a UI that hides the control.
 */
describe.skipIf(!hasIntegrationDb)("deleteLivePlayer (integration)", () => {
  let live: typeof import("@/db/live-queries");
  let AuthzErrorCtor: typeof import("@/lib/authz").AuthzError;

  beforeAll(async () => {
    live = await import("@/db/live-queries");
    ({ AuthzError: AuthzErrorCtor } = await import("@/lib/authz"));
  });

  it("refuses a non-host", async () => {
    const room = await seedTwoClientRoom();
    await expect(
      live.deleteLivePlayer(room.gameId, room.host.playerId, room.guest.personId),
    ).rejects.toMatchObject({ code: "not_host" });
  });

  it("refuses a seat that has already counted out", async () => {
    const room = await seedTwoClientRoom();
    const { db } = await import("@/db");
    const { cashOuts } = await import("@/db/schema");
    const { randomUUID } = await import("node:crypto");
    await db.insert(cashOuts).values({
      id: randomUUID(),
      gameId: room.gameId,
      playerId: room.guest.playerId,
      amount: 5_000,
    });

    await expect(
      live.deleteLivePlayer(room.gameId, room.guest.playerId, room.host.personId),
    ).rejects.toMatchObject({ code: "player_settled" });
  });

  it("refuses the host deleting their own seat, and still allows deleting another live seat", async () => {
    const room = await seedTwoClientRoom();

    // The host's own seat: excluded from the delete target even though the caller
    // is the host and the seat has not counted out. Deleting it would leave the
    // game with no players.is_host row at all -- players_game_id_host_unique means
    // nobody else can become one, stranding close/reopen/cancel and roster
    // management. The successor hand-off (exitHostAsSuccessor) is the only door out.
    await expect(
      live.deleteLivePlayer(room.gameId, room.host.playerId, room.host.personId),
    ).rejects.toMatchObject({ code: "host_cannot_remove_self" });

    // The host may still remove any other live seat.
    await expect(
      live.deleteLivePlayer(room.gameId, room.guest.playerId, room.host.personId),
    ).resolves.toBeUndefined();
  });

  it("soft-deletes a seat and its buy-ins, and leaves the remaining pot summing correctly", async () => {
    const room = await seedTwoClientRoom();
    const { db } = await import("@/db");
    const { players, buyIns } = await import("@/db/schema");
    const { eq, and, isNull } = await import("drizzle-orm");

    await live.deleteLivePlayer(room.gameId, room.guest.playerId, room.host.personId);

    const [deletedPlayer] = await db
      .select({ deletedAt: players.deletedAt })
      .from(players)
      .where(eq(players.id, room.guest.playerId));
    expect(deletedPlayer?.deletedAt).not.toBeNull();

    const liveBuyIns = await db
      .select({ id: buyIns.id })
      .from(buyIns)
      .where(and(eq(buyIns.playerId, room.guest.playerId), isNull(buyIns.deletedAt)));
    expect(liveBuyIns).toHaveLength(0);

    // The removed player's stake left the books with them -- the remaining live
    // seat's buy-ins are still exactly what that seat put in, nothing more or less.
    const remaining = await db
      .select({ amount: buyIns.amount })
      .from(buyIns)
      .where(and(eq(buyIns.playerId, room.host.playerId), isNull(buyIns.deletedAt)));
    const remainingTotal = remaining.reduce((sum, row) => sum + row.amount, 0);
    expect(remainingTotal).toBe(10_000);
  });

  it("is refused while settling before the fix, and allowed after it", async () => {
    const room = await seedTwoClientRoom();
    const { db } = await import("@/db");
    const { games } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(games).set({ status: "settling" }).where(eq(games.id, room.gameId));

    await expect(
      live.deleteLivePlayer(room.gameId, room.guest.playerId, room.host.personId),
    ).resolves.toBeUndefined();
  });

  it("surfaces a Hebrew message, not the English error code, when the game is inactive", async () => {
    const room = await seedTwoClientRoom();
    const { db } = await import("@/db");
    const { games } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(games).set({ status: "closed" }).where(eq(games.id, room.gameId));

    try {
      await live.deleteLivePlayer(room.gameId, room.guest.playerId, room.host.personId);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthzErrorCtor);
      expect((error as InstanceType<typeof AuthzErrorCtor>).message).toBe("המשחק כבר לא פעיל");
    }
  });
});
