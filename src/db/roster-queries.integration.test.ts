/**
 * Claiming a seat, against a real Postgres branch.
 *
 * The rule under test is an arithmetic one -- how many `initial` buy-ins a seat ends up
 * with -- and it is decided by a `NOT EXISTS` predicate inside a data-modifying CTE. A
 * `.toSQL()` assertion can only prove the text of that predicate; proving what it
 * matches takes a live database.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("claimInvitedSeat (integration)", () => {
  let roster: typeof import("@/db/roster-queries");

  beforeAll(async () => {
    roster = await import("@/db/roster-queries");
  });

  /**
   * Seats the two shapes a game can contain, and returns the room code.
   *
   * `paidUpFront` is the difference that matters: `createGame` writes an `initial`
   * buy-in for every seat it makes (spec 5.2) but leaves the guest seats unclaimed,
   * while `addPlayerToGame` makes an unclaimed seat with no buy-in at all. Both arrive
   * at `claimInvitedSeat` looking identical apart from that row.
   */
  async function seedUnclaimedSeat(paidUpFront: boolean) {
    const { db } = await import("@/db");
    const { randomUUID } = await import("node:crypto");
    const { buyIns, games, people, players } = await import("@/db/schema");

    const hostPerson = randomUUID();
    const guestPerson = randomUUID();
    const gameId = randomUUID();
    const hostPlayer = randomUUID();
    const guestPlayer = randomUUID();
    const code = randomUUID().slice(0, 6).toUpperCase();
    const buyIn = 10_000;

    await db.insert(people).values([
      { id: hostPerson, name: "מארח", userId: `user_${hostPerson}` },
      { id: guestPerson, name: "אורח", userId: `user_${guestPerson}` },
    ]);
    await db.insert(games).values({
      id: gameId,
      code,
      name: "ערב בדיקה",
      buyIn,
      rebuyAmount: buyIn,
      status: "active",
      createdByPersonId: hostPerson,
    });
    await db.insert(players).values([
      {
        id: hostPlayer,
        gameId,
        personId: hostPerson,
        name: "מארח",
        seatOrder: 0,
        deviceId: hostPerson,
        isHost: true,
      },
      // Unclaimed: no device id until its owner opens the room.
      {
        id: guestPlayer,
        gameId,
        personId: guestPerson,
        name: "אורח",
        seatOrder: 1,
        deviceId: null,
        isHost: false,
      },
    ]);

    const rows = [
      {
        id: randomUUID(),
        gameId,
        playerId: hostPlayer,
        amount: buyIn,
        kind: "initial" as const,
        opId: randomUUID(),
        createdByDevice: hostPerson,
      },
    ];
    if (paidUpFront) {
      rows.push({
        id: randomUUID(),
        gameId,
        playerId: guestPlayer,
        amount: buyIn,
        kind: "initial" as const,
        opId: randomUUID(),
        createdByDevice: hostPerson,
      });
    }
    await db.insert(buyIns).values(rows);

    return { code, gameId, guestPerson, guestPlayer, buyIn };
  }

  async function liveBuyIns(playerId: string) {
    const { db } = await import("@/db");
    const { buyIns } = await import("@/db/schema");
    const { and, eq, isNull } = await import("drizzle-orm");
    return db
      .select()
      .from(buyIns)
      .where(and(eq(buyIns.playerId, playerId), isNull(buyIns.deletedAt)));
  }

  /**
   * The regression. The host picks everyone at setup, so every seat is already paid
   * for; each guest then opens the room code to take their seat. Claiming must not
   * charge them again -- a table of six at ₪100 read as ₪1,100 instead of ₪600 once
   * everyone had tapped the link, and the pot is the number the whole night settles on.
   */
  it("does not charge a seat that was already paid for at creation", async () => {
    const seat = await seedUnclaimedSeat(true);

    await roster.joinGameByCode(seat.code, seat.guestPerson);

    const rows = await liveBuyIns(seat.guestPlayer);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(seat.buyIn);
  });

  /** The other half: a mid-game invite really does owe its buy-in on acceptance. */
  it("writes the deferred buy-in for a seat that has none", async () => {
    const seat = await seedUnclaimedSeat(false);

    await roster.joinGameByCode(seat.code, seat.guestPerson);

    const rows = await liveBuyIns(seat.guestPlayer);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(seat.buyIn);
  });

  /** Claiming is idempotent: tapping the link twice is one seat and one buy-in. */
  it("stays at one buy-in when the link is opened twice", async () => {
    const seat = await seedUnclaimedSeat(false);

    await roster.joinGameByCode(seat.code, seat.guestPerson);
    await roster.joinGameByCode(seat.code, seat.guestPerson);

    expect(await liveBuyIns(seat.guestPlayer)).toHaveLength(1);
  });

  it("cannot use an instant-join grant for a different game with this room code", async () => {
    const seat = await seedUnclaimedSeat(false);
    const { randomUUID } = await import("node:crypto");
    await expect(roster.joinGameByCode(seat.code, seat.guestPerson, randomUUID())).rejects.toThrow();
    expect(await liveBuyIns(seat.guestPlayer)).toHaveLength(0);
  });

  it("accepts a grant bound to this game without charging twice", async () => {
    const seat = await seedUnclaimedSeat(false);
    await roster.joinGameByCode(seat.code, seat.guestPerson, seat.gameId);
    await roster.joinGameByCode(seat.code, seat.guestPerson, seat.gameId);
    expect(await liveBuyIns(seat.guestPlayer)).toHaveLength(1);
  });

  it("instantly seats a new arrival with their character, one buy-in and no pending request", async () => {
    const seat = await seedUnclaimedSeat(false);
    const { db } = await import("@/db");
    const { players, seatMembers, joinRequests } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(players).where(eq(players.id, seat.guestPlayer));
    await db.insert(joinRequests).values({ gameId: seat.gameId, personId: seat.guestPerson });

    const joined = await roster.joinGameByCode(seat.code, seat.guestPerson, seat.gameId);
    await roster.joinGameByCode(seat.code, seat.guestPerson, seat.gameId);

    const [player] = await db.select().from(players).where(eq(players.id, joined.playerId));
    expect(player.avatarKey).toBeTruthy();
    expect(player.deviceId).toBe(seat.guestPerson);
    expect(player.isHost).toBe(false);
    expect(await liveBuyIns(joined.playerId)).toHaveLength(1);
    expect(await db.select().from(seatMembers).where(eq(seatMembers.playerId, joined.playerId))).toHaveLength(1);
    expect(await db.select().from(joinRequests).where(eq(joinRequests.gameId, seat.gameId))).toHaveLength(0);
  });

  it("does not let instant links exceed the table capacity", async () => {
    const seat = await seedUnclaimedSeat(false);
    const { db } = await import("@/db");
    const { people, players } = await import("@/db/schema");
    const { randomUUID } = await import("node:crypto");
    const extraPeople = Array.from({ length: 9 }, (_, i) => ({ id: randomUUID(), userId: randomUUID(), name: `Capacity ${i}` }));
    await db.insert(people).values(extraPeople);
    await db.insert(players).values(extraPeople.slice(0, 8).map((person, i) => ({
      gameId: seat.gameId, personId: person.id, name: person.name, seatOrder: i + 2,
    })));
    await expect(roster.joinGameByCode(seat.code, extraPeople[8].id, seat.gameId)).rejects.toThrow("10");
  });
});
