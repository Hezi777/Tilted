/**
 * drizzle/migrations/0017_backfill_seat_members.sql, against a real Postgres branch.
 *
 * 0016 created `seat_members` and had every write path insert the primary occupant's
 * row going forward, but any seat that existed before that migration ran has none.
 * "Is this seat shared?" is `count(*) > 1` over `seat_members` (profile-stats.ts,
 * streak-queries.ts, head-to-head.ts, the history marker), so attaching one member to
 * such a seat left it at count 1 -- read as unshared, and not excluded from either
 * occupant's personal record the way a shared seat must be.
 *
 * This seeds a seat exactly as it would have looked pre-migration -- a `players` row
 * with `person_id` set and no `seat_members` row at all -- runs the same backfill the
 * migration does, then attaches a member and proves the seat is now correctly read
 * as shared.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

/**
 * The 0017 backfill statement, scoped to one game.
 *
 * The migration itself is deliberately unscoped -- it backfills every pre-existing
 * seat in the database, which is the whole point of it. Running that same unscoped
 * statement from a test is not safe: vitest runs these files in parallel against one
 * shared Neon branch, so it reaches into every OTHER test file's half-seeded rows and
 * inserts primary memberships they are about to insert themselves. Their insert then
 * dies on `seat_members_game_id_person_id_unique`, in a completely unrelated file,
 * only when the full suite runs. Scoping by game keeps what this test actually proves
 * -- that the statement backfills a seat created before the table existed -- without
 * the blast radius.
 */
async function runBackfill(gameId: string) {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    INSERT INTO seat_members (id, game_id, player_id, person_id)
    SELECT gen_random_uuid(), p.game_id, p.id, p.person_id
    FROM players p
    WHERE p.person_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.game_id = ${gameId}::uuid
    ON CONFLICT (game_id, person_id) DO NOTHING
  `);
}

describe.skipIf(!hasIntegrationDb)("seat_members backfill (drizzle 0017)", () => {
  let profileStats: typeof import("@/db/profile-stats");

  beforeAll(async () => {
    profileStats = await import("@/db/profile-stats");
  });

  it("a pre-existing seat with one attached member is detected as shared after backfill", async () => {
    const { db } = await import("@/db");
    const { buyIns, cashOuts, games, people, players, seatMembers } = await import(
      "@/db/schema"
    );
    const { eq, sql: sqlOp } = await import("drizzle-orm");

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
      name: "ערב בדיקה",
      buyIn: 10_000,
      rebuyAmount: 10_000,
      status: "closed",
      closedAt: new Date(),
      createdByPersonId: primary.personId,
    });
    // A pre-0016 seat: `person_id` is set, but (deliberately) no `seat_members` row
    // exists for it yet -- exactly what every seat created before that migration
    // looks like.
    await db.insert(players).values({
      id: primary.playerId,
      gameId,
      personId: primary.personId,
      name: "עיקרי",
      seatOrder: 0,
      isHost: true,
      deviceId: primary.personId,
    });
    await db.insert(buyIns).values({
      gameId,
      playerId: primary.playerId,
      amount: 10_000,
      kind: "initial",
      opId: randomUUID(),
    });
    await db.insert(cashOuts).values({
      gameId,
      playerId: primary.playerId,
      amount: 15_000,
      adjustment: 0,
    });

    const beforeBackfill = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.playerId, primary.playerId));
    expect(beforeBackfill).toHaveLength(0);

    await runBackfill(gameId);

    const afterBackfill = await db
      .select({ id: seatMembers.id })
      .from(seatMembers)
      .where(eq(seatMembers.playerId, primary.playerId));
    expect(afterBackfill).toHaveLength(1);
    expect(afterBackfill[0]?.id).toBeDefined();

    // Now attach a second occupant to the same, now-backfilled seat.
    await db.insert(seatMembers).values({
      id: randomUUID(),
      gameId,
      playerId: primary.playerId,
      personId: member.personId,
    });

    const memberCount = await db
      .select({ count: sqlOp<string>`count(*)` })
      .from(seatMembers)
      .where(eq(seatMembers.playerId, primary.playerId));
    expect(Number(memberCount[0]?.count)).toBe(2);

    // Re-running the backfill must be a no-op (idempotent) -- the seat still reads
    // as shared and gains no extra rows.
    await runBackfill(gameId);
    const afterRerun = await db
      .select({ count: sqlOp<string>`count(*)` })
      .from(seatMembers)
      .where(eq(seatMembers.playerId, primary.playerId));
    expect(Number(afterRerun[0]?.count)).toBe(2);

    // The exclusion this backfill exists to fix: a shared seat must not land on the
    // primary occupant's personal record.
    const stats = await profileStats.loadProfileStats(primary.personId);
    expect(stats.gamesPlayed).toBe(0);
  });
});
