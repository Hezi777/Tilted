/**
 * Wave 2 (tilted-counting): items 3 (attribution), 5 (chip-count completion) and 9
 * (shared seats), against a real Postgres branch.
 *
 * The three corrections the plan calls out explicitly, each with its own test here:
 * the close gate reads completion, not row existence; `entered_by_person_id` is a
 * Person, not a Player; and a shared seat's member is resolved with `isHost: false`,
 * always -- proven by an actor who is attached to the host's own seat being refused
 * every host action.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";
import { computeNets, potTotal, settle, type PlayerLedger } from "@/lib/settlement";
import { agorot } from "@/lib/money";

interface Seat {
  personId: string;
  playerId: string;
  name: string;
  isHost: boolean;
}

async function seedGame(seatSpecs: Array<{ name: string; isHost?: boolean }>) {
  const { db } = await import("@/db");
  const { buyIns, games, people, players } = await import("@/db/schema");

  const gameId = randomUUID();
  const seats: Seat[] = seatSpecs.map((spec) => ({
    personId: randomUUID(),
    playerId: randomUUID(),
    name: spec.name,
    isHost: spec.isHost ?? false,
  }));

  await db.insert(people).values(
    seats.map((seat) => ({ id: seat.personId, name: seat.name, userId: `user_${seat.personId}` })),
  );
  await db.insert(games).values({
    id: gameId,
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב בדיקה",
    buyIn: 10_000,
    rebuyAmount: 10_000,
    status: "active",
    createdByPersonId: seats.find((seat) => seat.isHost)?.personId ?? seats[0].personId,
  });
  await db.insert(players).values(
    seats.map((seat, index) => ({
      id: seat.playerId,
      gameId,
      personId: seat.personId,
      name: seat.name,
      seatOrder: index,
      deviceId: seat.personId,
      isHost: seat.isHost,
    })),
  );
  await db.insert(buyIns).values(
    seats.map((seat) => ({
      gameId,
      playerId: seat.playerId,
      amount: 10_000,
      kind: "initial" as const,
      opId: randomUUID(),
      createdByDevice: seat.personId,
    })),
  );

  return { gameId, seats };
}

/** Attaches `personId` to `playerId`'s seat as a shared member (plan item 9), the way
 * `attachSeatMember` would, but written directly so these tests do not depend on the
 * route/authorization path under test elsewhere in this file. */
async function addSeatMember(gameId: string, playerId: string, personId: string, name: string) {
  const { db } = await import("@/db");
  const { people, seatMembers } = await import("@/db/schema");
  await db.insert(people).values({ id: personId, name, userId: `user_${personId}` });
  await db.insert(seatMembers).values({ id: randomUUID(), gameId, playerId, personId });
}

describe.skipIf(!hasIntegrationDb)("item 3 -- attribution", () => {
  let cashout: typeof import("@/db/cashout-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
  });

  it("a non-host writing another seat's result is refused", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח א" },
      { name: "אורח ב" },
    ]);
    const [, guestA, guestB] = seats;
    await cashout.beginSettling(gameId, seats[0].personId);

    await expect(
      cashout.saveCashout(gameId, guestA.personId, guestB.playerId, { amount: 1_000 }, false),
    ).rejects.toThrow();
  });

  it("the host writing any seat succeeds and is recorded as the host's own Person", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, guest.playerId, { amount: 8_000 }, false);

    const state = await cashout.getCashoutState(gameId);
    const row = state?.players.find((player) => player.id === guest.playerId);
    expect(row?.enteredByPersonId).toBe(host.personId);
  });

  it("a player entering their own result is recorded as themselves", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 12_000 }, false);

    const state = await cashout.getCashoutState(gameId);
    const row = state?.players.find((player) => player.id === guest.playerId);
    expect(row?.enteredByPersonId).toBe(guest.personId);
  });

  it("a shared-seat member entering the seat's result is recorded as that member, not the seat", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    const memberPersonId = randomUUID();
    await addSeatMember(gameId, guest.playerId, memberPersonId, "בן/בת זוג");

    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, memberPersonId, guest.playerId, { amount: 9_000 }, false);

    const state = await cashout.getCashoutState(gameId);
    const row = state?.players.find((player) => player.id === guest.playerId);
    // Attribution is the member's own Person id -- not guest.personId, which would
    // go silent the moment two members shared a seat (the bug the corrected column
    // exists to prevent).
    expect(row?.enteredByPersonId).toBe(memberPersonId);
    expect(row?.enteredByPersonId).not.toBe(guest.personId);
  });

  it("a non-member is refused entirely", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח א" },
      { name: "אורח ב" },
    ]);
    const [host, guestA, guestB] = seats;
    await cashout.beginSettling(gameId, host.personId);

    const stranger = randomUUID();
    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");
    await db.insert(people).values({ id: stranger, name: "זר", userId: `user_${stranger}` });

    await expect(
      cashout.saveCashout(gameId, stranger, guestA.playerId, { amount: 1_000 }, false),
    ).rejects.toThrow();
    void guestB;
  });
});

