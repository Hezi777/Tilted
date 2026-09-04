import { describe, expect, it } from "vitest";
import { outcomeForNet, settlementVoiceLine, sortSettlementPlayers } from "@/components/settlement-utils";

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

describe("settlement voice", () => {
  it("is deterministic and celebrates only the winner", () => {
    const players = [
      { id: "winner", name: "דין", seatOrder: 1, net: 100, outcome: "winner", totalIn: 0, cashOut: 0, adjustment: 0 },
      { id: "loser", name: "רועי", seatOrder: 2, net: -100, outcome: "loser", totalIn: 0, cashOut: 0, adjustment: 0 },
    ] as const;
    const line = settlementVoiceLine("game-one", players);
    expect(settlementVoiceLine("game-one", players)).toBe(line);
    expect(line).toContain("דין");
    expect(line).not.toContain("רועי");
  });

  it("calls out a winner's rebuy comeback", () => {
    const players = [
      { id: "winner", name: "דין", seatOrder: 1, net: 100, outcome: "winner", totalIn: 0, buyInCount: 5, cashOut: 0, adjustment: 0 },
    ] as const;
    expect(settlementVoiceLine("game-two", players)).toBe(
      "קאמבק מהסרטים: דין בראש הערימה אחרי 4 ריבאיים.",
    );
  });
});
