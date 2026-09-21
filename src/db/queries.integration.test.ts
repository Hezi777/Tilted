/**
 * `purgeGame` against a real Postgres branch.
 *
 * The regression: `seat_members_player_game_fk` (drizzle/migrations/0016) is
 * `ON DELETE NO ACTION`, so a game with a shared seat used to make the players
 * delete in `purgeGame`'s batch raise a foreign-key violation and roll the whole
 * batch back -- silently un-deleting everything else in it too. `.toSQL()` cannot
 * catch this; it takes a live foreign key to violate.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb, seedActiveGame } from "@/db/test-support/integration-db";

describe.skipIf(!hasIntegrationDb)("purgeGame (integration)", () => {
  let queries: typeof import("@/db/queries");

  beforeAll(async () => {
    queries = await import("@/db/queries");
  });

  it("purges a game whose guest seat has an attached member", async () => {
    const game = await seedActiveGame(10_000);

    const { db } = await import("@/db");
    const { people, seatMembers } = await import("@/db/schema");
    const memberPersonId = randomUUID();
    await db.insert(people).values({
      id: memberPersonId,
      name: "שותף/ה",
      userId: `user_${memberPersonId}`,
    });
    await db.insert(seatMembers).values({
      id: randomUUID(),
      gameId: game.gameId,
      playerId: game.guest.playerId,
      personId: memberPersonId,
    });

    await expect(queries.purgeGame(game.gameId)).resolves.toBeUndefined();

    const { games, players } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(
      await db.select({ id: games.id }).from(games).where(eq(games.id, game.gameId)),
    ).toHaveLength(0);
    expect(
      await db.select({ id: players.id }).from(players).where(eq(players.gameId, game.gameId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: seatMembers.id })
        .from(seatMembers)
        .where(eq(seatMembers.gameId, game.gameId)),
    ).toHaveLength(0);
  });
});
