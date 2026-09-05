import { agorot, isAgorot, sumAgorot } from "@/lib/money";

export interface HandBoard {
  flop: string;
  turn: string;
  river: string;
}

export interface HandResultInput {
  playerId: string;
  delta: number;
}

export type HandResultIssue =
  | "duplicate_players"
  | "winner_not_participating"
  | "winner_not_positive"
  | "invalid_delta"
  | "results_not_balanced";

/** Cross-row rules that field validation and database checks cannot express. */
export function validateHandResults(
  players: readonly HandResultInput[],
  winnerPlayerId: string,
): HandResultIssue[] {
  const issues: HandResultIssue[] = [];
  const playerIds = players.map((player) => player.playerId);
  if (new Set(playerIds).size !== playerIds.length) issues.push("duplicate_players");

  const winner = players.find((player) => player.playerId === winnerPlayerId);
  if (!winner) issues.push("winner_not_participating");
  else if (winner.delta <= 0) issues.push("winner_not_positive");

  if (players.some((player) => !isAgorot(player.delta))) {
    issues.push("invalid_delta");
  } else if (sumAgorot(players.map((player) => agorot(player.delta))) !== 0) {
    issues.push("results_not_balanced");
  }
  return issues;
}

export function serializeHandBoard(board: HandBoard): string {
  return JSON.stringify(board);
}

/** Reads current JSON rows and the pipe-delimited representation used during prototyping. */
export function parseHandBoard(value: string | null): HandBoard {
  if (!value) return { flop: "", turn: "", river: "" };
  try {
    const parsed = JSON.parse(value) as Partial<HandBoard>;
    return {
      flop: typeof parsed.flop === "string" ? parsed.flop : "",
      turn: typeof parsed.turn === "string" ? parsed.turn : "",
      river: typeof parsed.river === "string" ? parsed.river : "",
    };
  } catch {
    const [flop = "", turn = "", river = ""] = value
      .split("|")
      .map((part) => part.trim());
    return { flop, turn, river };
  }
}
