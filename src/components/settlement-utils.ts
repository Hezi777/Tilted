import type { SettlementOutcome, SettlementPlayer } from "@/db/settlement-queries";

export function outcomeForNet(net: number): SettlementOutcome {
  return net > 0 ? "winner" : net < 0 ? "loser" : "even";
}

export function sortSettlementPlayers(
  players: readonly SettlementPlayer[],
): SettlementPlayer[] {
  return [...players].sort((a, b) => b.net - a.net || a.seatOrder - b.seatOrder);
}

/** Short, deterministic home-table copy. Never targets the losing player. */
export function settlementVoiceLine(
  gameId: string,
  players: readonly SettlementPlayer[],
): string {
  const winner = sortSettlementPlayers(players).find((player) => player.net > 0);
  if (!winner) return "הז׳יטונים דיברו. הערב נגמר על האפס.";

  const rebuyCount = Math.max(0, (winner.buyInCount ?? 1) - 1);
  if (rebuyCount >= 3) {
    return `קאמבק מהסרטים: ${winner.name} בראש הערימה אחרי ${rebuyCount} ריבאיים.`;
  }

  const lines = [
    `אס זוכה, קינג בוכה. ${winner.name} בראש הערימה.`,
    `Read ’em and weep. ${winner.name} עם המילה האחרונה.`,
    `קנטה על הקופה. ${winner.name} בראש הערימה.`,
    `הז׳יטונים דיברו. ${winner.name} בראש הערימה.`,
  ];
  const selector = Array.from(gameId).reduce((total, character) => total + character.charCodeAt(0), 0);
  return lines[selector % lines.length];
}
