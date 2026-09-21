/**
 * A 7-card (or fewer) hold'em hand evaluator.
 *
 * `evaluateHand` picks the best five-card hand out of the cards it is given and
 * returns a `HandScore`: a ranking (0-9, straight flush highest) plus a tie-break
 * array of up to five values, most significant first, comparable with `compareHandScores`.
 * Two hands with the same ranking and the same tie-break array are exactly equal
 * (a chop), which is what the equity engine in `equity.ts` relies on.
 */

import type { PlayingCardCode } from "@/lib/cards";
import { playingCard } from "@/lib/cards";

export const HAND_RANKING_COUNT = 10;

/** 9 = straight flush ... 0 = high card. Matches `hand-ranking.ts`'s descending chart. */
export type HandRanking = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface HandScore {
  ranking: HandRanking;
  /** Tie-break values, most significant first. Ace is 14. */
  tiebreak: readonly number[];
}

const RANK_VALUE: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  J: 11, Q: 12, K: 13, A: 14,
};

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  const withHead = combinations(rest, size - 1).map((combo) => [head, ...combo]);
  const withoutHead = combinations(rest, size);
  return [...withHead, ...withoutHead];
}

/** Straight high card, or 0 if the five ranks (deduped, descending) are not a straight. */
function straightHigh(descendingUniqueRanks: readonly number[]): number {
  if (descendingUniqueRanks.length < 5) return 0;
  for (let start = 0; start <= descendingUniqueRanks.length - 5; start++) {
    const top = descendingUniqueRanks[start];
    let isRun = true;
    for (let step = 1; step < 5; step++) {
      if (descendingUniqueRanks[start + step] !== top - step) {
        isRun = false;
        break;
      }
    }
    if (isRun) return top;
  }
  // The wheel: A-2-3-4-5, where the ace plays low and the straight's high card is 5.
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((rank) => descendingUniqueRanks.includes(rank))) return 5;
  return 0;
}

function scoreFive(cards: readonly PlayingCardCode[]): HandScore {
  const values = cards.map((code) => playingCard(code));
  const ranks = values.map((v) => RANK_VALUE[v.rank]).sort((a, b) => b - a);
  const isFlush = values.every((v) => v.suit === values[0].suit);

  const uniqueRanks = [...new Set(ranks)];
  const straightTop = straightHigh(uniqueRanks);

  const countByRank = new Map<number, number>();
  for (const rank of ranks) countByRank.set(rank, (countByRank.get(rank) ?? 0) + 1);
  const groups = [...countByRank.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const counts = groups.map((g) => g[1]);

  if (isFlush && straightTop > 0) return { ranking: 9, tiebreak: [straightTop] };
  if (counts[0] === 4) return { ranking: 8, tiebreak: [groups[0][0], groups[1][0]] };
  if (counts[0] === 3 && counts[1] === 2) return { ranking: 7, tiebreak: [groups[0][0], groups[1][0]] };
  if (isFlush) return { ranking: 5, tiebreak: ranks };
  if (straightTop > 0) return { ranking: 4, tiebreak: [straightTop] };
  if (counts[0] === 3) return { ranking: 3, tiebreak: [groups[0][0], ...groups.slice(1).map((g) => g[0])] };
  if (counts[0] === 2 && counts[1] === 2) {
    const [hiPair, loPair] = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return { ranking: 2, tiebreak: [hiPair, loPair, groups[2][0]] };
  }
  if (counts[0] === 2) return { ranking: 1, tiebreak: [groups[0][0], ...groups.slice(1).map((g) => g[0])] };
  return { ranking: 0, tiebreak: ranks };
}

export function compareHandScores(a: HandScore, b: HandScore): number {
  if (a.ranking !== b.ranking) return a.ranking - b.ranking;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Best five-card score out of 5-7 cards. Throws on fewer than five. */
export function evaluateHand(cards: readonly PlayingCardCode[]): HandScore {
  if (cards.length < 5) throw new Error("evaluateHand needs at least five cards");
  let best: HandScore | null = null;
  for (const five of combinations(cards, 5)) {
    const score = scoreFive(five);
    if (!best || compareHandScores(score, best) > 0) best = score;
  }
  return best as HandScore;
}
