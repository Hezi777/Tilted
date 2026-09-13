/**
 * Real-Postgres test path for the query layer.
 *
 * Every other test in this repo asserts `.toSQL()` strings, which cannot catch a bug
 * that lives in what the statement *does* -- a missing `deleted_at` filter inside a
 * conditional UPDATE, or a DELETE-then-INSERT that reissues primary keys. Those need
 * the statement to actually run.
 *
 * It runs against a disposable **Neon branch**, not a local/containerised Postgres,
 * because the code under test is built on `db.batch()`, which drizzle implements only
 * for the `neon-http` driver (`drizzle-orm/node-postgres` has no `batch`). Pointing
 * these tests at a plain Postgres would mean swapping the driver and stubbing the very
 * mechanism being tested. A branch runs the identical driver, dialect and batch
 * semantics as production, and costs nothing on the plan this project already uses.
 *
 * The suite skips when `TEST_DATABASE_URL` is unset, so `pnpm verify` stays green for
 * anyone without a branch.
 */

import { config } from "dotenv";
import { sql } from "drizzle-orm";

// vitest does not load .env.local the way Next and drizzle-kit do.
const loaded = config({ path: ".env.local", quiet: true }).parsed ?? {};

const testUrl = (process.env.TEST_DATABASE_URL ?? loaded.TEST_DATABASE_URL)?.trim();

/**
 * Guard: this module truncates every table, so it must never see a real database.
 *
 * The comparison is against the dev URL **as written in .env.local**, not against
 * `process.env.DATABASE_URL` -- by the time a worker imports this, globalSetup has
 * already redirected that variable to the branch, and reading it back would compare
 * the branch against itself.
 */
function assertDisposable(url: string): void {
  const devUrl = loaded.DATABASE_URL?.trim();
  if (devUrl && new URL(url).host === new URL(devUrl).host) {
    throw new Error(
      "TEST_DATABASE_URL points at the same host as DATABASE_URL. " +
        "The integration suite truncates every table -- point it at a throwaway branch.",
    );
  }
}

export const integrationDbUrl = testUrl ?? null;

/**
 * True when a branch is configured. Tests gate on this via `describe.skipIf`, which
 * reports the suite as skipped rather than silently passing.
 */
export const hasIntegrationDb = integrationDbUrl !== null && integrationDbUrl !== "";

if (hasIntegrationDb && integrationDbUrl) {
  assertDisposable(integrationDbUrl);
  // `src/db/index.ts` reads DATABASE_URL lazily, on the first query rather than at
  // import, so setting it here is enough to redirect the shared client.
  process.env.DATABASE_URL = integrationDbUrl;
}

/** Every table the fixtures touch, children first so plain DELETEs would also work. */
const TABLES = [
  "cash_out_chips",
  "transfers",
  "hand_players",
  "hands",
  "cash_outs",
  "buy_ins",
  "players",
  "games",
  "chip_denominations",
  "chip_sets",
  "push_subscriptions",
  "people",
] as const;

/**
 * Wipes the branch once per run, from `globalSetup`.
 *
 * Deliberately not per-test: the test files run in parallel against one branch, so a
 * truncate inside `beforeEach` tears down a sibling file's fixture mid-test. Isolation
 * comes from every fixture minting its own UUIDs instead.
 */
export async function resetDatabase(): Promise<void> {
  const { db } = await import("@/db");
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `public.${t}`).join(", ")} CASCADE`),
  );
}

export interface SeededPlayer {
  personId: string;
  playerId: string;
  name: string;
}

export interface SeededGame {
  gameId: string;
  host: SeededPlayer;
  guest: SeededPlayer;
}

/**
 * An active two-handed game where both seats have bought in for `buyIn` agorot.
 *
 * Written with plain inserts rather than through the app's own join/roster path, so a
 * regression in that path cannot quietly reshape the fixture these tests stand on.
 * `device_id` carries the Person id -- a legacy column name the query layer still uses
 * as the actor key (see `getActorForGame`).
 */
export async function seedActiveGame(buyIn = 10_000): Promise<SeededGame> {
  const { db } = await import("@/db");
  const { randomUUID } = await import("node:crypto");
  const { buyIns, games, people, players } = await import("@/db/schema");

  const seats = [
    { personId: randomUUID(), playerId: randomUUID(), name: "מארח", isHost: true },
    { personId: randomUUID(), playerId: randomUUID(), name: "אורח", isHost: false },
  ];
  const gameId = randomUUID();

  await db.insert(people).values(
    seats.map((seat) => ({
      id: seat.personId,
      name: seat.name,
      userId: `user_${seat.personId}`,
    })),
  );
  await db.insert(games).values({
    id: gameId,
    // Unique among unresolved games; a random suffix keeps parallel runs from colliding.
    code: randomUUID().slice(0, 6).toUpperCase(),
    name: "ערב בדיקה",
    buyIn,
    rebuyAmount: buyIn,
    status: "active",
    createdByPersonId: seats[0].personId,
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
      amount: buyIn,
      kind: "initial" as const,
      opId: randomUUID(),
      createdByDevice: seat.personId,
    })),
  );

  return {
    gameId,
    host: { personId: seats[0].personId, playerId: seats[0].playerId, name: seats[0].name },
    guest: { personId: seats[1].personId, playerId: seats[1].playerId, name: seats[1].name },
  };
}
