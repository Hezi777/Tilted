/**
 * Wave 4, item A: "both members see the night in their own history, openable" --
 * against a real branch, because `getHistoryList`'s merge of the primary-seat query
 * (`buildHistoryListQuery`, whose compiled SQL is pinned by `history-queries.test.ts`
 * and deliberately left untouched) with the new member-attached path is exactly the
 * kind of join this codebase has gotten wrong silently before.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

async function seedSharedNight() {
  const { db } = await import("@/db");
  const { buyIns, games, people, players, seatMembers } = await import("@/db/schema");

  const primary = { personId: randomUUID(), playerId: randomUUID() };
  const member = { personId: randomUUID() };
  const gameId = randomUUID();

  await db.insert(people).values([
    { id: primary.personId, name: "עיקרי", userId: `user_${primary.personId}` },
    { id: member.personId, name: "שותף/ה", userId: `user_${member.personId}` },
  ]);
  await db.insert(games).values({
    id: gameId,
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב משותף",
    buyIn: 10_000,
    rebuyAmount: 10_000,
    status: "closed",
    closedAt: new Date(),
    createdByPersonId: primary.personId,
  });
  await db.insert(players).values({
    id: primary.playerId,
    gameId,
    personId: primary.personId,
    name: "עיקרי",
    seatOrder: 0,
    isHost: true,
    deviceId: primary.personId,
  });
  await db.insert(seatMembers).values([
    { id: randomUUID(), gameId, playerId: primary.playerId, personId: primary.personId },
    { id: randomUUID(), gameId, playerId: primary.playerId, personId: member.personId },
  ]);
  await db.insert(buyIns).values({
    gameId,
    playerId: primary.playerId,
    amount: 10_000,
    kind: "initial",
    opId: randomUUID(),
  });

  return { primary, member, gameId };
}

describe.skipIf(!hasIntegrationDb)("history shows a shared night to both members", () => {
  let historyQueries: typeof import("@/db/history-queries");

  beforeAll(async () => {
    historyQueries = await import("@/db/history-queries");
  });

  it("the primary occupant sees it, marked as shared", async () => {
    const { primary, gameId } = await seedSharedNight();
    const list = await historyQueries.getHistoryList(primary.personId);
    const row = list.find((item) => item.id === gameId);
    expect(row).toBeDefined();
    expect(row?.viewerSeatShared).toBe(true);
  });

  it("the attached member -- who has no players row of their own -- also sees it, marked as shared", async () => {
    const { member, gameId } = await seedSharedNight();
    const list = await historyQueries.getHistoryList(member.personId);
    const row = list.find((item) => item.id === gameId);
    expect(row).toBeDefined();
    expect(row?.viewerSeatShared).toBe(true);
  });

  it("an unshared seat is not marked shared", async () => {
    const { db } = await import("@/db");
    const { buyIns, games, people, players } = await import("@/db/schema");
    const personId = randomUUID();
    const playerId = randomUUID();
    const gameId = randomUUID();
    await db.insert(people).values({ id: personId, name: "עצמאי", userId: `user_${personId}` });
    await db.insert(games).values({
      id: gameId,
      code: randomUUID().slice(0, 6).toUpperCase(),
      buyIn: 10_000,
      rebuyAmount: 10_000,
      status: "closed",
      closedAt: new Date(),
      createdByPersonId: personId,
    });
    await db.insert(players).values({
      id: playerId,
      gameId,
      personId,
      name: "עצמאי",
      seatOrder: 0,
      isHost: true,
      deviceId: personId,
    });
    await db.insert(buyIns).values({
      gameId,
      playerId,
      amount: 10_000,
      kind: "initial",
      opId: randomUUID(),
    });

    const list = await historyQueries.getHistoryList(personId);
    const row = list.find((item) => item.id === gameId);
    expect(row?.viewerSeatShared).toBe(false);
  });
});
