import { describe, expect, it } from "vitest";
import { HAND_RANKINGS } from "@/lib/hand-ranking";
import { compareHandScores, evaluateHand } from "@/lib/hand-eval";

describe("HAND_RANKINGS", () => {
  it("has exactly ten entries", () => {
    expect(HAND_RANKINGS).toHaveLength(10);
  });

  it("is strictly descending in strength", () => {
    for (let i = 1; i < HAND_RANKINGS.length; i++) {
      const stronger = evaluateHand(HAND_RANKINGS[i - 1].example);
      const weaker = evaluateHand(HAND_RANKINGS[i].example);
      expect(compareHandScores(stronger, weaker)).toBeGreaterThan(0);
    }
  });

  // The cross-check that stops the reference chart and the calculator drifting
  // apart: every example hand in the chart must actually evaluate to the
  // ranking it claims to illustrate.
  it("every example hand evaluates to its own ranking", () => {
    for (const entry of HAND_RANKINGS) {
      expect(evaluateHand(entry.example).ranking).toBe(entry.ranking);
    }
  });

  it("every example is five distinct cards", () => {
    for (const entry of HAND_RANKINGS) {
      expect(entry.example).toHaveLength(5);
      expect(new Set(entry.example).size).toBe(5);
    }
  });
});
