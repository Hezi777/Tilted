/**
 * A person's own record, for their own profile screen.
 *
 * Deliberately self-view only. The product spec argues against a cross-player
 * leaderboard -- it "permanently disadvantages whoever joined last" -- and that is a
 * social judgement about someone's friends rather than a design one, so nothing here
 * ranks people against each other. Everything below is about you.
 *
 * Integer agorot throughout. The arithmetic is summing and subtracting agorot columns,
 * which is not money maths, so it stays out of `money.ts` -- that file is hand-written
 * and test-locked and nothing here reimplements any of it.
 */

import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, players } from "@/db/schema";
import { agorot, sumAgorot, type Agorot } from "@/lib/money";

export interface ProfileStats {
  gamesPlayed: number;
  net: Agorot;
  /** Nights that ended above water. */
  wins: number;
  /** wins / gamesPlayed, 0-1. Null until at least one game has closed. */
  winRate: number | null;
  bestNight: Agorot | null;
  worstNight: Agorot | null;
  /** Consecutive closed games ending above water, most recent first. */
  currentStreak: number;
  longestStreak: number;
}

/** One closed game's result for this person: what they took out minus what they put in. */
interface NightResult {
  gameId: string;
  closedAt: Date | null;
  net: number;
}

/**
 * Every closed night this person played, newest first.
 *
 * One query rather than several: the per-night net is what every statistic below is
 * derived from, and computing it in SQL once is cheaper than four aggregate round trips
 * over the same join. `cash_outs` is a LEFT JOIN because a seat that never cashed out
 * (someone who left before the count) still has buy-ins and still counts as a night
 * played -- it simply nets negative.
 */
async function loadNights(personId: string): Promise<NightResult[]> {
  const rows = await db
    .select({
      gameId: players.gameId,
      closedAt: games.closedAt,
      // Every column here is spelled out with its table. Interpolating a drizzle
      // column into a `sql` template emits it **unqualified** -- `${buyIns.playerId} =
      // ${players.id}` became `"player_id" = "id"`, and since buy_ins has an id of its
      // own, Postgres resolved both to buy_ins and compared a row against itself. It
      // never errored; sum() just returned NULL and coalesce turned it into 0.
      paidIn: sql<string>`coalesce((
        select sum(b.amount) from buy_ins b
        where b.player_id = players.id and b.deleted_at is null
      ), 0)`,
      tookOut: sql<string>`coalesce((
        select sum(c.amount + c.adjustment) from cash_outs c
        where c.player_id = players.id
      ), 0)`,
    })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(
      and(
        eq(players.personId, personId),
        isNull(players.deletedAt),
        eq(games.status, "closed"),
      ),
    )
    .orderBy(sql`${games.closedAt} desc nulls last`);

  return rows.map((row) => ({
    gameId: row.gameId,
    closedAt: row.closedAt,
    net: Number(row.tookOut) - Number(row.paidIn),
  }));
}

export async function loadProfileStats(personId: string): Promise<ProfileStats> {
  const nights = await loadNights(personId);

  if (nights.length === 0) {
    return {
      gamesPlayed: 0,
      net: agorot(0),
      wins: 0,
      winRate: null,
      bestNight: null,
      worstNight: null,
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  const nets = nights.map((night) => night.net);
  const wins = nets.filter((net) => net > 0).length;

  // Nights are newest first, so the current streak is however many wins sit at the
  // front. A break ends it; an absence cannot, because a night you did not play is
  // not in this list at all.
  let currentStreak = 0;
  for (const net of nets) {
    if (net <= 0) break;
    currentStreak += 1;
  }

  let longestStreak = 0;
  let run = 0;
  for (const net of nets) {
    run = net > 0 ? run + 1 : 0;
    if (run > longestStreak) longestStreak = run;
  }

  return {
    gamesPlayed: nights.length,
    net: sumAgorot(nets.map((net) => agorot(net))),
    wins,
    winRate: wins / nights.length,
    bestNight: agorot(Math.max(...nets)),
    worstNight: agorot(Math.min(...nets)),
    currentStreak,
    longestStreak,
  };
}
