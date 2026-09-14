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

/**
 * Who may enter a player's result at the end of the night (requirements item 4). The
 * host picks this when opening the table, because both answers are legitimate: some
 * groups count every stack together, others let each player type their own.
 * 'host_only' keeps the v1 behaviour; 'players' lets a player write their own row and
 * still leaves the host able to write anyone's.
 */
export const resultEntryEnum = pgEnum("result_entry", ["host_only", "players"]);

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
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // v2: where the evening is, e.g. "הבית של עידו" (plan item 7).
    location: text("location"),
    notes: text("notes"),
    // v2: the chip set this table counts with (plan items 1 / 8). Null keeps the
    // v1 behaviour of entering shekel amounts directly.
    chipSetId: uuid("chip_set_id").references((): AnyPgColumn => chipSets.id),
    // v2: who may enter results at settlement (requirements item 4).
    resultEntry: resultEntryEnum("result_entry").notNull().default("host_only"),
    // v2: only this person may delete the game from history (plan item 3).
    createdByPersonId: uuid("created_by_person_id").references(
      (): AnyPgColumn => people.id,
    ),
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
export const people = pgTable(
  "people",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Cross-game disambiguation for two friends with the same first name (edge case #6).
  // Lives on Person, not Player, so it is not retyped every game.
  nickname: text("nickname"),
  // v2: used only to compose a payment hand-off (plan item 5). The app never moves money.
  phone: text("phone"),
  // The chip character this friend picked for themselves. Lives on Person so it is not
  // rechosen every game; players.avatar_key still overrides it for a single table, where
  // two people must not wear the same face.
  avatarKey: text("avatar_key"),
  // v2/M10: the Neon Auth user this friend signs in as (neon_auth."user".id). Kept as a
  // plain text id rather than a foreign key because that table lives in another schema
  // and is owned by the auth service, not by these migrations. Nullable at the database
  // level so the column can be added without a rewrite; the app never creates a Person
  // without one.
  userId: text("user_id"),

  // -- The chip this friend is, at every table ------------------------------
  // The avatar is the one saturated object in the whole interface, so it is worth
  // being theirs rather than one of twelve stock faces. These four columns are the
  // same parameters `PokerChip` already draws from, so a person's chip renders at
  // any size with no asset behind it: `chip_edge` null derives from the body the
  // way `deriveEdgeColor()` does, and the denomination ink is never stored because
  // the two colours in front of it fully determine it.
  chipBody: text("chip_body"),
  chipEdge: text("chip_edge"),
  chipSpots: integer("chip_spots"),
  // At most two characters, pressed into the inlay. This is what separates two
  // friends who happen to pick the same colours.
  chipInitials: text("chip_initials"),

  // -- Preferences ----------------------------------------------------------
  // Small enough to live on the row. A separate table would buy nothing here and
  // would cost a join on the one screen that reads them.
  defaultBuyIn: integer("default_buy_in"),
  defaultChipSetId: uuid("default_chip_set_id"),
  hapticsEnabled: boolean("haptics_enabled").notNull().default(true),
  reduceMotion: boolean("reduce_motion").notNull().default(false),
}, (table) => [
  uniqueIndex("people_user_id_unique")
    .on(table.userId)
    .where(sql`"user_id" IS NOT NULL`),
  check(
    "people_chip_body_hex",
    sql`${table.chipBody} IS NULL OR ${table.chipBody} ~ '^#[0-9a-fA-F]{6}$'`,
  ),
  check(
    "people_chip_edge_hex",
    sql`${table.chipEdge} IS NULL OR ${table.chipEdge} ~ '^#[0-9a-fA-F]{6}$'`,
  ),
  check(
    "people_chip_spots_range",
    sql`${table.chipSpots} IS NULL OR (${table.chipSpots} >= 3 AND ${table.chipSpots} <= 8)`,
  ),
  check(
    "people_chip_initials_len",
    sql`${table.chipInitials} IS NULL OR char_length(${table.chipInitials}) <= 2`,
  ),
  check(
    "people_default_buy_in_range",
    sql`${table.defaultBuyIn} IS NULL OR (${table.defaultBuyIn} > 0 AND ${table.defaultBuyIn} <= ${MAX_AGOROT_SQL})`,
  ),
]);

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
    // The chip as it looked that night. Snapshotted the same way `name` is, so a
    // closed game keeps rendering the way it was played after someone restyles
    // their chip. Null falls back to the Person's current chip, then to avatarKey.
    chipBody: text("chip_body"),
    chipEdge: text("chip_edge"),
    chipSpots: integer("chip_spots"),
    chipInitials: text("chip_initials"),
    seatOrder: integer("seat_order").notNull(),
    deviceId: text("device_id"),
    isHost: boolean("is_host").notNull().default(false),
    // Early cash-out (edge case #2 / spec 11.2) freezes this seat on the live screen.
    settledAt: timestamp("settled_at", { withTimezone: true }),
    // Soft delete: removes them from the pot and settlement without losing the audit trail.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // v2: which chair they actually sit in (plan item 10). Deliberately separate from
    // `seatOrder`, which is the creation order the pot and settlement depend on and
    // must not be reshuffled to match the room.
    tableSeat: integer("table_seat"),
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
    // v2: two phones racing for the same empty chair. The write path already guards
    // this with a conditional UPDATE, but that only orders writes to one row — this
    // is what actually makes the chair exclusive.
    uniqueIndex("players_game_id_table_seat_unique")
      .on(table.gameId, table.tableSeat)
      .where(sql`"table_seat" IS NOT NULL AND "deleted_at" IS NULL`),
    // v2: exactly one operational host per live game. A host handoff must clear the
    // old host's flag before -- or in the same statement as -- setting the new one,
    // or this index is what turns a half-applied handoff into a rejected write
    // instead of two live hosts.
    uniqueIndex("players_game_id_host_unique")
      .on(table.gameId)
      .where(sql`"is_host" AND "deleted_at" IS NULL`),
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