describe.skipIf(!hasIntegrationDb)("item 5 -- chip-count completion", () => {
  let cashout: typeof import("@/db/cashout-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
  });

  it("₪0 counts as done and can close", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 20_000 }, false, true);
    // The guest counted a total loss and pressed "סיימתי לספור" -- ₪0, done.
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 0 }, false, true);

    const closed = await cashout.closeSettlingGame(gameId, host.personId);
    expect(closed.status).toBe("closed");
  });

  it("close is refused with one seat outstanding, allowed once every seat is done", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 10_000 }, false, true);
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 10_000 }, false, false);

    await expect(cashout.closeSettlingGame(gameId, host.personId)).rejects.toThrow();

    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 10_000 }, false, true);
    const closed = await cashout.closeSettlingGame(gameId, host.personId);
    expect(closed.status).toBe("closed");
  });

  it("a row with cash_outs but edited back to not-done blocks the close (row existence is not completion)", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 10_000 }, false, true);
    // Finished once, then reopened by an edit -- the cash_outs row still exists.
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 9_000 }, false, true);
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 11_000 }, false, false);

    const state = await cashout.getCashoutState(gameId);
    const row = state?.players.find((player) => player.id === guest.playerId);
    expect(row?.cashOut).toBe(11_000);
    expect(row?.countDoneAt).toBeNull();
    await expect(cashout.closeSettlingGame(gameId, host.personId)).rejects.toThrow();
  });

  it("an early exit always finishes counting, even without the done flag", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [, guest] = seats;
    // Early exit while still active -- `done` is not even meaningful here.
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 15_000 }, true);

    const state = await cashout.getCashoutState(gameId);
    const row = state?.players.find((player) => player.id === guest.playerId);
    expect(row?.countDoneAt).not.toBeNull();
  });

  it("a host override of a frozen early-exit result cannot clear its done flag", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 15_000 }, true);
    await cashout.beginSettling(gameId, host.personId);

    // The host corrects the frozen number, passing done: false -- the departed
    // player cannot come back to reconfirm, so this must not reopen the seat.
    await cashout.saveCashout(gameId, host.personId, guest.playerId, { amount: 16_000 }, false, false);

    const state = await cashout.getCashoutState(gameId);
    const row = state?.players.find((player) => player.id === guest.playerId);
    expect(row?.cashOut).toBe(16_000);
    expect(row?.countDoneAt).not.toBeNull();
  });

  it("mismatch resolution checks completion, not row existence", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 15_000 }, false, true);
    // Guest has a cash_outs row but is not done -- resolving must refuse.
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 5_000 }, false, false);

    await expect(
      cashout.applyMismatchResolution(gameId, host.personId, { kind: "recount" }),
    ).rejects.toThrow();
  });

  it("reopening resets done for seats still playing, but not for early-settled seats", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח א" },
      { name: "אורח ב" },
    ]);
    const [host, guestA, guestB] = seats;
    // Guest A leaves early -- frozen and done.
    await cashout.saveCashout(gameId, guestA.personId, guestA.playerId, { amount: 15_000 }, true);
    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 10_000 }, false, true);
    await cashout.saveCashout(gameId, guestB.personId, guestB.playerId, { amount: 5_000 }, false, true);

    await cashout.reopenSettlingGame(gameId, host.personId);

    const state = await cashout.getCashoutState(gameId);
    const rowA = state?.players.find((player) => player.id === guestA.playerId);
    const rowHost = state?.players.find((player) => player.id === host.playerId);
    const rowB = state?.players.find((player) => player.id === guestB.playerId);
    expect(rowA?.countDoneAt).not.toBeNull(); // early-settled: untouched
    expect(rowHost?.countDoneAt).toBeNull(); // still playing: reset
    expect(rowB?.countDoneAt).toBeNull(); // still playing: reset
  });
});

