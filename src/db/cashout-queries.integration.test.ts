/**
 * Executes the cash-out lifecycle against a real Postgres branch.
 *
 * `closeSettlingGame` is a single conditional UPDATE whose predicates decide whether a
 * night can be closed at all. A `.toSQL()` assertion can only prove the text of those
 * predicates; it takes a live database to prove what they match.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  hasIntegrationDb,
  seedActiveGame,
  type SeededGame,
} from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("closeSettlingGame (integration)", () => {
  let db: typeof import("@/db/cashout-queries");
  let game: SeededGame;

  beforeAll(async () => {
    db = await import("@/db/cashout-queries");
  });

  beforeEach(async () => {
    game = await seedActiveGame(10_000);
  });

  /**
   * Puts a seat in the state `deleteLivePlayer` used to produce and now refuses: gone
   * from the table with its cash-out still on record. Written straight to the row,
   * because the point of these two tests is what `closeSettlingGame` does with such a
   * night, not how one comes to exist.
   */
  async function softDeleteSeat(playerId: string) {
    const { db: client } = await import("@/db");
    const { players } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await client
      .update(players)
      .set({ deletedAt: new Date() })
      .where(eq(players.id, playerId));
  }

  it("closes a balanced night", async () => {
    await db.beginSettling(game.gameId, game.host.personId);
    await db.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 12_000 }, false);
    await db.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 8_000 }, false);

    const closed = await db.closeSettlingGame(game.gameId, game.host.personId);
    expect(closed.status).toBe("closed");
  });

  /**
   * The regression. A seat that had already cashed out is gone from the table, and the
   * remaining ledger balances -- the cash-out screen says so. The night must still
   * close.
   *
   * `deleteLivePlayer` now refuses to create this state, because doing so lost the
   * departing player's net. The state still exists in the database from before that
   * rule, and `declineInvite` can still reach it, so the filter that makes such a night
   * closeable is still the thing under test -- set up directly rather than through an
   * API that is now, correctly, closed.
   */
  it("closes when a seat that already cashed out is no longer at the table", async () => {
    // The guest exits early, breaking even.
    await db.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 10_000 }, true);
    await softDeleteSeat(game.guest.playerId);

    await db.beginSettling(game.gameId, game.host.personId);
    await db.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 10_000 }, false);

    // What the host is looking at: a table that adds up.
    const state = await db.getCashoutState(game.gameId);
    expect(state?.difference).toBe(0);

    const closed = await db.closeSettlingGame(game.gameId, game.host.personId);
    expect(closed.status).toBe("closed");
  });

  /**
   * The other half of the same filter: a departed player's own numbers must not be
   * quietly absorbed either. Their ₪150 leaves with them, so the table is short and
   * the host is told so, rather than being handed a silent failure to close.
   */
  it("reports a departed winner's missing chips as a real difference", async () => {
    await db.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 15_000 }, true);
    await softDeleteSeat(game.guest.playerId);

    await db.beginSettling(game.gameId, game.host.personId);
    await db.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 5_000 }, false);

    const state = await db.getCashoutState(game.gameId);
    expect(state?.difference).toBe(-5_000);
    await expect(db.closeSettlingGame(game.gameId, game.host.personId)).rejects.toThrow();
  });
});

/**
 * The money a departing player took with them must stay on the books.
 *
 * Removing a seat soft-deletes its buy-ins but never touched `cash_outs`, so a player
 * who had already counted out left a ledger that no longer balanced -- and because
 * `closeSettlingGame` filters both aggregates on live seats, the night closed anyway
 * and reported the host as even while he was down by exactly their net.
 */
describe.skipIf(!hasIntegrationDb)("removing a seat that already cashed out", () => {
  let cashout: typeof import("@/db/cashout-queries");
  let live: typeof import("@/db/live-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
    live = await import("@/db/live-queries");
  });

  it("is refused, so the night cannot silently lose their net", async () => {
    const game = await seedActiveGame(10_000);
    // The guest leaves early, up ₪50. The host is ₪50 down and owes it to them.
    await cashout.saveCashout(
      game.gameId,
      game.guest.personId,
      game.guest.playerId,
      { amount: 15_000 },
      true,
    );

    await expect(
      live.deleteLivePlayer(game.gameId, game.guest.playerId, game.host.personId),
    ).rejects.toThrow();

    // Still at the table, still counted: the debt survives the attempt.
    const state = await cashout.getCashoutState(game.gameId);
    expect(state?.players.some((player) => player.id === game.guest.playerId)).toBe(true);
    expect(state?.pot).toBe(20_000);
  });

  it("still removes a seat that has not counted out", async () => {
    const game = await seedActiveGame(10_000);
    await live.deleteLivePlayer(game.gameId, game.guest.playerId, game.host.personId);

    const state = await cashout.getCashoutState(game.gameId);
    expect(state?.players.some((player) => player.id === game.guest.playerId)).toBe(false);
    expect(state?.pot).toBe(10_000);
  });
});

