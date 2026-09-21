/**
 * drizzle/migrations/0018_backfill_count_done_at.sql, against a real Postgres branch.
 *
 * 0016 added `players.count_done_at` nullable with no backfill. A game that was
 * already `active` or `settling` when 0016/0017 ran, and that has a player who
 * cashed out early, ended up with a frozen `cash_outs` row but `count_done_at IS
 * NULL` -- and `closeSettlingGame`'s close gate requires both, so that night could
 * never close (AGENTS.md's "two aggregates" hazard's sibling: here it is one row
 * missing one of two required facts, not two row filters disagreeing).
 *
 * This seeds a seat exactly as that legacy state looks -- a live player with a
 * `cash_outs` row and `count_done_at` still NULL -- proves the close is refused,
 * runs the same backfill the migration does, and proves the close then succeeds.
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasIntegrationDb } from "@/db/test-support/integration-db";

/**
 * The 0018 backfill statement, scoped to one game.
 *
 * Scoped for the same reason the 0017 backfill test scopes itself: vitest runs
 * these integration files in parallel against one shared Neon branch, so an
 * unscoped UPDATE would also touch rows other test files are mid-seeding.
 */
async function runBackfill(gameId: string) {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    UPDATE players p
    SET count_done_at = c.created_at
    FROM cash_outs c
    WHERE c.player_id = p.id
      AND c.game_id = p.game_id
      AND p.game_id = ${gameId}::uuid
      AND p.deleted_at IS NULL
      AND p.count_done_at IS NULL
  `);
}

describe.skipIf(!hasIntegrationDb)("count_done_at backfill (drizzle 0018)", () => {
  let cashout: typeof import("@/db/cashout-queries");

  beforeAll(async () => {
    cashout = await import("@/db/cashout-queries");
  });

  it("a legacy early cash-out with no count_done_at blocks close, and closes once backfilled", async () => {
    const { db } = await import("@/db");
    const { buyIns, cashOuts, games, people, players } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const host = { personId: randomUUID(), playerId: randomUUID() };
    const legacy = { personId: randomUUID(), playerId: randomUUID() };
    const gameId = randomUUID();

    await db.insert(people).values([
      { id: host.personId, name: "מארח", userId: `user_${host.personId}` },
      { id: legacy.personId, name: "עזב מוקדם", userId: `user_${legacy.personId}` },
    ]);
    // Already `settling` -- exactly what a night looked like if it was mid-flight
    // when 0016/0017 ran.
    await db.insert(games).values({
      id: gameId,
      code: randomUUID().slice(0, 6).toUpperCase(),
      name: "ערב בדיקה",
      buyIn: 10_000,
      rebuyAmount: 10_000,
      status: "settling",
      createdByPersonId: host.personId,
    });
    await db.insert(players).values([
      {
        id: host.playerId,
        gameId,
        personId: host.personId,
        name: "מארח",
        seatOrder: 0,
        isHost: true,
        deviceId: host.personId,
      },
      // The legacy seat: settled and frozen with a cash-out, but -- as every
      // pre-migration seat like it was left -- count_done_at is still NULL.
      {
        id: legacy.playerId,
        gameId,
        personId: legacy.personId,
        name: "עזב מוקדם",
        seatOrder: 1,
        isHost: false,
        deviceId: legacy.personId,
        settledAt: new Date(),
      },
    ]);
    await db.insert(buyIns).values([
      { gameId, playerId: host.playerId, amount: 10_000, kind: "initial", opId: randomUUID() },
      { gameId, playerId: legacy.playerId, amount: 10_000, kind: "initial", opId: randomUUID() },
    ]);
    await db.insert(cashOuts).values([
      { gameId, playerId: legacy.playerId, amount: 12_000, adjustment: 0 },
    ]);

    // Host still needs to count -- that part of closing is unaffected by this bug.
    await cashout.saveCashout(gameId, host.personId, host.playerId, { amount: 8_000 }, false, true);

    await expect(cashout.closeSettlingGame(gameId, host.personId)).rejects.toThrow();

    const [beforeBackfill] = await db
      .select({ countDoneAt: players.countDoneAt })
      .from(players)
      .where(eq(players.id, legacy.playerId));
    expect(beforeBackfill?.countDoneAt).toBeNull();

    await runBackfill(gameId);

    const [afterBackfill] = await db
      .select({ countDoneAt: players.countDoneAt })
      .from(players)
      .where(eq(players.id, legacy.playerId));
    expect(afterBackfill?.countDoneAt).not.toBeNull();

    const closed = await cashout.closeSettlingGame(gameId, host.personId);
    expect(closed.status).toBe("closed");

    // Idempotent: re-running it after the row is already backfilled (and now
    // closed) must not error and must not change the value.
    await runBackfill(gameId);
    const [afterRerun] = await db
      .select({ countDoneAt: players.countDoneAt })
      .from(players)
      .where(eq(players.id, legacy.playerId));
    expect(afterRerun?.countDoneAt?.getTime()).toBe(afterBackfill?.countDoneAt?.getTime());
  });
});
