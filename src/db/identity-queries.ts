/**
 * The bridge between a signed-in Neon Auth user and the `Person` the rest of the app
 * knows (build plan M10).
 *
 * Every Person is now created by someone signing up — the roster of hand-added guests
 * is gone, because "you must create an account to play" makes an accountless Person
 * unreachable. `people.user_id` is therefore the identity. The legacy
 * `players.device_id` column stores this Person id as the trusted actor key until a
 * future schema rename; it no longer comes from a browser header.
 */

import "server-only";

import { and, eq, exists, isNotNull, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { cashOuts, people, players, seatMembers } from "@/db/schema";
import { normalizeName, reservedAvatarForName } from "@/lib/avatar";
import { claimCustomAvatarFor } from "@/db/custom-avatar-queries";
import type { PersonSummary, ViewerPerson } from "@/lib/api";

/** The Person this user signs in as, or null before their first one is created. */
export async function getPersonForUser(
  userId: string,
): Promise<ViewerPerson | null> {
  const [row] = await db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
      hapticsEnabled: people.hapticsEnabled,
      reduceMotion: people.reduceMotion,
    })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * The regulars this Person can pick from when starting a game: themselves, plus every
 * account they have actually sat at a table with.
 *
 * Scoped rather than "every account in the database", which is the same list only for
 * as long as the app has exactly one group of friends in it. Someone with nobody to
 * pick yet gets only themselves and invites by room code, which is how a new face joins
 * a table anyway -- and that is what puts them in this list next time.
 */
export async function getPeopleWhoPlayedWith(
  personId: string,
): Promise<PersonSummary[]> {
  const theirSeat = alias(players, "their_seat");
  const mySeat = alias(players, "my_seat");

  return db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    })
    .from(people)
    .where(
      and(
        isNotNull(people.userId),
        or(
          eq(people.id, personId),
          exists(
            db
              .select({ seat: theirSeat.id })
              .from(theirSeat)
              .innerJoin(
                mySeat,
                and(
                  eq(mySeat.gameId, theirSeat.gameId),
                  eq(mySeat.personId, personId),
                  isNull(mySeat.deletedAt),
                ),
              )
              .where(
                and(
                  eq(theirSeat.personId, people.id),
                  isNull(theirSeat.deletedAt),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(people.name);
}

export async function getPhoneForUser(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ phone: people.phone })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1);
  return row?.phone ?? null;
}

/**
 * The Person for this user, created on first sight. Sign-up and the first request of a
 * session can race, so a duplicate insert re-reads rather than failing — the partial
 * unique index on `user_id` is what makes that safe.
 */
/**
 * The character this name is entitled to, if it is still free.
 *
 * Ten of the sixteen belong to the regulars and are handed out automatically the first time
 * that person signs up, so they never have to go and find themselves in a picker. First
 * come, first served: if the character is already held, the newcomer simply gets a default
 * open one, which is what `avatarKeyForPerson` gives them.
 */
async function claimAvatarFor(name: string): Promise<string | null> {
  const claimed = reservedAvatarForName(name);
  if (claimed) {
    const [taken] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.avatarKey, claimed))
      .limit(1);
    if (!taken) return claimed;
  }
  // Characters the admin added after the app shipped claim names the same way, so a new
  // regular gets their own face on first sign-in without anyone touching this file.
  // Checked second so a committed claim always wins a collision.
  return claimCustomAvatarFor(normalizeName(name));
}

