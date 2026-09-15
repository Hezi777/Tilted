/**
 * The two moments the table needs something from everyone at once.
 *
 * Push previously fired for exactly one event -- a new invite -- which meant the app
 * only ever reached out when somebody was being added. The moments that actually strand
 * a night are the other two: the host starting to close, when phones are in pockets and
 * people are finding their jackets, and the accounts going final.
 *
 * Both are best-effort. A notification that fails must never fail the transition that
 * triggered it: the night closing is the state change, not the message about it.
 */

import "server-only";

import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { games, players } from "@/db/schema";
import {
  buildClosedNotificationPayload,
  buildSettlingNotificationPayload,
} from "@/lib/push-payload";

/** Every seat still in the game, optionally excluding the person who acted. */
async function seatedPersonIds(
  gameId: string,
  options: { unsettledOnly: boolean; excludePersonId?: string },
): Promise<string[]> {
  const rows = await db
    .select({ personId: players.personId })
    .from(players)
    .where(
      and(
        eq(players.gameId, gameId),
        isNull(players.deletedAt),
        options.unsettledOnly ? isNull(players.settledAt) : undefined,
        options.excludePersonId
          ? ne(players.personId, options.excludePersonId)
          : undefined,
      ),
    );
  return rows
    .map((row) => row.personId)
    .filter((personId): personId is string => personId !== null);
}

async function fanOut(
  personIds: string[],
  payload: ReturnType<typeof buildSettlingNotificationPayload>,
): Promise<void> {
  if (personIds.length === 0) return;
  const { sendPushToPerson } = await import("@/lib/push");
  // `sendPushToPerson` swallows its own failures, so one dead subscription cannot
  // stop the rest of the table being told.
  await Promise.all(personIds.map((personId) => sendPushToPerson(personId, payload)));
}

/**
 * "Count your chips" -- to every seat that has not already counted out.
 *
 * A seat that never counts is what leaves a night unclosable, and the host cannot
 * finish until they do. Excludes the host, who is holding the phone that just did this.
 */
export async function notifyTableSettling(
  gameId: string,
  actorPersonId: string,
): Promise<void> {
  try {
    const [[game], personIds] = await Promise.all([
      db.select({ name: games.name }).from(games).where(eq(games.id, gameId)).limit(1),
      seatedPersonIds(gameId, {
        unsettledOnly: true,
        excludePersonId: actorPersonId,
      }),
    ]);
    await fanOut(
      personIds,
      buildSettlingNotificationPayload({ gameName: game?.name ?? null, gameId }),
    );
  } catch (error) {
    console.error("settling notification failed", error);
  }
}

/** "The accounts are final" -- to everyone, including seats that settled early. */
export async function notifyTableClosed(
  gameId: string,
  actorPersonId: string,
): Promise<void> {
  try {
    const [[game], personIds] = await Promise.all([
      db.select({ name: games.name }).from(games).where(eq(games.id, gameId)).limit(1),
      seatedPersonIds(gameId, {
        unsettledOnly: false,
        excludePersonId: actorPersonId,
      }),
    ]);
    await fanOut(
      personIds,
      buildClosedNotificationPayload({ gameName: game?.name ?? null, gameId }),
    );
  } catch (error) {
    console.error("closed notification failed", error);
  }
}