// ---------------------------------------------------------------------------
// v2 (docs/v2-plan.md). Everything below is additive: no existing column moved
// or changed type, so the v1 pot, settlement and streak paths are untouched.
// ---------------------------------------------------------------------------

/**
 * A named set of chip denominations. `ownerPersonId` null means a shared preset every
 * game can pick; a person's own set is private to them.
 */
export const chipSets = pgTable(
  "chip_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerPersonId: uuid("owner_person_id").references(() => people.id),
    isPreset: boolean("is_preset").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chip_sets_owner_person_id_idx").on(table.ownerPersonId)],
);

/**
 * One denomination inside a set. The *value* carries the money, never the colour —
 * a set may legitimately hold two colours worth the same, and the same colour means
 * different amounts in different sets (plan item 8).
 */
export const chipDenominations = pgTable(
  "chip_denominations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chipSetId: uuid("chip_set_id")
      .notNull()
      .references(() => chipSets.id, { onDelete: "cascade" }),
    /** Body colour as #rrggbb. Presentation only. */
    color: text("color").notNull(),
    /**
     * Edge-spot colour as #rrggbb, or null to derive a contrasting one from the body.
     * The inlay ink is never stored: it is fully determined by these two.
     */
    edgeColor: text("edge_color"),
    /** Agorot. */
    value: integer("value").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    index("chip_denominations_chip_set_id_idx").on(table.chipSetId),
    unique("chip_denominations_set_sort_unique").on(
      table.chipSetId,
      table.sortOrder,
    ),
    check("chip_denominations_value_positive", sql`${table.value} > 0`),
    check(
      "chip_denominations_value_bounded",
      sql`${table.value} <= ${MAX_AGOROT_SQL}`,
    ),
    check("chip_denominations_color_hex", sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`),
    check(
      "chip_denominations_edge_color_hex",
      sql`${table.edgeColor} IS NULL OR ${table.edgeColor} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
  ],
);

/**
 * The counted stack behind one cash-out, kept per denomination so the total can be
 * re-derived and audited. The agorot total still lands on `cash_outs.amount`, which
 * remains the single number settlement reads.
 */
export const cashOutChips = pgTable(
  "cash_out_chips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashOutId: uuid("cash_out_id")
      .notNull()
      .references(() => cashOuts.id, { onDelete: "cascade" }),
    denominationId: uuid("denomination_id")
      .notNull()
      .references(() => chipDenominations.id),
    count: integer("count").notNull(),
  },
  (table) => [
    uniqueIndex("cash_out_chips_cash_out_denomination_unique").on(
      table.cashOutId,
      table.denominationId,
    ),
    check("cash_out_chips_count_non_negative", sql`${table.count} >= 0`),
  ],
);

/**
 * A transfer the settlement worked out, persisted so "who has already paid" survives a
 * refresh. The amounts still come from src/lib/settlement.ts — nothing here recomputes
 * a net or a transfer.
 */