export async function ensurePersonForUser(
  userId: string,
  name: string,
): Promise<ViewerPerson> {
  const existing = await getPersonForUser(userId);
  if (existing) {
    // Rows created before characters were reserved have no avatar at all, and their owner
    // would otherwise have to go and find themselves in a picker. Claim it on the next
    // sign-in instead -- only when the slot is still empty and still free, so this can
    // never take a character away from whoever already has one.
    if (!existing.avatarKey) {
      const claimed = await claimAvatarFor(existing.name);
      if (claimed) {
        await db
          .update(people)
          .set({ avatarKey: claimed })
          .where(eq(people.id, existing.id));
        return { ...existing, avatarKey: claimed };
      }
    }
    return existing;
  }

  const [created] = await db
    .insert(people)
    .values({ name, userId, avatarKey: await claimAvatarFor(name) })
    .onConflictDoNothing()
    .returning({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
      hapticsEnabled: people.hapticsEnabled,
      reduceMotion: people.reduceMotion,
    });
  if (created) return created;

  const raced = await getPersonForUser(userId);
  if (!raced) throw new Error(`Could not resolve a Person for user ${userId}`);
  return raced;
}

/** Profile edits the owner may make (plan item 2, and the phone for item 5). */
export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    nickname?: string | null;
    phone?: string | null;
    avatarKey?: string | null;
    chipBody?: string | null;
    chipEdge?: string | null;
    chipSpots?: number | null;
    chipInitials?: string | null;
    defaultBuyIn?: number | null;
    defaultChipSetId?: string | null;
    hapticsEnabled?: boolean;
    reduceMotion?: boolean;
  },
): Promise<PersonSummary> {
  const [row] = await db
    .update(people)
    .set(input)
    .where(eq(people.userId, userId))
    .returning({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    });
  if (!row) throw new Error(`No Person for user ${userId}`);
  return row;
}

/** Everything the profile screen edits, in one read. */
export interface ProfileRecord {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  avatarKey: string | null;
  chipBody: string | null;
  chipEdge: string | null;
  chipSpots: number | null;
  chipInitials: string | null;
  defaultBuyIn: number | null;
  defaultChipSetId: string | null;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
}

export async function getProfile(userId: string): Promise<ProfileRecord | null> {
  const [row] = await db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      phone: people.phone,
      avatarKey: people.avatarKey,
      chipBody: people.chipBody,
      chipEdge: people.chipEdge,
      chipSpots: people.chipSpots,
      chipInitials: people.chipInitials,
      defaultBuyIn: people.defaultBuyIn,
      defaultChipSetId: people.defaultChipSetId,
      hapticsEnabled: people.hapticsEnabled,
      reduceMotion: people.reduceMotion,
    })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Detaches this account's Person from the games it played, then removes the row.
 *
 * The Player rows stay: they carry the name, the chip and the seat as they were on the
 * night, and every buy-in and cash-out is joined to them. Deleting a Person must not
 * rewrite a settled evening for the four other people who were at that table -- so the
 * seat keeps its history and simply stops pointing at an account.
 *
 * `seat_members` and `cash_outs.entered_by_person_id` follow the same reasoning but
 * land differently because of what each column is:
 * - `seat_members.person_id` is `NOT NULL` -- it cannot be detached in place the way
 *   `players.person_id` is, and it is membership, not history (the seat's own row in
 *   `players` already carries the night). The account's rows there are deleted.
 * - `cash_outs.entered_by_person_id` is nullable attribution, not the result itself
 *   (`amount` stays). It is nulled, the same way `players.person_id` is, so the count
 *   is untouched and only "who typed this" is forgotten along with the account.
 * Both are new `ON DELETE NO ACTION` references (drizzle/migrations/0016), so without
 * this the `people` delete below would fail with a foreign-key violation.
 */
export async function detachAndDeletePerson(userId: string): Promise<void> {
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1);
  if (!person) return;

  await db.batch([
    db
      .update(players)
      .set({ personId: null, deviceId: null })
      .where(eq(players.personId, person.id)),
    db.delete(seatMembers).where(eq(seatMembers.personId, person.id)),
    db
      .update(cashOuts)
      .set({ enteredByPersonId: null })
      .where(eq(cashOuts.enteredByPersonId, person.id)),
    db.delete(people).where(eq(people.id, person.id)),
  ]);
}
