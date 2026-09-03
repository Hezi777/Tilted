/** UUID-based read model for closed-game history and the abandoned-game cancel action. */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, players } from "@/db/schema";
import { getActorForGame } from "@/db/cashout-queries";
import { getSettlementState, type SettlementState } from "@/db/settlement-queries";
import { assertCanSettle, AuthzError } from "@/lib/authz";

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
