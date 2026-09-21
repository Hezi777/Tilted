/** UUID-based read model for closed-game history and the abandoned-game cancel action. */

import { and, desc, eq, exists, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, players, seatMembers } from "@/db/schema";
import { getActorForGame } from "@/db/cashout-queries";
import { getSettlementState, type SettlementState } from "@/db/settlement-queries";
import { assertCanSettle, AuthzError } from "@/lib/authz";
import { ISRAEL_TIME_ZONE, israelDateKey } from "@/lib/date";

export interface HistoryTimelineItem {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface HistoryState extends SettlementState {
  timeline: HistoryTimelineItem[];
  closedAt: string | null;
}

export function isHistoryStatus(status: string): status is "closed" {
  return status === "closed";
}

export interface HistoryListItem {
  id: string;
  name: string | null;
  location: string | null;
  /** The evening's start, spec's "who bought in" moment -- not `closedAt`. */
  createdAt: string;
  playerCount: number;
  pot: number;
  /**
   * Wave 4, item 9 (corrected): the viewer's own seat in this game was shared
   * (more than one `seat_members` row) -- money stats exclude the night entirely,
   * but the viewer still sees and can open it. The flag other UI can mark a shared
   * night with; `HistoryScreen.tsx` (owned by `tilted-feel` this wave) is where the
   * marker belongs, not here.
   */
  viewerSeatShared: boolean;
}

export interface HistoryListFilters {
  /** Matches game name, location, or the name of any player seated in the game. */
  search?: string;
  /** Israel-local `YYYY-MM-DD`, inclusive. */
  startDate?: string;
  /** Israel-local `YYYY-MM-DD`, inclusive. */
  endDate?: string;
  location?: string;
  /** Row cap for `/history`'s "load more" paging. Omitted, the query is unbounded. */
  limit?: number;
}

/**
 * A game's calendar date, in Israel local time -- the same expression the display
 * date (`israelDateKey`, src/lib/date.ts) resolves to, so a game that started at 00:30
 * Israel time filters and groups under the same day it displays under.
 */
const israelDateExpr = sql`(${games.createdAt} AT TIME ZONE ${ISRAEL_TIME_ZONE})::date`;

/** One EXISTS clause: is `personId` seated (not removed) in this game row as a
 * seat's primary occupant. Untouched from before wave 4: `buildHistoryListQuery`'s
 * compiled SQL is asserted on directly in `history-queries.test.ts`, so the
 * shared-seat extension below is additive, in `getHistoryList`, rather than folded
 * in here. */
function seatedIn(personId: string) {
  return exists(
    db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.gameId, games.id),
          eq(players.personId, personId),
          isNull(players.deletedAt),
        ),
      ),
  );
}

/**
 * Closed games where `personId` is attached to a seat as a shared member (plan item
 * 9), but is not that seat's own primary occupant -- the games `seatedIn` above
 * cannot see. Both members of a shared seat see the night in their own history, even
 * though (per `profile-stats.ts` et al.) it counts toward neither one's money stats.
 */
async function memberSeatGameIds(personId: string): Promise<Set<string>> {
  const rows = await db
    .select({ gameId: seatMembers.gameId })
    .from(seatMembers)
    .innerJoin(games, eq(games.id, seatMembers.gameId))
    .innerJoin(players, eq(players.id, seatMembers.playerId))
    .where(
      and(
        eq(seatMembers.personId, personId),
        eq(games.status, "closed"),
        isNull(players.deletedAt),
        sql`${players.personId} is distinct from ${personId}::uuid`,
      ),
    );
  return new Set(rows.map((row) => row.gameId));
}

/**
 * True when `personId`'s own seat in a game has more than one `seat_members` row --
 * the shared-seat marker for history. Computed per game id in JS, from one query
 * over the exact set of games the list already returned, rather than folded into
 * `buildHistoryListQuery`'s SELECT, for the same reason `memberSeatGameIds` is
 * separate: that query's compiled SQL is pinned by an existing test.
 */