/**
 * The authorization hole: `resolveSeatActor` resolves an attached member to the SAME
 * `players.id` as the seat, so `attachSeatMember`'s old check --
 * `access.actor.id !== playerId` -- read true for that member too, exactly as it does
 * for the seat's real primary occupant. An attached member could attach further
 * people to a seat they do not own. Only the host or the seat's own primary occupant
 * (`players.person_id`) may extend it.
 */
describe.skipIf(!hasIntegrationDb)("attachSeatMember authorization", () => {
  let cashout: typeof import("@/db/cashout-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
  });

  it("refuses an already-attached member trying to attach someone else", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const firstMemberId = randomUUID();
    await db.insert(people).values({ id: firstMemberId, name: "שותף/ה", userId: `user_${firstMemberId}` });
    await db.insert(seatMembers).values({
      id: randomUUID(),
      gameId: game.gameId,
      playerId: game.guest.playerId,
      personId: firstMemberId,
    });

    const secondMemberId = randomUUID();
    await db.insert(people).values({
      id: secondMemberId,
      name: "שותף/ה נוסף/ת",
      userId: `user_${secondMemberId}`,
    });

    // `firstMemberId` resolves to the SAME `players.id` as the seat's own primary
    // occupant (see `resolveSeatActor`) -- this is the exact confusion the old
    // `access.actor.id !== playerId` check fell for.
    await expect(
      cashout.attachSeatMember(game.gameId, firstMemberId, game.guest.playerId, secondMemberId),
    ).rejects.toThrow();

    // Refused, not merely reported as refused: no row was written.
    const rows = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.personId, secondMemberId));
    expect(rows).toHaveLength(0);
  });

  it("the host may attach a member to any seat", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const memberId = randomUUID();
    await db.insert(people).values({ id: memberId, name: "שותף/ה", userId: `user_${memberId}` });

    await expect(
      cashout.attachSeatMember(game.gameId, game.host.personId, game.guest.playerId, memberId),
    ).resolves.toBeUndefined();

    const rows = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.personId, memberId));
    expect(rows).toHaveLength(1);
  });

  it("the seat's own primary occupant may attach a member", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const memberId = randomUUID();
    await db.insert(people).values({ id: memberId, name: "שותף/ה", userId: `user_${memberId}` });

    await expect(
      cashout.attachSeatMember(game.gameId, game.guest.personId, game.guest.playerId, memberId),
    ).resolves.toBeUndefined();

    const rows = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.personId, memberId));
    expect(rows).toHaveLength(1);
  });
});

/**
 * Membership of a closed night must be immutable -- it is what makes profile net,
 * streak and head-to-head stable once a game is done. `attachSeatMember` and
 * `detachSeatMember` must refuse a game that is not `active` or `settling`, checked
 * in the statement itself.
 */
describe.skipIf(!hasIntegrationDb)("attachSeatMember/detachSeatMember status guard", () => {
  let cashout: typeof import("@/db/cashout-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
  });

  it("refuses attaching a member to a closed game", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { games, people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(games).set({ status: "closed" }).where(eq(games.id, game.gameId));

    const memberId = randomUUID();
    await db.insert(people).values({ id: memberId, name: "שותף/ה", userId: `user_${memberId}` });

    await expect(
      cashout.attachSeatMember(game.gameId, game.host.personId, game.guest.playerId, memberId),
    ).rejects.toThrow();

    const rows = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.personId, memberId));
    expect(rows).toHaveLength(0);
  });

  it("still allows attaching a member while the game is active", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const memberId = randomUUID();
    await db.insert(people).values({ id: memberId, name: "שותף/ה", userId: `user_${memberId}` });

    await expect(
      cashout.attachSeatMember(game.gameId, game.host.personId, game.guest.playerId, memberId),
    ).resolves.toBeUndefined();

    const rows = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.personId, memberId));
    expect(rows).toHaveLength(1);
  });

  it("refuses detaching from a closed game", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { games, people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const memberId = randomUUID();
    await db.insert(people).values({ id: memberId, name: "שותף/ה", userId: `user_${memberId}` });
    await db.insert(seatMembers).values({
      id: randomUUID(),
      gameId: game.gameId,
      playerId: game.guest.playerId,
      personId: memberId,
    });
    await db.update(games).set({ status: "closed" }).where(eq(games.id, game.gameId));

    await expect(cashout.detachSeatMember(game.gameId, memberId)).rejects.toThrow();

    const rows = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.personId, memberId));
    expect(rows).toHaveLength(1);
  });
});
