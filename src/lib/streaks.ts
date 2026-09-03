/**
 * Win streaks. Spec section 5.7.
 *
 * A streak belongs to a Person, not a Player: it must survive across games, and a
 * seat can go by a different `Player` row each time the same person sits down.
 * Deliberately not a leaderboard — no lifetime totals, nothing cumulative. Just
 * "is this person on a run right now."
 *
 * Only the win streak is implemented. The spec calls the losing-streak
 * ("snowflake") half a decision to ask the group about first, so it is not
 * built here — no types, no branch, no dead option for it.
 */

import { computeNets, type PlayerLedger } from "@/lib/settlement";

export type GameStatus = "active" | "settling" | "closed" | "cancelled";

/** One seat's participation in a game, for streak purposes. */
export interface StreakPlayer {
  /** Null means a one-off guest with no persistent identity: never part of a streak. */
  personId: string | null;
  ledger: PlayerLedger;
}

/**
 * A game as streaks see it. Only `status === "closed"` games are ever counted;
 * others are accepted here (rather than requiring the caller to pre-filter) so
 * that passing a raw, unfiltered game list is exactly as correct as passing a
 * curated one.
 */
export interface StreakGame {
  id: string;
  status: GameStatus;
  /** Set only once the game is closed. Games are ordered by this, newest first. */
  closedAt: Date | null;
  players: readonly StreakPlayer[];
}

function closedGamesNewestFirst(
  games: readonly StreakGame[],
): StreakGame[] {
  return games
    .filter((g) => g.status === "closed" && g.closedAt !== null)
    .slice()
    .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
}

/**
 * The person's current win streak, walking closed games newest-first.
 *
 * A game the person did not play in is skipped entirely — it neither breaks nor
 * extends the streak. A game where they played and finished with a net of zero
 * or below stops the walk. Returns `null` below a length of 2: one win alone is
 * not a streak.
 */
export function currentStreak(
  personId: string,
  games: readonly StreakGame[],
): number | null {
  let streak = 0;

  for (const game of closedGamesNewestFirst(games)) {
    const player = game.players.find((p) => p.personId === personId);
    if (!player) continue; // sat out: invisible to the streak, not a break

    const [{ net }] = computeNets([player.ledger]);
    if (net > 0) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak >= 2 ? streak : null;
}

/**
 * Everyone who currently has a streak (length >= 2), keyed by `person_id`. Feeds
 * the home screen's strip of flames.
 */
export function activeStreaks(
  games: readonly StreakGame[],
): Map<string, number> {
  const personIds = new Set<string>();
  for (const game of games) {
    if (game.status !== "closed") continue;
    for (const player of game.players) {
      if (player.personId !== null) personIds.add(player.personId);
    }
  }

  const streaks = new Map<string, number>();
  for (const personId of personIds) {
    const streak = currentStreak(personId, games);
    if (streak !== null) streaks.set(personId, streak);
  }
  return streaks;
}
