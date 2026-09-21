import { describe, expect, it } from "vitest";
import { compareHandScores, evaluateHand, type HandRanking } from "@/lib/hand-eval";
import type { PlayingCardCode } from "@/lib/cards";

function score(cards: PlayingCardCode[]) {
  return evaluateHand(cards);
}

describe("evaluateHand", () => {
  it("recognises every ranking from a five-card hand", () => {
    const cases: [PlayingCardCode[], HandRanking][] = [
      [["As", "Ks", "Qs", "Js", "10s"], 9],
      [["9s", "8s", "7s", "6s", "5s"], 9],
      [["Ks", "Kh", "Kd", "Kc", "2s"], 8],
      [["Qs", "Qh", "Qd", "4c", "4s"], 7],
      [["Ah", "Jh", "9h", "6h", "3h"], 5],
      [["10s", "9h", "8d", "7c", "6s"], 4],
      [["8s", "8h", "8d", "Kc", "3s"], 3],
      [["Js", "Jh", "6d", "6c", "2s"], 2],
      [["10s", "10h", "Ad", "7c", "4s"], 1],
      [["Ah", "Jd", "8c", "5s", "2h"], 0],
    ];
    for (const [cards, ranking] of cases) {
      expect(score(cards).ranking).toBe(ranking);
    }
  });

  it("recognises the wheel straight (A-2-3-4-5) with the five as its high card", () => {
    const wheel = score(["As", "2h", "3d", "4c", "5s"]);
    expect(wheel.ranking).toBe(4);
    expect(wheel.tiebreak[0]).toBe(5);
  });

  it("does not mistake the wheel's ace for a high straight", () => {
    const wheel = score(["As", "2h", "3d", "4c", "5s"]);
    const broadway = score(["10h", "Jd", "Qc", "Ks", "Ah"]);
    expect(compareHandScores(broadway, wheel)).toBeGreaterThan(0);
  });

  it("compares kickers within the same ranking", () => {
    const acePair = score(["As", "Ah", "Kd", "7c", "2s"]);
    const acePairBetterKicker = score(["As", "Ah", "Kd", "8c", "2s"]);
    expect(compareHandScores(acePairBetterKicker, acePair)).toBeGreaterThan(0);
  });

  it("ranks a flush above a straight", () => {
    const flush = score(["Ah", "Jh", "9h", "6h", "3h"]);
    const straight = score(["10s", "9h", "8d", "7c", "6s"]);
    expect(compareHandScores(flush, straight)).toBeGreaterThan(0);
  });

  it("picks the best five of seven cards", () => {
    // Board gives a straight; the hole cards upgrade it to a flush.
    const sevenCards: PlayingCardCode[] = ["Ah", "Kh", "9h", "8s", "7d", "6h", "5h"];
    const best = evaluateHand(sevenCards);
    expect(best.ranking).toBe(5); // flush: A-K-9-6-5 of hearts
  });

  it("finds the best five of seven when the strongest hand is buried", () => {
    // Trip kings on board plus a pocket pair of eights makes a full house only
    // when all seven cards are considered together.
    const sevenCards: PlayingCardCode[] = ["Ks", "Kh", "Kd", "8h", "8d", "4c", "2h"];
    const best = evaluateHand(sevenCards);
    expect(best.ranking).toBe(7);
    expect(best.tiebreak[0]).toBe(13);
  });

  it("throws on fewer than five cards", () => {
    expect(() => evaluateHand(["As", "Kh", "Qd", "Jc"])).toThrow();
  });
});
