import type { SettlementOutcome, SettlementPlayer } from "@/db/settlement-queries";

export function outcomeForNet(net: number): SettlementOutcome {
  return net > 0 ? "winner" : net < 0 ? "loser" : "even";
}

export function sortSettlementPlayers(
  players: readonly SettlementPlayer[],
): SettlementPlayer[] {
  return [...players].sort((a, b) => b.net - a.net || a.seatOrder - b.seatOrder);
}
