/**
 * The characters the admin added after the app shipped.
 *
 * Reads here are deliberately narrow about columns: `image_base64` is ~20 KB a row, and
 * only `/api/avatar/[key]` ever wants it. Every other caller -- the picker, the admin
 * list, the sign-up claim -- selects metadata and leaves the bytes in Postgres.
 */

import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customAvatars, people } from "@/db/schema";

export interface CustomAvatarSummary {
  id: string;
  key: string;
  label: string;
  reserved: boolean;
  claimNames: string[];
  createdAt: Date;
}

/** Metadata for every custom character, newest last so the picker order is stable. */
export async function listCustomAvatars(): Promise<CustomAvatarSummary[]> {
  return db
    .select({
      id: customAvatars.id,
      key: customAvatars.key,
      label: customAvatars.label,
      reserved: customAvatars.reserved,
      claimNames: customAvatars.claimNames,
      createdAt: customAvatars.createdAt,
    })
    .from(customAvatars)
    .orderBy(asc(customAvatars.createdAt));
}

/** Just the keys anybody may choose -- what the profile picker needs. */
export async function listOpenCustomAvatarKeys(): Promise<string[]> {
  const rows = await db
    .select({ key: customAvatars.key })
    .from(customAvatars)
    .where(eq(customAvatars.reserved, false))
    .orderBy(asc(customAvatars.createdAt));
  return rows.map((row) => row.key);
}

/** The bytes, for the one route that serves them. Null when the key is unknown. */
export async function getCustomAvatarImage(
  key: string,
): Promise<{ imageBase64: string; contentType: string } | null> {
  const [row] = await db
    .select({
      imageBase64: customAvatars.imageBase64,
      contentType: customAvatars.contentType,
    })
    .from(customAvatars)
    .where(eq(customAvatars.key, key))
    .limit(1);
  return row ?? null;
}

/** True when this key exists and is open to anyone -- the server-side picker check. */
export async function isOpenCustomAvatar(key: string): Promise<boolean> {
  const [row] = await db
    .select({ key: customAvatars.key })
    .from(customAvatars)
    .where(and(eq(customAvatars.key, key), eq(customAvatars.reserved, false)))
    .limit(1);
  return Boolean(row);
}

export async function createCustomAvatar(input: {
  key: string;
  label: string;
  imageBase64: string;
  contentType: string;
  reserved: boolean;
  claimNames: string[];
  createdByPersonId: string;
}): Promise<CustomAvatarSummary | null> {
  const [created] = await db
    .insert(customAvatars)
    .values(input)
    .onConflictDoNothing({ target: customAvatars.key })
    .returning({
      id: customAvatars.id,
      key: customAvatars.key,
      label: customAvatars.label,
      reserved: customAvatars.reserved,
      claimNames: customAvatars.claimNames,
      createdAt: customAvatars.createdAt,
    });
  return created ?? null;
}

/**
 * Removes a character, and un-assigns it from anyone wearing it.
 *
 * Without the second step their `people.avatar_key` would point at a row that no longer
 * exists, and `/api/avatar/[key]` would 404 on every screen they appear on. Nulling it
 * sends them back through `avatarKeyForPerson`, which hands out a stable open character.
 */
export async function deleteCustomAvatar(id: string): Promise<boolean> {
  const [removed] = await db
    .delete(customAvatars)
    .where(eq(customAvatars.id, id))
    .returning({ key: customAvatars.key });
  if (!removed) return false;
  await db
    .update(people)
    .set({ avatarKey: null })
    .where(eq(people.avatarKey, removed.key));
  return true;
}

/**
 * The custom reserved character this name claims, if it is still free.
 *
 * Mirrors `claimAvatarFor` in identity-queries for the committed ten: matching is on a
 * normalised first word, and a character already held by somebody is not handed out
 * twice. The comparison runs in SQL so a table of any size stays one round trip.
 */
export async function claimCustomAvatarFor(
  normalizedFirstWord: string,
): Promise<string | null> {
  if (!normalizedFirstWord) return null;
  const [row] = await db
    .select({ key: customAvatars.key })
    .from(customAvatars)
    .where(
      and(
        eq(customAvatars.reserved, true),
        sql`EXISTS (
          SELECT 1 FROM unnest(${customAvatars.claimNames}) AS claim(name)
          WHERE lower(split_part(btrim(claim.name), ' ', 1)) = ${normalizedFirstWord}
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${people} WHERE ${people.avatarKey} = ${customAvatars.key}
        )`,
      ),
    )
    .orderBy(asc(customAvatars.createdAt))
    .limit(1);
  return row?.key ?? null;
}
