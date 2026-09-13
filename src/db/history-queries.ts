/** UUID-based read model for closed-game history and the abandoned-game cancel action. */

import { and, desc, eq, exists, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, players } from "@/db/schema";
import { getActorForGame } from "@/db/cashout-queries";
import { getSettlementState, type SettlementState } from "@/db/settlement-queries";
import { assertCanSettle, AuthzError } from "@/lib/authz";
import { ISRAEL_TIME_ZONE } from "@/lib/date";

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
}

export interface HistoryListFilters {
  /** Matches game name, location, or the name of any player seated in the game. */
  search?: string;
  /** Israel-local `YYYY-MM-DD`, inclusive. */
  startDate?: string;
  /** Israel-local `YYYY-MM-DD`, inclusive. */
  endDate?: string;
  location?: string;
}

/**
 * A game's calendar date, in Israel local time -- the same expression the display
 * date (`israelDateKey`, src/lib/date.ts) resolves to, so a game that started at 00:30
 * Israel time filters and groups under the same day it displays under.
 */
const israelDateExpr = sql`(${games.createdAt} AT TIME ZONE ${ISRAEL_TIME_ZONE})::date`;

/** One EXISTS clause: is `personId` seated (not removed) in this game row. */
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

  return db
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
}

export async function getHistoryList(
  personId: string,
  filters: HistoryListFilters = {},
): Promise<HistoryListItem[]> {
  const rows = await buildHistoryListQuery(personId, filters);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    createdAt: row.createdAt.toISOString(),
    playerCount: Number(row.playerCount),
    pot: Number(row.pot),
  }));
}

/** Distinct locations among this Person's closed games, for the history location filter. */
export async function getHistoryLocations(personId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ location: games.location })
    .from(games)
    .where(
      and(eq(games.status, "closed"), isNotNull(games.location), seatedIn(personId)),
    )
    .orderBy(games.location);

  return rows
    .map((row) => row.location)
    .filter((location): location is string => location != null);
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