describe.skipIf(!hasIntegrationDb)("item 9 -- shared seats", () => {
  let cashout: typeof import("@/db/cashout-queries");
  let settlementQueries: typeof import("@/db/settlement-queries");
  let live: typeof import("@/db/live-queries");
  let roster: typeof import("@/db/roster-queries");
  let transferQueries: typeof import("@/db/transfer-queries");
  let historyQueries: typeof import("@/db/history-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
    settlementQueries = await import("@/db/settlement-queries");
    live = await import("@/db/live-queries");
    roster = await import("@/db/roster-queries");
    transferQueries = await import("@/db/transfer-queries");
    historyQueries = await import("@/db/history-queries");
  });

  it("a member may write the seat's result; a non-member may not", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    const memberPersonId = randomUUID();
    await addSeatMember(gameId, guest.playerId, memberPersonId, "שותף/ה");
    await cashout.beginSettling(gameId, host.personId);

    await expect(
      cashout.saveCashout(gameId, memberPersonId, guest.playerId, { amount: 4_000 }, false, true),
    ).resolves.toBeTruthy();

    const stranger = randomUUID();
    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");
    await db.insert(people).values({ id: stranger, name: "זר", userId: `user_${stranger}` });
    await expect(
      cashout.saveCashout(gameId, stranger, guest.playerId, { amount: 4_000 }, false, true),
    ).rejects.toThrow();
  });

  it("the escalation test -- a member of the host's seat is refused every host action", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "אורח" },
    ]);
    const [host, guest] = seats;
    const memberPersonId = randomUUID();
    // Attached to the HOST's own seat -- the exact shape Codex's review flagged:
    // resolving this actor through the seat's Player row would hand them
    // `players.is_host` and, with it, every host-only action below.
    await addSeatMember(gameId, host.playerId, memberPersonId, "בן זוג של המארח");

    const { db } = await import("@/db");
    const { games, players } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const readGame = () =>
      db.query.games.findFirst({ where: eq(games.id, gameId) });
    const countPlayers = async () =>
      (await db.select({ id: players.id }).from(players).where(eq(players.gameId, gameId)))
        .length;

    await expect(cashout.beginSettling(gameId, memberPersonId)).rejects.toThrow();
    // A rejected write must not have committed: still "active", nothing settling.
    expect((await readGame())?.status).toBe("active");

    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 10_000 }, false, true);
    await cashout.saveCashout(gameId, guest.personId, guest.playerId, { amount: 10_000 }, false, true);

    await expect(cashout.closeSettlingGame(gameId, memberPersonId)).rejects.toThrow();
    expect((await readGame())?.status).toBe("settling");
    expect((await readGame())?.closedAt).toBeNull();

    await expect(
      cashout.applyMismatchResolution(gameId, memberPersonId, { kind: "recount" }),
    ).rejects.toThrow();
    expect((await readGame())?.mismatchKind).toBe("none");

    await expect(cashout.reopenSettlingGame(gameId, memberPersonId)).rejects.toThrow();
    expect((await readGame())?.status).toBe("settling");

    const playerCountBefore = await countPlayers();
    await expect(
      live.deleteLivePlayer(gameId, guest.playerId, memberPersonId),
    ).rejects.toThrow();
    const [guestRow] = await db
      .select({ deletedAt: players.deletedAt })
      .from(players)
      .where(eq(players.id, guest.playerId));
    expect(guestRow?.deletedAt).toBeNull();

    await expect(
      roster.addPlayerToGame(gameId, memberPersonId, { personId: randomUUID() }),
    ).rejects.toThrow();
    // No seat was added on the rejected host-only action either.
    expect(await countPlayers()).toBe(playerCountBefore);
  });

  it("the read model yields exactly one ledger and one transfer identity from three members", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "משפחה" },
    ]);
    const [host, family] = seats;
    const memberOne = randomUUID();
    const memberTwo = randomUUID();
    await addSeatMember(gameId, family.playerId, memberOne, "בן");
    await addSeatMember(gameId, family.playerId, memberTwo, "בת");

    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 5_000 }, false, true);
    await cashout.saveCashout(gameId, memberOne, family.playerId, { amount: 15_000 }, false, true);
    await cashout.closeSettlingGame(gameId, host.personId);

    const settlement = await settlementQueries.getSettlementState(gameId);
    // One seat, one line -- not three, despite three Persons attached.
    expect(settlement?.players).toHaveLength(2);
    const familyLine = settlement?.players.find((player) => player.id === family.playerId);
    expect(familyLine?.name).toContain("משפחה");
    expect(familyLine?.name).toContain("בן");
    expect(familyLine?.name).toContain("בת");

    const transfers = await transferQueries.listTransfers(gameId);
    // One transfer identity for the whole seat, not one per member.
    const distinctFrom = new Set((transfers ?? []).map((t) => t.from.playerId));
    const distinctTo = new Set((transfers ?? []).map((t) => t.to.playerId));
    expect(distinctFrom.size + distinctTo.size).toBeLessThanOrEqual(2);
    void historyQueries;
  });

  it("total in equals total out, including a shared seat and a deleted player", async () => {
    const { gameId, seats } = await seedGame([
      { name: "מארח", isHost: true },
      { name: "משפחה" },
      { name: "עוזב מוקדם" },
    ]);
    const [host, family, leaver] = seats;
    const memberPersonId = randomUUID();
    await addSeatMember(gameId, family.playerId, memberPersonId, "שותף/ה");

    // The leaver is removed before ever cashing out -- `deleteLivePlayer` refuses to
    // remove a seat that already has a `cash_outs` row (wave 1a's fix, proven in
    // `cashout-queries.integration.test.ts`), so this is the one shape of "a deleted
    // player" that can still exist at settlement. Their buy-in leaves with them.
    await live.deleteLivePlayer(gameId, leaver.playerId, host.personId);

    await cashout.beginSettling(gameId, host.personId);
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 5_000 }, false, true);
    await cashout.saveCashout(gameId, memberPersonId, family.playerId, { amount: 15_000 }, false, true);

    const state = await cashout.getCashoutState(gameId);
    expect(state).not.toBeNull();
    const ledgers: PlayerLedger[] = state!.players
      .filter((player) => player.cashOut !== null)
      .map((player) => ({
        playerId: player.id,
        seatOrder: player.seatOrder,
        totalIn: agorot(player.totalIn),
        cashOut: agorot(player.cashOut as number),
        adjustment: agorot(player.adjustment),
      }));
    // The live-seat pot deliberately excludes the removed leaver's buy-in (the same
    // exclusion `closeSettlingGame`'s balance check makes), so total-in must equal
    // total-out over exactly this same set.
    const nets = computeNets(ledgers);
    const totalNet = nets.reduce((sum, net) => sum + net.net, 0);
    expect(totalNet).toBe(0);
    expect(Number(potTotal(ledgers))).toBe(
      ledgers.reduce((sum, ledger) => sum + (ledger.cashOut ?? 0) + ledger.adjustment, 0),
    );
    // settle() must also balance: every transfer's amount sums to the total owed by
    // net losers, which equals the total owed to net winners.
    const transfers = settle(nets);
    const totalTransferred = transfers.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalOwedByLosers = nets
      .filter((net) => net.net < 0)
      .reduce((sum, net) => sum + Math.abs(net.net), 0);
    expect(totalTransferred).toBe(totalOwedByLosers);
  });
});
