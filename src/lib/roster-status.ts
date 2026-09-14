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
 * Who the host may hand the table to: another seat that is still playing **and whose
 * owner has actually signed in to it**.
 *
 * The claimed-seat condition is a deliberate product rule, not a mirror of the server
 * (`assertCanHandoffHost` is looser and would accept an unclaimed seat). Handing the
 * table to a phone that is not in the room strands the night: the ex-host's own seat
 * settles and loses `is_host`, so nobody left in the room can move the game to
 * settling, close it, or even cancel it.
 *
 * A host with nobody signed in is not stuck -- that is what "סיום לכולם" is for. The
 * picker says so rather than presenting an empty list.
 */
export function isEligibleSuccessor(player: {
  isYou: boolean;
  isSettled: boolean;
  isWaiting: boolean;
}): boolean {
  return !player.isYou && !player.isSettled && !player.isWaiting;
}
