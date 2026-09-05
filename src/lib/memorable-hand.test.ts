import { describe, expect, it } from "vitest";
import {
  parseHandBoard,
  serializeHandBoard,
  validateHandResults,
} from "@/lib/memorable-hand";

describe("validateHandResults", () => {
  it("rejects a player appearing twice", () => {
    expect(
      validateHandResults(
        [
          { playerId: "a", delta: 5_000 },
          { playerId: "a", delta: -5_000 },
        ],
        "a",
      ),
    ).toContain("duplicate_players");
  });

  it("requires the winner to participate and have a positive result", () => {
    expect(
      validateHandResults(
        [
          { playerId: "a", delta: 5_000 },
          { playerId: "b", delta: -5_000 },
        ],
        "c",
      ),
    ).toContain("winner_not_participating");
    expect(
      validateHandResults(
        [
          { playerId: "a", delta: -5_000 },
          { playerId: "b", delta: 5_000 },
        ],
        "a",
      ),
    ).toContain("winner_not_positive");
  });

  it("accepts only integer-agorot results that balance to zero", () => {
    expect(
      validateHandResults(
        [
          { playerId: "a", delta: 7_500 },
          { playerId: "b", delta: -5_000 },
          { playerId: "c", delta: -2_500 },
        ],
        "a",
      ),
    ).toEqual([]);
    expect(
      validateHandResults(
        [
          { playerId: "a", delta: 50.5 },
          { playerId: "b", delta: -50.5 },
        ],
        "a",
      ),
    ).toContain("invalid_delta");
    expect(
      validateHandResults(
        [
          { playerId: "a", delta: 5_000 },
          { playerId: "b", delta: -4_900 },
        ],
        "a",
      ),
    ).toContain("results_not_balanced");
  });
});

describe("hand board serialization", () => {
  it("round-trips flop, turn and river exactly", () => {
    const board = { flop: "A♠ K♦ 7♥", turn: "2♣", river: "Q♠" };
    expect(parseHandBoard(serializeHandBoard(board))).toEqual(board);
  });

  it("still reads the pipe-delimited prototype format", () => {
    expect(parseHandBoard("A♠ K♦ 7♥ | 2♣ | Q♠")).toEqual({
      flop: "A♠ K♦ 7♥",
      turn: "2♣",
      river: "Q♠",
    });
  });
});
