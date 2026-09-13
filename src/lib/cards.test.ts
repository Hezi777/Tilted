import { describe, expect, it } from "vitest";
import { POKER_DECK, parsePlayingCards, serializePlayingCards } from "@/lib/cards";

describe("poker deck", () => {
  it("contains all 52 unique rank and suit combinations", () => {
    expect(POKER_DECK).toHaveLength(52);
    expect(new Set(POKER_DECK.map((card) => card.code)).size).toBe(52);
  });

  it("round-trips the notation stored with a memorable hand", () => {
    const cards = ["As", "Qd", "8d", "2c"] as const;
    expect(serializePlayingCards(cards)).toBe("A♠ Q♦ 8♦ 2♣");
    expect(parsePlayingCards("A♠ Q♦ 8♦ 2♣")).toEqual(cards);
  });

  it("accepts machine-friendly codes and rejects free text", () => {
    expect(parsePlayingCards("As Qd 10h")).toEqual(["As", "Qd", "10h"]);
    expect(parsePlayingCards("ace of spades")).toEqual([]);
  });
});
