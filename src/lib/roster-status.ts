/**
 * Pure seat-state predicates shared by the live table (`PokerTableArc`), the seat
 * dialog (`PlayerCard`), and the host's successor picker (`LiveGameScreen`) -- kept
 * here once so a seat reads the same everywhere instead of three separate ternaries
 * drifting apart.
 */

export interface SeatStatusInput {
  isWaiting: boolean;
  isSettled: boolean;
}

export type SeatStatus = "waiting" | "settled" | "active";

/**
 * Which of the three mutually exclusive seat states a player is in. A waiting seat
 * (the host made it, nobody has opened it yet) can never also be settled -- settling
 * is something only a seat's own owner, or the host acting for them, does to a seat
 * that has arrived.
 */
export function seatStatus({ isWaiting, isSettled }: SeatStatusInput): SeatStatus {
  if (isWaiting) return "waiting";
  if (isSettled) return "settled";
  return "active";
}

/**
 * Who the host may hand the table to: another live seat, still at the table, whose
 * owner has actually opened the game. Handing it to a seat nobody has claimed yet
 * strands the table with no one able to act as host.
 */
export function isEligibleSuccessor(player: {
  isYou: boolean;
  isSettled: boolean;
  isWaiting: boolean;
}): boolean {
  return !player.isYou && !player.isSettled && !player.isWaiting;
}
