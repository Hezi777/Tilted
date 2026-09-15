/**
 * The table, to somebody who is not playing at it.
 *
 * For the player who stepped out for a smoke, the partner who is not in the game, and
 * the seat that has already counted out. All three want the same thing: the table, live,
 * with nothing to tap.
 *
 * ## Why this is a separate projection and not a relaxed seat check
 *
 * `AGENTS.md` has exactly one authorization rule and `isSeatedInGame` is how the live
 * routes enforce it. Loosening that gate to let watchers through would widen the rule
 * for every field those routes return -- including the phone numbers settlement reads
 * and the buy-in ids a correction is made against.
 *
 * So the gate is untouched and this is a different, smaller read: names, totals, the
 * pot, and nothing else. There is no write path here at all, which is what makes
 * holding the room code enough to reach it.
 */

import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, players } from "@/db/schema";

export interface WatchSeat {
  name: string;
  avatarKey: string | null;
  totalIn: number;
  buyInCount: number;
  isSettled: boolean;
}

export interface WatchGame {
  name: string | null;
  location: string | null;
  status: "active" | "settling" | "closed" | "cancelled";
  startedAt: string;
  pot: number;
  seats: WatchSeat[];
}

export async function getWatchGame(code: string): Promise<WatchGame | null> {
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      location: games.location,
      status: games.status,
      createdAt: games.createdAt,
    })
    .from(games)
    .where(eq(games.code, code))
    .orderBy(desc(games.createdAt))
    .limit(1);
  if (!game) return null;
  // A finished night is read from history, which already exists and says more. This
  // view is only for a table that is still happening.
  if (game.status === "closed" || game.status === "cancelled") return null;

  const rows = await db
    .select({
      name: players.name,
      avatarKey: players.avatarKey,
      settledAt: players.settledAt,
      totalIn: sql<string>`coalesce(sum(${buyIns.amount}), 0)`,
      buyInCount: sql<string>`count(${buyIns.id})`,
    })
    .from(players)
    .leftJoin(
      buyIns,
      and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)),
    )
    .where(and(eq(players.gameId, game.id), isNull(players.deletedAt)))
    .groupBy(players.id, players.name, players.avatarKey, players.settledAt, players.seatOrder)
    .orderBy(players.seatOrder);

  const seats = rows.map((row) => ({
    name: row.name,
    avatarKey: row.avatarKey,
    totalIn: Number(row.totalIn),
    buyInCount: Number(row.buyInCount),
    isSettled: row.settledAt !== null,
  }));

  return {
    name: game.name,
    location: game.location,
    status: game.status,
    startedAt: game.createdAt.toISOString(),
    pot: seats.reduce((total, seat) => total + seat.totalIn, 0),
    seats,
  };
}
