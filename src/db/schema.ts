/**
 * Drizzle schema for the Tilted poker-night ledger. Spec section 4, plus the columns
 * the plan's "Spec conflicts and resolutions" table requires that section 4's schema
 * block omits (see docs/poker-night-spec.md and
 * ~/.claude/plans/read-docs-spec-md-it-is-tingly-kazoo.md).
 *
 * Money is integer agorot everywhere. No numeric/decimal columns.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** ₪1,000,000 in agorot — mirrors src/lib/money.ts's MAX_AGOROT, kept in sync by hand
 * since the DB layer cannot import app code. */
const MAX_AGOROT = 100_000_000;
// Inlined as a literal in CHECK constraints — sql`${MAX_AGOROT}` would bind it as a
// query parameter, which drizzle-kit generate cannot resolve into static migration SQL.
const MAX_AGOROT_SQL = sql.raw(String(MAX_AGOROT));

// 'cancelled' is added to the spec's enum for section 11.9's "בטל משחק" (resolution #3).
export const gameStatusEnum = pgEnum("game_status", [
  "active",
  "settling",
  "closed",
  "cancelled",
]);

export const buyInKindEnum = pgEnum("buy_in_kind", ["initial", "rebuy"]);

// Which section 5.5 mismatch resolution, if any, was applied to this game.
export const mismatchKindEnum = pgEnum("mismatch_kind", [
  "none",
  "recount",
  "split",
  "assigned",
]);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name"),
    buyIn: integer("buy_in").notNull(),
    rebuyAmount: integer("rebuy_amount").notNull(),
    status: gameStatusEnum("status").notNull().default("active"),
    // Mismatch resolution record (resolution #4 / #7): which fix was applied, by how
    // much, and (for 'assigned') who absorbed it.
    mismatchKind: mismatchKindEnum("mismatch_kind").notNull().default("none"),
    mismatchAmount: integer("mismatch_amount"),
    mismatchPlayerId: uuid("mismatch_player_id").references(
      (): AnyPgColumn => players.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    // Resolution #2: codes are unique among games that still need theirs resolved —
    // a 'settling' game still has to give up its code, only 'closed'/'cancelled' free it.
    uniqueIndex("games_code_active_unique")
      .on(table.code)
      .where(sql`${table.status} NOT IN ('closed', 'cancelled')`),
    index("games_status_closed_at_idx").on(table.status, table.closedAt),
    check("games_buy_in_positive", sql`${table.buyIn} > 0`),
    check("games_buy_in_bounded", sql`${table.buyIn} <= ${MAX_AGOROT_SQL}`),
    check("games_rebuy_amount_positive", sql`${table.rebuyAmount} > 0`),
    check(
      "games_rebuy_amount_bounded",
      sql`${table.rebuyAmount} <= ${MAX_AGOROT_SQL}`,
    ),
    check(
      "games_mismatch_amount_bounded",
      sql`${table.mismatchAmount} BETWEEN -${MAX_AGOROT_SQL} AND ${MAX_AGOROT_SQL}`,
    ),
  ],
);

// Exists only to make streaks possible (spec section 4) — a friend persists across games.
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Cross-game disambiguation for two friends with the same first name (edge case #6).
  // Lives on Person, not Player, so it is not retyped every game.
  nickname: text("nickname"),
});

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    personId: uuid("person_id").references(() => people.id),
    name: text("name").notNull(),
    avatarKey: text("avatar_key"),
    seatOrder: integer("seat_order").notNull(),
    deviceId: text("device_id"),
    isHost: boolean("is_host").notNull().default(false),
    // Early cash-out (edge case #2 / spec 11.2) freezes this seat on the live screen.
    settledAt: timestamp("settled_at", { withTimezone: true }),
    // Soft delete: removes them from the pot and settlement without losing the audit trail.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("players_game_id_idx").on(table.gameId),
    index("players_person_id_idx").on(table.personId),
    // Referenced by the composite foreign keys below, which is what keeps a buy-in's
    // player and its game in agreement.
    unique("players_id_game_id_key").on(table.id, table.gameId),
    // One Person cannot hold two live seats in the same game. Without this a
    // duplicate seat silently double-counts them and corrupts their streak.
    uniqueIndex("players_game_id_person_id_unique")
      .on(table.gameId, table.personId)
      .where(sql`"person_id" IS NOT NULL AND "deleted_at" IS NULL`),
  ],
);

export const buyIns = pgTable(
  "buy_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    playerId: uuid("player_id").notNull(),
    amount: integer("amount").notNull(),
    kind: buyInKindEnum("kind").notNull(),
    // Client-generated idempotency key: a retried or double-tapped rebuy is a no-op,
    // not a duplicate (edge case #4).
    opId: uuid("op_id").notNull(),
    // The device that actually wrote the row — a host-entered correction on a guest's
    // seat is not undoable by that guest.
    createdByDevice: text("created_by_device"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete so the log stays honest (spec section 4 notes).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Composite: the player must belong to the game this buy-in is filed under.
    // A mismatched pair would inflate one game's pot and deflate another's.
    foreignKey({
      columns: [table.playerId, table.gameId],
      foreignColumns: [players.id, players.gameId],
      name: "buy_ins_player_game_fk",
    }),
    uniqueIndex("buy_ins_op_id_unique").on(table.opId),
    index("buy_ins_game_id_idx").on(table.gameId),
    index("buy_ins_player_id_idx").on(table.playerId),
    check("buy_ins_amount_positive", sql`${table.amount} > 0`),
    check("buy_ins_amount_bounded", sql`${table.amount} <= ${MAX_AGOROT_SQL}`),
  ],
);

export const cashOuts = pgTable(
  "cash_outs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    playerId: uuid("player_id").notNull(),
    amount: integer("amount").notNull(),
    // Mismatch correction, kept separate from the raw counted `amount` so the honest
    // count survives (spec 5.5 / resolution #4).
    adjustment: integer("adjustment").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.playerId, table.gameId],
      foreignColumns: [players.id, players.gameId],
      name: "cash_outs_player_game_fk",
    }),
    uniqueIndex("cash_outs_game_id_player_id_unique").on(
      table.gameId,
      table.playerId,
    ),
    check("cash_outs_amount_non_negative", sql`${table.amount} >= 0`),
    check("cash_outs_amount_bounded", sql`${table.amount} <= ${MAX_AGOROT_SQL}`),
    check(
      "cash_outs_adjustment_bounded",
      sql`${table.adjustment} BETWEEN -${MAX_AGOROT_SQL} AND ${MAX_AGOROT_SQL}`,
    ),
  ],
);
