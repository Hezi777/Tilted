/**
 * `detachAndDeletePerson` against a real Postgres branch.
 *
 * The regression: two new `ON DELETE NO ACTION` references landed on `people`
 * (drizzle/migrations/0016) -- `seat_members.person_id` and
 * `cash_outs.entered_by_person_id` -- and this function only cleared the pre-existing
 * one (`players.person_id`). Deleting an account that was ever an attached member, or
 * that ever typed a cash-out result, used to raise a foreign-key violation. It must
 * still leave the seat's own history (the Player row, its buy-ins and its recorded
 * amount) untouched -- only the account goes.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb, seedActiveGame } from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("detachAndDeletePerson (integration)", () => {
  let identity: typeof import("@/db/identity-queries");
  let cashout: typeof import("@/db/cashout-queries");

  beforeAll(async () => {
    identity = await import("@/db/identity-queries");
    cashout = await import("@/db/cashout-queries");
  });

  it("deletes an account that is an attached member and entered a result", async () => {
    const game = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { people, seatMembers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const memberUserId = `user_${randomUUID()}`;
    const [memberPerson] = await db
      .insert(people)
      .values({ id: randomUUID(), name: "שותף/ה", userId: memberUserId })
      .returning({ id: people.id });
    await db.insert(seatMembers).values({
      id: randomUUID(),
      gameId: game.gameId,
      playerId: game.guest.playerId,
      personId: memberPerson.id,
    });

    await cashout.beginSettling(game.gameId, game.host.personId);
    // The attached member types the guest seat's own result -- attributed to their
    // Person, the way `entered_by_person_id` is documented to work.
    await cashout.saveCashout(
      game.gameId,
      memberPerson.id,
      game.guest.playerId,
      { amount: 12_000 },
      false,
      true,
    );

    await expect(identity.detachAndDeletePerson(memberUserId)).resolves.toBeUndefined();

    // The account is gone.
    expect(
      await db.select({ id: people.id }).from(people).where(eq(people.id, memberPerson.id)),
    ).toHaveLength(0);
    // Membership row tied to that account cannot survive (person_id is NOT NULL).
    expect(
      await db
        .select({ id: seatMembers.id })
        .from(seatMembers)
        .where(eq(seatMembers.personId, memberPerson.id)),
    ).toHaveLength(0);

    // The seat's history survives: the recorded amount is untouched, only the
    // attribution to the now-deleted account is gone.
    const state = await cashout.getCashoutState(game.gameId);
    const guestRow = state?.players.find((player) => player.id === game.guest.playerId);
    expect(guestRow?.cashOut).toBe(12_000);
    expect(guestRow?.enteredByPersonId).toBeNull();
  });
});
