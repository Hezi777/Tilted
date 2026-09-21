/**
 * The static reference chart for `HandRankingsSheet`: ten hand rankings, strictly
 * descending strength, each with a Hebrew name and a five-card example. The example
 * hands are cross-checked in `hand-ranking.test.ts` against `evaluateHand` from
 * `hand-eval.ts` so the chart and the calculator can never drift apart.
 */

import type { HandRanking } from "@/lib/hand-eval";
import type { PlayingCardCode } from "@/lib/cards";

export interface HandRankingEntry {
  ranking: HandRanking;
  name: string;
  example: readonly PlayingCardCode[];
}

export const HAND_RANKINGS: readonly HandRankingEntry[] = [
  { ranking: 9, name: "רויאל פלאש", example: ["As", "Ks", "Qs", "Js", "10s"] },
  { ranking: 9, name: "סטרייט פלאש", example: ["9s", "8s", "7s", "6s", "5s"] },
  { ranking: 8, name: "רביעייה", example: ["Ks", "Kh", "Kd", "Kc", "2s"] },
  { ranking: 7, name: "פול האוס", example: ["Qs", "Qh", "Qd", "4c", "4s"] },
  { ranking: 5, name: "פלאש", example: ["Ah", "Jh", "9h", "6h", "3h"] },
  { ranking: 4, name: "סטרייט", example: ["10s", "9h", "8d", "7c", "6s"] },
  { ranking: 3, name: "שלישייה", example: ["8s", "8h", "8d", "Kc", "3s"] },
  { ranking: 2, name: "שני זוגות", example: ["Js", "Jh", "6d", "6c", "2s"] },
  { ranking: 1, name: "זוג", example: ["10s", "10h", "Ad", "7c", "4s"] },
  { ranking: 0, name: "קלף גבוה", example: ["Ah", "Jd", "8c", "5s", "2h"] },
] as const;