async function sharedSeatByGame(
  personId: string,
  gameIds: readonly string[],
): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();
  // At most one seat_members row per (game, person) -- unique(game_id, person_id) --
  // so this is exactly the seat this Person occupies in each of these games.
  const ownRows = await db
    .select({ gameId: seatMembers.gameId, playerId: seatMembers.playerId })
    .from(seatMembers)
    .where(and(eq(seatMembers.personId, personId), inArray(seatMembers.gameId, [...gameIds])));
  if (ownRows.length === 0) return new Set();

  const seatSizes = await db
    .select({ playerId: seatMembers.playerId, count: sql<string>`count(*)` })
    .from(seatMembers)
    .where(inArray(seatMembers.playerId, ownRows.map((row) => row.playerId)))
    .groupBy(seatMembers.playerId);
  const sizeByPlayer = new Map(seatSizes.map((row) => [row.playerId, Number(row.count)]));

  const shared = new Set<string>();
  for (const row of ownRows) {
    if ((sizeByPlayer.get(row.playerId) ?? 0) > 1) shared.add(row.gameId);
  }
  return shared;
}

/**
 * Builds (but does not run) the closed-games-for-Person query, with search and the
 * date-range and location filters applied here in SQL rather than over an unfiltered
 * fetch. Split out from `getHistoryList` so the compiled SQL -- in particular the
 * inclusive range boundaries and the Israel-local date cast -- can be asserted on
 * directly in tests via `.toSQL()`, without a database connection.
 */
