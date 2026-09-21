/**
 * The read behind "rematch" (v2 UX pass): pre-filling `/game/new` from a past night's
 * roster and stakes. Authorization is the caller's job (route handler), not this file
 * -- this only assembles the seed once a seat has already been confirmed.
 */

import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { games, people, players } from "@/db/schema";

export interface RematchPerson {
  id: string;
  name: string;
  nickname: string | null;
  avatarKey: string | null;
}

export interface RematchSeed {
  name: string | null;
  buyIn: number;
  rebuyAmount: number;
  chipSetId: string | null;
  people: RematchPerson[];
}

/**
 * A past night's roster and stakes, for pre-filling a new one. A player row with no
 * `personId` (never happens post-auth, but old data may still have one) or one whose
 * Person is gone is dropped by the inner join rather than surfaced as a broken seat.
 */
export async function getRematchSeed(gameId: string): Promise<RematchSeed | null> {
  const [game] = await db
    .select({
      name: games.name,
      buyIn: games.buyIn,
      rebuyAmount: games.rebuyAmount,
      chipSetId: games.chipSetId,
    })
    .from(games)
    .where(eq(games.id, gameId));
  if (!game) return null;

  const roster = await db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    })
    .from(players)
    .innerJoin(people, eq(people.id, players.personId))
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)))
    .orderBy(players.seatOrder);

  return { ...game, people: roster };
}
