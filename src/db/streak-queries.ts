/** Database adapter for the pure streak rules in src/lib/streaks.ts. */

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { buyIns, cashOuts, games, people, players } from "@/db/schema";
import { agorot } from "@/lib/money";
import { computeNets, type PlayerLedger } from "@/lib/settlement";
import {
  activeStreaks,
  currentStreak,
  type StreakGame,
} from "@/lib/streaks";

export interface HomeStreak {
  personId: string;
  name: string;
  nickname: string | null;
  streak: number;
}

export type PlayerStreakMap = Record<string, number>;

export interface SettlementStreakContext {
  playerId: string;
  personId: string | null;
  name: string;
  streak: number | null;
  previousStreak: number | null;
  /** Only a newly extended or broken streak is surfaced to the UI. */
  outcome: "extended" | "broken" | null;
}

/** Pure presentation classification used by settlement consumers and tests. */
export function settlementOutcome(
  net: number,
  previousStreak: number | null,
  streak: number | null,
): "extended" | "broken" | null {
  if (
    net > 0 &&
    streak !== null &&
    ((previousStreak !== null && streak > previousStreak) ||
      (previousStreak === null && streak === 2))
  ) {
    return "extended";
  }
  if (net <= 0 && previousStreak !== null) return "broken";
  return null;
}

interface PlayerRow {
  id: string;
  gameId: string;
  personId: string | null;
  name: string;
  seatOrder: number;
}

interface CashoutRow {
  gameId: string;
  playerId: string;
  amount: number;
  adjustment: number;
}

/** Closed games visible as of a target game's close, excluding later history. */
export function gamesThroughClosedAt(
  games: readonly StreakGame[],
  closedAt: Date,
): StreakGame[] {
  return games.filter(
    (game) =>
      game.closedAt !== null && game.closedAt.getTime() <= closedAt.getTime(),
  );
}

/** Loads the complete closed-game input expected by the locked pure functions. */
export async function getClosedStreakGames(): Promise<StreakGame[]> {
  const closedRows = await db
    .select({ id: games.id, closedAt: games.closedAt })
    .from(games)
    .where(and(eq(games.status, "closed"), isNotNull(games.closedAt)))
    .orderBy(desc(games.closedAt));
  if (closedRows.length === 0) return [];

  const gameIds = closedRows.map((game) => game.id);
  const playerRows = await db
    .select({
      id: players.id,
      gameId: players.gameId,
      personId: players.personId,
      name: players.name,
      seatOrder: players.seatOrder,
    })
    .from(players)
    .where(and(inArray(players.gameId, gameIds), isNull(players.deletedAt)))
    .orderBy(asc(players.seatOrder));

  const buyInRows = await db
    .select({
      playerId: buyIns.playerId,
      totalIn: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
    })
    .from(buyIns)
    .where(and(inArray(buyIns.gameId, gameIds), isNull(buyIns.deletedAt)))
    .groupBy(buyIns.playerId);
  const totalIn = new Map(
    buyInRows.map((row) => [row.playerId, Number(row.totalIn)]),
  );

  const cashoutRows = await db
    .select({
      gameId: cashOuts.gameId,
      playerId: cashOuts.playerId,
      amount: cashOuts.amount,
      adjustment: cashOuts.adjustment,
    })
    .from(cashOuts)
    .where(inArray(cashOuts.gameId, gameIds));
  const cashouts = new Map<string, CashoutRow>(
    cashoutRows.map((row) => [row.playerId, {
      gameId: row.gameId,
      playerId: row.playerId,
      amount: Number(row.amount),
      adjustment: Number(row.adjustment),
    }]),
  );

  const playersByGame = new Map<string, PlayerRow[]>();
  for (const player of playerRows) {
    const existing = playersByGame.get(player.gameId);
    if (existing) existing.push(player);
    else playersByGame.set(player.gameId, [player]);
  }

  return closedRows.map((game): StreakGame => ({
    id: game.id,
    status: "closed",
    closedAt: game.closedAt,
    players: (playersByGame.get(game.id) ?? []).map((player) => {
      const cashout = cashouts.get(player.id);
      const ledger: PlayerLedger = {
        playerId: player.id,
        seatOrder: player.seatOrder,
        totalIn: agorot(totalIn.get(player.id) ?? 0),
        cashOut: cashout ? agorot(cashout.amount) : null,
        adjustment: agorot(cashout?.adjustment ?? 0),
      };
      return { personId: player.personId, ledger };
    }),
  }));
}

