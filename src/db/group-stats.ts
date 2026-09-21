/**
 * The table as a whole, across nights -- the thing history could not answer.
 *
 * History lists games and opens one of them. Nothing anywhere said how the group is
 * doing: how many nights, where they happen, who actually turns up. These are the
 * questions a recurring game asks between sessions.
 *
 * Every figure here is deliberately either an attendance count or a fact about a single
 * night. There is no cumulative per-person money total, because that is the all-time
 * table `docs/poker-night-spec.md` section 5.7 rules out, for a reason that still
 * holds: it permanently disadvantages whoever joined last. Attendance does not
 * accumulate against anybody.
 */

import "server-only";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, people, players } from "@/db/schema";
import { agorot, type Agorot } from "@/lib/money";

export interface GroupMember {
  personId: string;
  name: string;
  nickname: string | null;
  avatarKey: string | null;
  /** Closed nights this person sat at. */
  nightsPlayed: number;
  /** When they last played, so a group can notice somebody has stopped coming. */
  lastPlayedAt: string | null;
}

export interface GroupStats {
  nightsPlayed: number;
  /** Total money that has crossed the table, all nights added up. */
  potTotal: Agorot;
  biggestPot: Agorot | null;
  /** Where the game happens, most frequent first. */
  locations: { location: string; nights: number }[];
  members: GroupMember[];
}

/**
 * Scoped to the people the viewer has actually played with, the same way the roster is.
 * A person who has never shared a table with the viewer is not part of their group.
 */
export async function loadGroupStats(viewerPersonId: string): Promise<GroupStats> {
  const viewerGames = db
    .select({ gameId: players.gameId })
    .from(players)
    .where(and(eq(players.personId, viewerPersonId), isNull(players.deletedAt)));

  const [nightRows, memberRows] = await Promise.all([
    db
      .select({
        id: games.id,
        // Table-qualified on both sides; see the note in head-to-head.ts -- an
        // interpolated column here renders bare and binds to the subquery's own table.
        pot: sql<string>`coalesce((
          select sum(b.amount) from buy_ins b
          where b.game_id = games.id and b.deleted_at is null
        ), 0)`,
        location: games.location,
      })
      .from(games)
      .where(and(eq(games.status, "closed"), sql`${games.id} in ${viewerGames}`)),
    // Wave 4, item B (owner reversal of part of brief item 4): membership is now
    // driven from `people`, not from having played -- an account holder who has
    // never finished a shared night still belongs to the group, with zero nights.
    // `players`/`games` are LEFT-joined, and their scoping (closed, shared with the
    // viewer) lives in the JOIN's own ON clause, not in WHERE -- a WHERE predicate on
    // a LEFT-joined column turns it back into an INNER JOIN by rejecting every row
    // whose join found nothing, which is exactly how this shipped as a silent zero
    // twice before (AGENTS.md's "two aggregates, one row filter" warning). Membership
    // (people.user_id IS NOT NULL) and the play-history figures beside it are
    // deliberately two different row filters this time -- that is the whole point of
    // the change, not a bug to fix.
    db
      .select({
        personId: people.id,
        name: people.name,
        nickname: people.nickname,
        avatarKey: people.avatarKey,
        nightsPlayed: sql<string>`count(${games.id})`,
        lastPlayedAt: sql<Date | null>`max(${games.closedAt})`,
      })
      .from(people)
      .leftJoin(
        players,
        and(eq(players.personId, people.id), isNull(players.deletedAt)),
      )
      .leftJoin(
        games,
        and(
          eq(games.id, players.gameId),
          eq(games.status, "closed"),
          sql`${games.id} in ${viewerGames}`,
        ),
      )
      .where(isNotNull(people.userId))
      .groupBy(people.id, people.name, people.nickname, people.avatarKey)
      .orderBy(desc(sql`count(${games.id})`)),
  ]);

  const pots = nightRows.map((row) => Number(row.pot));
  const locationCounts = new Map<string, number>();
  for (const row of nightRows) {
    const location = row.location?.trim();
    if (!location) continue;
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);
  }

  return {
    nightsPlayed: nightRows.length,
    potTotal: agorot(pots.reduce((total, pot) => total + pot, 0)),
    biggestPot: pots.length > 0 ? agorot(Math.max(...pots)) : null,
    locations: [...locationCounts.entries()]
      .map(([location, nights]) => ({ location, nights }))
      .sort((a, b) => b.nights - a.nights),
    members: memberRows.map((row) => ({
      personId: row.personId,
      name: row.name,
      nickname: row.nickname,
      avatarKey: row.avatarKey,
      nightsPlayed: Number(row.nightsPlayed),
      lastPlayedAt: row.lastPlayedAt
        ? new Date(row.lastPlayedAt).toISOString()
        : null,
    })),
  };
}
