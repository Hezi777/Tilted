/**
 * Seat count cap (PLAN.md wave 1a item 6 / docs/2026-09-audit.md open item 8), against
 * a real Postgres branch.
 *
 * The cap used to be enforced only in `createGame`. Growth after creation funnels
 * through `addPlayerToGame`, which both join approval (`approveJoinRequest`) and
 * direct host addition call -- so both are proven here by exercising
 * `addPlayerToGame` directly and through `approveJoinRequest`.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";
import { MAX_SEATS } from "@/lib/seat-layout";

async function seedActiveGameWithSeats(seatCount: number) {
  const { db } = await import("@/db");
  const { games, people, players } = await import("@/db/schema");

  const hostPersonId = randomUUID();
  const gameId = randomUUID();

  await db.insert(people).values({ id: hostPersonId, name: "מארח", userId: `user_${hostPersonId}` });
  await db.insert(games).values({
    id: gameId,
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב בדיקה",
    buyIn: 10_000,
    rebuyAmount: 10_000,
    status: "active",
    createdByPersonId: hostPersonId,
  });
  await db.insert(players).values({
    id: randomUUID(),
    gameId,
    personId: hostPersonId,
    name: "מארח",
    seatOrder: 0,
    deviceId: hostPersonId,
    isHost: true,
  });

  const extraPersonIds: string[] = [];
  for (let i = 1; i < seatCount; i += 1) {
    const personId = randomUUID();
    extraPersonIds.push(personId);
    await db.insert(people).values({ id: personId, name: `שחקן ${i}`, userId: `user_${personId}` });
    await db.insert(players).values({
      id: randomUUID(),
      gameId,
      personId,
      name: `שחקן ${i}`,
      seatOrder: i,
      deviceId: personId,
      isHost: false,
    });
  }

  return { gameId, hostPersonId, extraPersonIds };
}

describe.skipIf(!hasIntegrationDb)("seat count cap (integration)", () => {
  let roster: typeof import("@/db/roster-queries");
  let joinRequestQueries: typeof import("@/db/join-request-queries");

  beforeAll(async () => {
    roster = await import("@/db/roster-queries");
    joinRequestQueries = await import("@/db/join-request-queries");
  });

  it("refuses addPlayerToGame past MAX_SEATS", async () => {
    const { gameId, hostPersonId } = await seedActiveGameWithSeats(MAX_SEATS);
    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");

    const newcomerId = randomUUID();
    await db.insert(people).values({ id: newcomerId, name: "מיותר", userId: `user_${newcomerId}` });

    await expect(
      roster.addPlayerToGame(gameId, hostPersonId, { personId: newcomerId }),
    ).rejects.toMatchObject({ message: "השולחן מלא" });
  });

  it("allows exactly MAX_SEATS but not one more", async () => {
    const { gameId, hostPersonId } = await seedActiveGameWithSeats(MAX_SEATS - 1);
    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");

    const lastSeatId = randomUUID();
    await db.insert(people).values({ id: lastSeatId, name: "אחרון", userId: `user_${lastSeatId}` });
    await expect(
      roster.addPlayerToGame(gameId, hostPersonId, { personId: lastSeatId }),
    ).resolves.toBeDefined();

    const oneTooManyId = randomUUID();
    await db.insert(people).values({ id: oneTooManyId, name: "מיותר", userId: `user_${oneTooManyId}` });
    await expect(
      roster.addPlayerToGame(gameId, hostPersonId, { personId: oneTooManyId }),
    ).rejects.toMatchObject({ message: "השולחן מלא" });
  });

  it("refuses an eleventh player through join-request approval too", async () => {
    const { gameId, hostPersonId } = await seedActiveGameWithSeats(MAX_SEATS);
    const { db } = await import("@/db");
    const { people, joinRequests } = await import("@/db/schema");

    const knockerId = randomUUID();
    await db.insert(people).values({ id: knockerId, name: "דופק בדלת", userId: `user_${knockerId}` });
    await db.insert(joinRequests).values({ id: randomUUID(), gameId, personId: knockerId });

    await expect(
      joinRequestQueries.approveJoinRequest(gameId, hostPersonId, knockerId),
    ).rejects.toMatchObject({ message: "השולחן מלא" });
  });

  it("refuses more seats than MAX_SEATS at creation", async () => {
    const { createGame } = await import("@/db/queries");
    const personIds = Array.from({ length: MAX_SEATS + 1 }, () => randomUUID());
    await expect(
      createGame(
        {
          buyIn: 10_000,
          rebuyAmount: 10_000,
          plannedEndAt: new Date(),
          personIds,
          hostPersonId: personIds[0],
        },
        "some-device",
      ),
    ).rejects.toThrow();
  });
});
