/**
 * What the person running this instance needs to see and change.
 *
 * Everything here is deliberately instance-wide rather than scoped to the caller's own
 * tables, which is exactly why it sits behind `requireAdmin` and why that helper answers
 * 404 rather than 403 -- the rest of the table does not need to learn this exists by
 * being refused entry to it.
 */

import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { customAvatars, games, people, players } from "@/db/schema";
import {
  AVATAR_KEYS,
  RESERVED_AVATAR_CLAIMS,
  RESERVED_AVATAR_KEYS,
  isCustomAvatarKey,
} from "@/lib/avatar";

export interface AdminPerson {
  id: string;
  name: string;
  nickname: string | null;
  avatarKey: string | null;
  phone: string | null;
  nightsPlayed: number;
  lastPlayedAt: string | null;
}

export interface AdminGame {
  id: string;
  code: string;
  name: string | null;
  status: "active" | "settling" | "closed" | "cancelled";
  location: string | null;
  playerCount: number;
  createdAt: string;
  closedAt: string | null;
  /** Seats that still owe a count, which is what keeps a night from closing. */
  unsettledCount: number;
}

export interface AdminCharacter {
  key: string;
  label: string;
  /** "reserved" characters cannot be picked; "open" ones can. */
  reserved: boolean;
  source: "built-in" | "custom";
  /** The custom_avatars row id, for the routes that edit or delete it. */
  id: string | null;
  /** Names that auto-claim this character on sign-up. */
  claimNames: string[];
  /** Who is wearing it right now, if anyone. */
  heldBy: { personId: string; name: string } | null;
}

export interface AdminOverview {
  people: AdminPerson[];
  gamesList: AdminGame[];
  characters: AdminCharacter[];
  /** Nights left open or half-closed, which is the one thing that needs attention. */
  stuckGames: number;
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const [peopleRows, gameRows, customRows] = await Promise.all([
    db
      .select({
        id: people.id,
        name: people.name,
        nickname: people.nickname,
        avatarKey: people.avatarKey,
        phone: people.phone,
        nightsPlayed: sql<string>`(
          select count(*) from players pl
          join games g2 on g2.id = pl.game_id
          where pl.person_id = people.id
            and pl.deleted_at is null
            and g2.status = 'closed'
        )`,
        lastPlayedAt: sql<Date | null>`(
          select max(g3.closed_at) from players pl2
          join games g3 on g3.id = pl2.game_id
          where pl2.person_id = people.id and pl2.deleted_at is null
        )`,
      })
      .from(people)
      .orderBy(people.name),
    db
      .select({
        id: games.id,
        code: games.code,
        name: games.name,
        status: games.status,
        location: games.location,
        createdAt: games.createdAt,
        closedAt: games.closedAt,
        playerCount: sql<string>`(
          select count(*) from players pc
          where pc.game_id = games.id and pc.deleted_at is null
        )`,
        unsettledCount: sql<string>`(
          select count(*) from players pu
          where pu.game_id = games.id
            and pu.deleted_at is null
            and pu.settled_at is null
        )`,
      })
      .from(games)
      .orderBy(desc(games.createdAt))
      .limit(100),
    db.select().from(customAvatars).orderBy(desc(customAvatars.createdAt)),
  ]);

  const holders = new Map<string, { personId: string; name: string }>();
  for (const person of peopleRows) {
    if (person.avatarKey && !holders.has(person.avatarKey)) {
      holders.set(person.avatarKey, { personId: person.id, name: person.name });
    }
  }
  const claimsByKey = new Map<string, readonly string[]>(RESERVED_AVATAR_CLAIMS);

  const characters: AdminCharacter[] = [
    ...AVATAR_KEYS.map((key) => ({
      key,
      // Built-in art is a committed file, so its name is its label. The claim list is
      // what an admin can actually change about it.
      label: key,
      reserved: (RESERVED_AVATAR_KEYS as readonly string[]).includes(key),
      source: "built-in" as const,
      id: null,
      claimNames: [...(claimsByKey.get(key) ?? [])],
      heldBy: holders.get(key) ?? null,
    })),
    ...customRows.map((row) => ({
      key: row.key,
      label: row.label,
      reserved: row.reserved,
      source: "custom" as const,
      id: row.id,
      claimNames: row.claimNames,
      heldBy: holders.get(row.key) ?? null,
    })),
  ];