export function buildHistoryListQuery(personId: string, filters: HistoryListFilters = {}) {
  const search = filters.search?.trim();

  const conditions = [eq(games.status, "closed"), seatedIn(personId)];

  if (filters.startDate) {
    conditions.push(sql`${israelDateExpr} >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    conditions.push(sql`${israelDateExpr} <= ${filters.endDate}::date`);
  }
  if (filters.location) {
    conditions.push(eq(games.location, filters.location));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(games.name, pattern),
        ilike(games.location, pattern),
        exists(
          db
            .select({ id: players.id })
            .from(players)
            .where(
              and(
                eq(players.gameId, games.id),
                isNull(players.deletedAt),
                ilike(players.name, pattern),
              ),
            ),
        ),
      )!,
    );
  }

  const query = db
    .select({
      id: games.id,
      name: games.name,
      location: games.location,
      createdAt: games.createdAt,
      playerCount: sql<number>`count(distinct ${players.id})`,
      pot: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
    })
    .from(games)
    .leftJoin(players, and(eq(players.gameId, games.id), isNull(players.deletedAt)))
    .leftJoin(buyIns, and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)))
    .where(and(...conditions))
    .groupBy(games.id)
    .orderBy(desc(games.createdAt));

  return filters.limit ? query.limit(filters.limit) : query;
}

/** Games where `personId` is attached to a seat as a shared member, matching the
 * same summary shape `buildHistoryListQuery` produces -- but not that function
 * itself, whose compiled SQL is pinned by `history-queries.test.ts`. Filters are
 * re-applied here in JS rather than in SQL, which is fine at this app's scale (a
 * handful of shared nights per person) and keeps the pinned query untouched. */
async function loadMemberHistoryRows(
  personId: string,
  filters: HistoryListFilters,
): Promise<Omit<HistoryListItem, "viewerSeatShared">[]> {
  const gameIds = [...(await memberSeatGameIds(personId))];
  if (gameIds.length === 0) return [];

  const rows = await db
    .select({
      id: games.id,
      name: games.name,
      location: games.location,
      createdAt: games.createdAt,
      playerCount: sql<number>`count(distinct ${players.id})`,
      pot: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
    })
    .from(games)
    .leftJoin(players, and(eq(players.gameId, games.id), isNull(players.deletedAt)))
    .leftJoin(buyIns, and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)))
    .where(inArray(games.id, gameIds))
    .groupBy(games.id)
    .orderBy(desc(games.createdAt));

  const search = filters.search?.trim().toLowerCase();
  return rows
    .filter((row) => {
      const dateKey = israelDateKey(row.createdAt);
      if (filters.startDate && dateKey < filters.startDate) return false;
      if (filters.endDate && dateKey > filters.endDate) return false;
      if (filters.location && row.location !== filters.location) return false;
      if (
        search &&
        !row.name?.toLowerCase().includes(search) &&
        !row.location?.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      createdAt: row.createdAt.toISOString(),
      playerCount: Number(row.playerCount),
      pot: Number(row.pot),
    }));
}

export async function getHistoryList(
  personId: string,
  filters: HistoryListFilters = {},
): Promise<HistoryListItem[]> {
  // `limit` is applied after merging, below -- applying it to the own-seat query
  // alone would truncate before the member-attached rows are even considered.
  const { limit, ...unlimitedFilters } = filters;
  const [ownRows, memberRows] = await Promise.all([
    buildHistoryListQuery(personId, unlimitedFilters),
    loadMemberHistoryRows(personId, unlimitedFilters),
  ]);

  const merged = [
    ...ownRows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      createdAt: row.createdAt.toISOString(),
      playerCount: Number(row.playerCount),
      pot: Number(row.pot),
    })),
    ...memberRows,
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limited = limit ? merged.slice(0, limit) : merged;

  const shared = await sharedSeatByGame(
    personId,
    limited.map((row) => row.id),
  );
  return limited.map((row) => ({ ...row, viewerSeatShared: shared.has(row.id) }));
}

/** Distinct locations among this Person's closed games, for the history location filter. */
export async function getHistoryLocations(personId: string): Promise<string[]> {
  const [rows, memberGameIds] = await Promise.all([
    db
      .selectDistinct({ location: games.location })
      .from(games)
      .where(
        and(eq(games.status, "closed"), isNotNull(games.location), seatedIn(personId)),
      ),
    memberSeatGameIds(personId),
  ]);

  const locations = new Set(
    rows.map((row) => row.location).filter((location): location is string => location != null),
  );
  if (memberGameIds.size > 0) {
    const memberLocations = await db
      .selectDistinct({ location: games.location })
      .from(games)
      .where(
        and(
          isNotNull(games.location),
          inArray(games.id, [...memberGameIds]),
        ),
      );
    for (const row of memberLocations) {
      if (row.location) locations.add(row.location);
    }
  }

  return [...locations].sort((a, b) => a.localeCompare(b));
}

/** Returns null for active/settling/cancelled games; history contains closed games only. */
export async function getHistoryState(gameId: string): Promise<HistoryState | null> {
  const [game] = await db
    .select({ id: games.id, status: games.status, closedAt: games.closedAt })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!game || !isHistoryStatus(game.status)) return null;

  const settlement = await getSettlementState(gameId);
  if (!settlement || settlement.status !== "closed") return null;

  const rows = await db
    .select({
      id: buyIns.id,
      playerId: buyIns.playerId,
      playerName: players.name,
      amount: buyIns.amount,
      createdAt: buyIns.createdAt,
      deletedAt: buyIns.deletedAt,
    })
    .from(buyIns)
    .innerJoin(players, eq(players.id, buyIns.playerId))
    .where(and(eq(buyIns.gameId, gameId), eq(buyIns.kind, "rebuy")))
    .orderBy(desc(buyIns.createdAt), desc(buyIns.id));

  return {
    ...settlement,
    closedAt: game.closedAt?.toISOString() ?? null,
    timeline: rows.map((row) => ({
      id: row.id,
      playerId: row.playerId,
      playerName: row.playerName,
      amount: Number(row.amount),
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    })),
  };
}

/** Host-only cancellation for an abandoned active/settling game. */
export async function cancelGame(gameId: string, deviceId: string): Promise<boolean> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new AuthzError("not_in_game");
  assertCanSettle(access.game.status, access.actor);

  const changed = await db
    .update(games)
    .set({ status: "cancelled" })
    .where(and(eq(games.id, gameId), sql`${games.status} IN ('active', 'settling')`))
    .returning({ id: games.id });
  return changed.length > 0;
}