export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    fromPlayerId: uuid("from_player_id").notNull(),
    toPlayerId: uuid("to_player_id").notNull(),
    amount: integer("amount").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    markedByDevice: text("marked_by_device"),
  },
  (table) => [
    foreignKey({
      columns: [table.fromPlayerId, table.gameId],
      foreignColumns: [players.id, players.gameId],
      name: "transfers_from_player_game_fk",
    }),
    foreignKey({
      columns: [table.toPlayerId, table.gameId],
      foreignColumns: [players.id, players.gameId],
      name: "transfers_to_player_game_fk",
    }),
    uniqueIndex("transfers_game_from_to_unique").on(
      table.gameId,
      table.fromPlayerId,
      table.toPlayerId,
    ),
    index("transfers_game_id_idx").on(table.gameId),
    check("transfers_amount_positive", sql`${table.amount} > 0`),
    check("transfers_amount_bounded", sql`${table.amount} <= ${MAX_AGOROT_SQL}`),
    check("transfers_distinct_players", sql`${table.fromPlayerId} <> ${table.toPlayerId}`),
  ],
);

/** Poker playlists offered behind the music button (plan item 11). */
export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [unique("playlists_sort_order_unique").on(table.sortOrder)],
);

/** A hand worth remembering — the flop/turn/river and who it hurt (plan item 12). */
export const hands = pgTable(
  "hands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    title: text("title"),
    note: text("note"),
    /** Free text board, e.g. "As Kd 7h | 2c | Qs". Not parsed; it is a memory aid. */
    board: text("board"),
    /** Agorot. */
    potAmount: integer("pot_amount"),
    winnerPlayerId: uuid("winner_player_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.winnerPlayerId, table.gameId],
      foreignColumns: [players.id, players.gameId],
      name: "hands_winner_player_game_fk",
    }),
    index("hands_game_id_idx").on(table.gameId),
    check(
      "hands_pot_amount_bounded",
      sql`${table.potAmount} BETWEEN 0 AND ${MAX_AGOROT_SQL}`,
    ),
  ],
);

/**
 * Who was in a remembered hand and what it cost them. `delta` is a story, not a ledger
 * entry: it never reaches the pot or the settlement.
 */
export const handPlayers = pgTable(
  "hand_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handId: uuid("hand_id")
      .notNull()
      .references(() => hands.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull(),
    holeCards: text("hole_cards"),
    /** Agorot, signed. */
    delta: integer("delta"),
  },
  (table) => [
    uniqueIndex("hand_players_hand_player_unique").on(
      table.handId,
      table.playerId,
    ),
    check(
      "hand_players_delta_bounded",
      sql`${table.delta} BETWEEN -${MAX_AGOROT_SQL} AND ${MAX_AGOROT_SQL}`,
    ),
  ],
);

/**
 * A browser's web push registration for one Person. One Person may hold several
 * (phone, laptop) -- each endpoint is its own row, upserted on reconnect rather than
 * replacing the others.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
    index("push_subscriptions_person_id_idx").on(table.personId),
  ],
);

/**
 * A character the admin added after the app shipped, so a new face never needs a deploy.
 *
 * The picture lives here as base64 rather than in `public/art/` because Vercel's
 * filesystem is read-only at runtime -- a committed .webp can only arrive through git.
 * Base64 text rather than `bytea` because the neon-http driver hands `bytea` back as a
 * `\x`-prefixed hex string, and paying 33% on a 15 KB image is cheaper than a decode
 * step on every read. A 0.5 GB Neon branch holds thousands of them.
 *
 * `key` carries the `custom-` prefix the whole app routes on: `avatarSrc` sends those to
 * `/api/avatar/[key]` and every other key to a committed file. The prefix is what lets
 * `people.avatar_key` stay a plain text column with no join.
 */
export const customAvatars = pgTable(
  "custom_avatars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `custom-<slug>`. Unique across the table and disjoint from the built-in keys. */
    key: text("key").notNull(),
    /** What the admin calls it. Hebrew, shown only in the admin list. */
    label: text("label").notNull(),
    /** The image itself, base64 with no data: prefix. */
    imageBase64: text("image_base64").notNull(),
    contentType: text("content_type").notNull().default("image/webp"),
    /**
     * Reserved characters behave like the ten committed ones: nobody may select them,
     * and they are handed out automatically to whoever signs up under a claiming name.
     * An open character appears in everybody's picker.
     */
    reserved: boolean("reserved").notNull().default(false),
    /**
     * The names that claim a reserved character, stored the way `CLAIMS` spells them in
     * `src/lib/avatar.ts` -- both scripts, normalised at comparison time, never here.
     * Empty for an open character.
     */
    claimNames: text("claim_names").array().notNull().default(sql`'{}'::text[]`),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("custom_avatars_key_unique").on(table.key),
    check("custom_avatars_key_prefixed", sql`${table.key} LIKE 'custom-%'`),
  ],
);
