/**
 * Nets, transfers, and the end-of-night reconciliation. Spec sections 5.5 and 6.
 *
 * Everything here is pure and integer-only. The database never computes money.
 */

import { agorot, type Agorot } from "@/lib/money";

export interface PlayerLedger {
  playerId: string;
  /** Ties are broken by seat order so every result is stable and reproducible. */
  seatOrder: number;
  /** Sum of this player's live buy-ins. Soft-deleted rows are excluded upstream. */
  totalIn: Agorot;
  /** Chips counted at the end. Null until they cash out. */
  cashOut: Agorot | null;
  /** Correction from a mismatch resolution. Zero for a night that added up. */
  adjustment: Agorot;
}

export interface Net {
  playerId: string;
  seatOrder: number;
  /** Positive means they are owed money. */
  net: number;
}

export interface Transfer {
  fromPlayerId: string;
  toPlayerId: string;
  amount: Agorot;
}

/** The chips on the table did not add up to the pot. */
export class SumMismatchError extends Error {
  /** Counted minus pot. Negative means chips are missing. */
  readonly delta: number;

  constructor(delta: number) {
    super(`Nets do not sum to zero: off by ${delta} agorot`);
    this.name = "SumMismatchError";
    this.delta = delta;
  }
}

/** A proportional split needs somebody in profit to take the hit. */
export class NoWinnersError extends Error {
  constructor() {
    super("Cannot split the difference: no player has a positive net");
    this.name = "NoWinnersError";
  }
}

export function potTotal(ledgers: readonly PlayerLedger[]): Agorot {
  return agorot(ledgers.reduce((total, l) => total + l.totalIn, 0));
}

/** What was actually counted off the table, before any correction. */
export function countedTotal(ledgers: readonly PlayerLedger[]): Agorot {
  return agorot(ledgers.reduce((total, l) => total + (l.cashOut ?? 0), 0));
}

/**
 * Counted minus pot, ignoring any adjustment already stored. Negative is the
 * common case: chips went missing. Zero means the game can be settled.
 */
export function mismatchDelta(ledgers: readonly PlayerLedger[]): number {
  return countedTotal(ledgers) - potTotal(ledgers);
}

export function computeNets(ledgers: readonly PlayerLedger[]): Net[] {
  return ledgers.map((l) => ({
    playerId: l.playerId,
    seatOrder: l.seatOrder,
    net: (l.cashOut ?? 0) + l.adjustment - l.totalIn,
  }));
}

/**
 * The greedy pass from the spec's section 6: largest debtor pays the largest
 * creditor, repeatedly. Balance-correct and at most n-1 transfers.
 *
 * Note this is not always the *minimum* number of transfers -- for debtors
 * -6,-4,-4 against creditors +8,+6 it emits four where three suffice, because a
 * true minimum is a subset-partitioning problem. The spec specifies this
 * algorithm and its worked example depends on it, so this is deliberate.
 */
export function settle(nets: readonly Net[]): Transfer[] {
  const delta = nets.reduce((total, n) => total + n.net, 0);
  if (delta !== 0) throw new SumMismatchError(delta);

  const debtors = nets
    .filter((n) => n.net < 0)
    .sort((a, b) => a.net - b.net || a.seatOrder - b.seatOrder)
    .map((n) => ({ playerId: n.playerId, left: -n.net }));

  const creditors = nets
    .filter((n) => n.net > 0)
    .sort((a, b) => b.net - a.net || a.seatOrder - b.seatOrder)
    .map((n) => ({ playerId: n.playerId, left: n.net }));

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amount = Math.min(debtor.left, creditor.left);

    transfers.push({
      fromPlayerId: debtor.playerId,
      toPlayerId: creditor.playerId,
      amount: agorot(amount),
    });

    debtor.left -= amount;
    creditor.left -= amount;
    if (debtor.left === 0) d += 1;
    if (creditor.left === 0) c += 1;
  }

  return transfers;
}

export type MismatchResolution =
  | { kind: "split" }
  | { kind: "assign"; playerId: string };

/**
 * Produces the **complete** adjustment map for a game: every player appears, and
 * the result replaces any adjustment already stored rather than adding to it.
 * That matters because the host can change their mind, and an incremental
 * version would stack corrections until the ledger no longer summed to zero.
 *
 * The adjustments always sum to exactly `-mismatchDelta`, so applying them makes
 * the game settleable.
 */
export function resolveMismatch(
  ledgers: readonly PlayerLedger[],
  resolution: MismatchResolution,
): ReadonlyMap<string, Agorot> {
  const adjustments = new Map<string, Agorot>(
    ledgers.map((l) => [l.playerId, agorot(0)]),
  );

  const delta = mismatchDelta(ledgers);
  if (delta === 0) return adjustments;

  // What we must add across the table to bring the count back to the pot.
  const correction = -delta;

  if (resolution.kind === "assign") {
    if (!adjustments.has(resolution.playerId)) {
      throw new Error(`Unknown player ${resolution.playerId}`);
    }
    adjustments.set(resolution.playerId, agorot(correction));
    return adjustments;
  }

  // Winners are judged on their raw nets, before any stored adjustment, so a
  // re-resolution splits the same way the first one did.
  const winners = ledgers
    .filter((l) => (l.cashOut ?? 0) - l.totalIn > 0)
    .map((l) => ({
      playerId: l.playerId,
      seatOrder: l.seatOrder,
      weight: (l.cashOut ?? 0) - l.totalIn,
    }));

  if (winners.length === 0) throw new NoWinnersError();

  // Largest remainder over the absolute size, with the sign applied afterwards.
  // Flooring the signed quotas directly would round -0.5 down to -1 on both of
  // two equal winners and remove twice what was missing.
  const magnitude = Math.abs(correction);
  const sign = Math.sign(correction);
  const totalWeight = winners.reduce((total, w) => total + w.weight, 0);

  const shares = winners.map((w) => {
    const exact = (magnitude * w.weight) / totalWeight;
    const floor = Math.floor(exact);
    return { ...w, floor, remainder: exact - floor };
  });

  let allocated = shares.reduce((total, s) => total + s.floor, 0);
  const order = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.seatOrder - b.seatOrder,
  );

  for (const share of order) {
    if (allocated >= magnitude) break;
    share.floor += 1;
    allocated += 1;
  }

  for (const share of shares) {
    // `|| 0` normalises -0, which is a real value in JS and leaks into tests.
    adjustments.set(share.playerId, agorot(sign * share.floor || 0));
  }

  return adjustments;
}
