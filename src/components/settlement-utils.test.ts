import { describe, expect, it } from "vitest";
import { outcomeForNet, sortSettlementPlayers } from "@/components/settlement-utils";

describe("settlement display mapping", () => {
  it("classifies positive, negative and zero nets", () => {
    expect(outcomeForNet(1)).toBe("winner");
    expect(outcomeForNet(-1)).toBe("loser");
    expect(outcomeForNet(0)).toBe("even");
  });

  it("sorts by net, then seat order for stable ties", () => {
    const players = [
      { id: "b", name: "ב", seatOrder: 2, net: 100, outcome: "winner", totalIn: 0, cashOut: 0, adjustment: 0 },
      { id: "a", name: "א", seatOrder: 1, net: 100, outcome: "winner", totalIn: 0, cashOut: 0, adjustment: 0 },
    ] as const;
    expect(sortSettlementPlayers(players).map((player) => player.id)).toEqual(["a", "b"]);
  });
});