/** Home's small strip, scoped to people this device has played as. */
export async function getActiveStreakStrip(
  deviceId: string,
): Promise<HomeStreak[]> {
  const [gamesForStreaks, peopleForDevice] = await Promise.all([
    getClosedStreakGames(),
    db
      .selectDistinct({
        id: people.id,
        name: people.name,
        nickname: people.nickname,
      })
      .from(people)
      .innerJoin(players, eq(players.personId, people.id))
      .where(
        and(
          isNull(players.deletedAt),
          inArray(
            players.gameId,
            db
              .select({ gameId: players.gameId })
              .from(players)
              .where(
                and(eq(players.deviceId, deviceId), isNull(players.deletedAt)),
              ),
          ),
        ),
      )
      .orderBy(people.name),
  ]);
  const streaks = activeStreaks(gamesForStreaks);
  return peopleForDevice
    .flatMap((person) => {
      const streak = streaks.get(person.id);
      return streak === undefined
        ? []
        : [{
            personId: person.id,
            name: person.name,
            nickname: person.nickname,
            streak,
          }];
    })
    .sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));
}

/** Current game's player ids mapped to their current streak, for live badges. */
export async function getLiveStreakBadges(
  gameId: string,
): Promise<PlayerStreakMap> {
  const [gamesForStreaks, currentPlayers] = await Promise.all([
    getClosedStreakGames(),
    db
      .select({ id: players.id, personId: players.personId })
      .from(players)
      .where(and(eq(players.gameId, gameId), isNull(players.deletedAt))),
  ]);
  const personStreaks = activeStreaks(gamesForStreaks);
  return Object.fromEntries(
    currentPlayers.flatMap((player) => {
      const streak = player.personId
        ? personStreaks.get(player.personId)
        : undefined;
      return streak === undefined ? [] : [[player.id, streak]];
    }),
  );
}

/**
 * Streak state after a closed game, plus whether this game extended or broke a
 * pre-existing streak. Players without a persistent person id are retained with
 * null streaks so the settlement UI can map rows without guessing.
 */
export async function getSettlementStreakContext(
  gameId: string,
): Promise<SettlementStreakContext[]> {
  const [gamesForStreaks, currentPlayers] = await Promise.all([
    getClosedStreakGames(),
    db
      .select({
        id: players.id,
        personId: players.personId,
        name: players.name,
      })
      .from(players)
      .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)))
      .orderBy(asc(players.id)),
  ]);
  const targetGame = gamesForStreaks.find((item) => item.id === gameId);
  const gamesAsOfTarget = targetGame?.closedAt
    ? gamesThroughClosedAt(gamesForStreaks, targetGame.closedAt)
    : [];
  const game = gamesAsOfTarget.find((item) => item.id === gameId);
  const previousGames = gamesAsOfTarget.filter((item) => item.id !== gameId);

  return currentPlayers.map((player) => {
    if (!player.personId || !game) {
      return {
        playerId: player.id,
        personId: player.personId,
        name: player.name,
        streak: null,
        previousStreak: null,
        outcome: null,
      };
    }
    const current = game.players.find((item) => item.ledger.playerId === player.id);
    const streak = currentStreak(player.personId, gamesForStreaks);
    const previousStreak = currentStreak(player.personId, previousGames);
    const net = current ? computeNets([current.ledger])[0]?.net ?? 0 : 0;
    const outcome = settlementOutcome(net, previousStreak, streak);
    return {
      playerId: player.id,
      personId: player.personId,
      name: player.name,
      streak,
      previousStreak,
      outcome,
    };
  });
}
