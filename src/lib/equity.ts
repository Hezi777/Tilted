/**
 * A seeded Monte Carlo equity estimator for hole cards against 1-9 random
 * opponents, given 0-5 known board cards. Private, read-nothing arithmetic for
 * `OddsCalculator` -- no shared game state, no persistence.
 *
 * The iteration count is tuned for ~150ms on a phone (see the benchmark note
 * below `DEFAULT_EQUITY_ITERATIONS`), and the seeded PRNG makes `equity.test.ts`
 * deterministic instead of flaky.
 */

import { POKER_DECK, type PlayingCardCode } from "@/lib/cards";
import { compareHandScores, evaluateHand } from "@/lib/hand-eval";

export interface EquityInput {
  /** The hero's exactly two hole cards. */
  hole: readonly PlayingCardCode[];
  /** 0, 3, 4 or 5 known board cards. */
  board?: readonly PlayingCardCode[];
  /** How many opponents to simulate, 1-9. */
  opponents: number;
  iterations?: number;
  /** Fixes the PRNG stream. Tests pin this; the UI leaves it to vary per run. */
  seed?: number;
}

export interface EquityResult {
  win: number;
  tie: number;
  lose: number;
  iterations: number;
}

const ALL_CODES: readonly PlayingCardCode[] = POKER_DECK.map((card) => card.code);

/**
 * mulberry32: a small, fast, seedable PRNG (public-domain algorithm). Good enough
 * for a Monte Carlo simulation that only needs an even shuffle, not cryptographic
 * randomness, and deterministic for a given seed.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Tuned by benchmark against the most expensive shape this calculator ever runs:
// nine opponents, no board cards yet, so every iteration deals a full five-card
// runout and evaluates ten hands. 1,000 iterations of that measured ~90ms warm
// on the machine this was tuned on (Apple silicon laptop); a phone CPU is
// meaningfully slower, so this leaves headroom rather than spending the whole
// 150ms budget on desktop hardware. Cheaper shapes (fewer opponents, a fuller
// board) finish well under this in practice.
export const DEFAULT_EQUITY_ITERATIONS = 1000;

/**
 * Estimates the hero's equity against `opponents` random hands via Monte Carlo:
 * each iteration deals random opponent hole cards and the remaining board cards
 * out of the undealt deck, then compares all hands with `evaluateHand`.
 */
export function estimateEquity({
  hole,
  board = [],
  opponents,
  iterations = DEFAULT_EQUITY_ITERATIONS,
  seed = 1,
}: EquityInput): EquityResult {
  if (hole.length !== 2) throw new Error("estimateEquity needs exactly two hole cards");
  if (board.length > 5) throw new Error("estimateEquity takes at most five board cards");
  if (opponents < 1 || opponents > 9) throw new Error("estimateEquity supports one to nine opponents");

  const known = new Set<PlayingCardCode>([...hole, ...board]);
  const remaining = ALL_CODES.filter((code) => !known.has(code));
  const boardGap = 5 - board.length;
  const random = mulberry32(seed);

  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let i = 0; i < iterations; i++) {
    const draw = shuffle(remaining, random);
    let cursor = 0;
    const opponentHoles: PlayingCardCode[][] = [];
    for (let o = 0; o < opponents; o++) {
      opponentHoles.push([draw[cursor], draw[cursor + 1]]);
      cursor += 2;
    }
    const fullBoard = [...board, ...draw.slice(cursor, cursor + boardGap)];

    const heroScore = evaluateHand([...hole, ...fullBoard]);
    let heroBeatsEveryone = true;
    let heroTiesTheBest = false;
    for (const opponentHole of opponentHoles) {
      const opponentScore = evaluateHand([...opponentHole, ...fullBoard]);
      const comparison = compareHandScores(heroScore, opponentScore);
      if (comparison < 0) {
        heroBeatsEveryone = false;
        break;
      }
      if (comparison === 0) heroTiesTheBest = true;
    }

    if (!heroBeatsEveryone) lose++;
    else if (heroTiesTheBest) tie++;
    else win++;
  }

  return { win: win / iterations, tie: tie / iterations, lose: lose / iterations, iterations };
}