  return {
    people: peopleRows.map((row) => ({
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      avatarKey: row.avatarKey,
      phone: row.phone,
      nightsPlayed: Number(row.nightsPlayed),
      lastPlayedAt: row.lastPlayedAt
        ? new Date(row.lastPlayedAt).toISOString()
        : null,
    })),
    gamesList: gameRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      location: row.location,
      playerCount: Number(row.playerCount),
      unsettledCount: Number(row.unsettledCount),
      createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    })),
    characters,
    stuckGames: gameRows.filter(
      (row) => row.status === "active" || row.status === "settling",
    ).length,
  };
}

/**
 * Hands a character to a person, or takes it back.
 *
 * The picker is first-come-first-served by name, which is fine until two friends share
 * one and the wrong person ends up wearing a face. This is the override, and it is the
 * only place one exists. Passing null frees the character.
 */
export async function setPersonAvatar(
  personId: string,
  avatarKey: string | null,
): Promise<void> {
  if (
    avatarKey !== null &&
    !(AVATAR_KEYS as readonly string[]).includes(avatarKey) &&
    !isCustomAvatarKey(avatarKey)
  ) {
    throw new Error("דמות לא מוכרת");
  }
  // Whoever held it loses it first, so the unique-looking assumption the picker makes
  // stays true and two people never render as the same face.
  if (avatarKey !== null) {
    await db
      .update(people)
      .set({ avatarKey: null })
      .where(and(eq(people.avatarKey, avatarKey), sql`${people.id} <> ${personId}::uuid`));
  }
  await db.update(people).set({ avatarKey }).where(eq(people.id, personId));
}

/** Renames a person everywhere their name is not already snapshotted onto a seat. */
export async function renamePerson(
  personId: string,
  name: string,
  nickname: string | null,
): Promise<void> {
  await db.update(people).set({ name, nickname }).where(eq(people.id, personId));
}

/** Label and reserved flag on an admin-added character. */
export async function updateCustomAvatar(
  id: string,
  patch: { label?: string; reserved?: boolean; claimNames?: string[] },
): Promise<boolean> {
  const rows = await db
    .update(customAvatars)
    .set(patch)
    .where(eq(customAvatars.id, id))
    .returning({ id: customAvatars.id });
  return rows.length > 0;
}

/**
 * Force-cancels a night that is stuck open.
 *
 * The ordinary cancel route is the creator's, and a table whose host has lost their
 * phone has nobody who can use it. Cancelled rather than closed on purpose: closing
 * runs settlement, and a night nobody finished counting has no settlement to run.
 */
export async function forceCancelGame(gameId: string): Promise<boolean> {
  const rows = await db
    .update(games)
    .set({ status: "cancelled", closedAt: new Date() })
    .where(and(eq(games.id, gameId), sql`${games.status} in ('active', 'settling')`))
    .returning({ id: games.id });
  return rows.length > 0;
}

/**
 * Permanently removes a table, whatever state it is in.
 *
 * The creator's own delete refuses anything that has not ended, and that guard is right
 * for them -- deleting a night mid-hand would take the pot with it. An admin clearing a
 * test table or a duplicate needs the guard gone, so this one only asks that the game
 * exists. The UI names what is lost before it calls this; there is no undo.
 */
export async function adminDeleteGame(gameId: string): Promise<boolean> {
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!game) return false;
  const { purgeGame } = await import("@/db/queries");
  await purgeGame(gameId);
  return true;
}

/**
 * Edits a table's identity from outside it.
 *
 * `updateGameRules` is the host's, and it refuses a game that has closed -- correct
 * there, because changing the buy-in of a settled night would make its history disagree
 * with its settlement. This touches only the three fields that are labels rather than
 * money, so it is safe on a closed game: a night named "ערב" can be given its real name
 * weeks later without any number moving.
 */
export async function adminUpdateGame(
  gameId: string,
  patch: { name?: string | null; location?: string | null; notes?: string | null },
): Promise<boolean> {
  const rows = await db
    .update(games)
    .set(patch)
    .where(eq(games.id, gameId))
    .returning({ id: games.id });
  return rows.length > 0;
}

/** How many live seats a person still occupies, so a delete can refuse to strand one. */
export async function livePlayerCount(personId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(
      and(
        eq(players.personId, personId),
        isNull(players.deletedAt),
        sql`${games.status} in ('active', 'settling')`,
      ),
    );
  return Number(rows[0]?.count ?? 0);
}
