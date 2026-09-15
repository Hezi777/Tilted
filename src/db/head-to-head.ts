/**
 * Your record against one other person, across the nights you both played.
 *
 * ## Why this is allowed where a leaderboard is not
 *
 * `docs/poker-night-spec.md` section 5.7 rules out an all-time table, and the reason it
 * gives is specific rather than squeamish: cumulative totals "permanently disadvantage
 * whoever joined last". A friend who starts in month eight is measured forever against
 * numbers they could not have earned.
 *
 * Head-to-head does not have that shape. It only counts nights **both** people sat at,
 * so a new player's record against everyone starts empty for both sides at once, and it
 * is a fact about a relationship rather than a rank in a list. It is also only ever
 * shown between the viewer and somebody else -- never one third party's record against
 * another, which would be gossip about a table the viewer was not at.
 *
 * Integer agorot throughout, and no money maths: summing agorot columns is arithmetic,
 * not the formatting and rounding `money.ts` owns.
 */

import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, cashOuts, games, players } from "@/db/schema";
import { agorot, type Agorot } from "@/lib/money";

export interface HeadToHead {
  /** Closed nights both people played. */
  nightsTogether: number;
  /** Nights the viewer's net beat the opponent's. Ties count for neither. */
  youAhead: number;
  themAhead: number;
  /** The viewer's total net across those nights, minus theirs. */
  netDifference: Agorot;
}

interface Night {
  gameId: string;
  net: number;
}

/** Per-night net for one person, restricted to a set of games. */
async function netsFor(personId: string, gameIds: string[]): Promise<Night[]> {
  if (gameIds.length === 0) return [];
  const rows = await db
    .select({
      gameId: players.gameId,
      paidIn: sql<string>`coalesce((
        select sum(${buyIns.amount})
        from ${buyIns}
        where ${buyIns.playerId} = ${players.id}
          and ${buyIns.deletedAt} is null
      ), 0)`,
      tookOut: sql<string>`coalesce((
        select sum(${cashOuts.amount} + ${cashOuts.adjustment})
        from ${cashOuts}
        where ${cashOuts.playerId} = ${players.id}
      ), 0)`,
    })
    .from(players)
    .where(
      and(
        eq(players.personId, personId),
        isNull(players.deletedAt),
        inArray(players.gameId, gameIds),
      ),
    );
  return rows.map((row) => ({
    gameId: row.gameId,
    net: Number(row.tookOut) - Number(row.paidIn),
  }));
}

export async function loadHeadToHead(
  viewerPersonId: string,
  opponentPersonId: string,
): Promise<HeadToHead> {
  const empty: HeadToHead = {
    nightsTogether: 0,
    youAhead: 0,
    themAhead: 0,
    netDifference: agorot(0),
  };
  // Nothing to compare against yourself, and asking would render a card of zeroes on
  // your own profile.
  if (viewerPersonId === opponentPersonId) return empty;

  // The games both of them have a live seat at, and which have actually closed. An
  // open or settling night has no final numbers yet and must not be counted.
  const shared = await db
    .select({ gameId: players.gameId })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(
      and(
        eq(players.personId, viewerPersonId),
        isNull(players.deletedAt),
        eq(games.status, "closed"),
        sql`exists (
          select 1 from ${players} other
          where other.game_id = ${players.gameId}
            and other.person_id = ${opponentPersonId}::uuid
            and other.deleted_at is null
        )`,
      ),
    );

  const gameIds = shared.map((row) => row.gameId);
  if (gameIds.length === 0) return empty;

  const [yours, theirs] = await Promise.all([
    netsFor(viewerPersonId, gameIds),
    netsFor(opponentPersonId, gameIds),
  ]);
  const theirsByGame = new Map(theirs.map((night) => [night.gameId, night.net]));

  let youAhead = 0;
  let themAhead = 0;
  let difference = 0;
  for (const night of yours) {
    const theirNet = theirsByGame.get(night.gameId);
    if (theirNet === undefined) continue;
    if (night.net > theirNet) youAhead += 1;
    else if (theirNet > night.net) themAhead += 1;
    difference += night.net - theirNet;
  }

  return {
    nightsTogether: gameIds.length,
    youAhead,
    themAhead,
    netDifference: agorot(difference),
  };
}
