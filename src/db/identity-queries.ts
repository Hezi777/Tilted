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

import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import type { PersonSummary } from "@/lib/api";

/** The Person this user signs in as, or null before their first one is created. */
export async function getPersonForUser(
  userId: string,
): Promise<PersonSummary | null> {
  const [row] = await db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Only registered accounts may be selected for a game roster. */
export async function getAccountPeople(): Promise<PersonSummary[]> {
  return db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    })
    .from(people)
    .where(isNotNull(people.userId))
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
export async function ensurePersonForUser(
  userId: string,
  name: string,
): Promise<PersonSummary> {
  const existing = await getPersonForUser(userId);
  if (existing) return existing;

  const [created] = await db
    .insert(people)
    .values({ name, userId })
    .onConflictDoNothing()
    .returning({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
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
