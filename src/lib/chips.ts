/**
 * Pure chip-counting helpers (build plan M1, spec items 1 and 8).
 *
 * The value on a denomination row is the only source of money — colour is
 * presentation only, so two rows may share a colour with different values, or share
 * a value with different colours. All money math routes through src/lib/money.ts;
 * this file never reimplements agorot arithmetic.
 */

import { agorot, formatILS, sumAgorot, type Agorot } from "@/lib/money";

/** The subset of a chip_denominations row this module needs. */
export interface ChipDenominationLike {
  id: string;
  /** Agorot. The source of truth for this denomination's money value. */
  value: Agorot;
}

/** denominationId -> counted chips of that denomination. */
export type ChipCounts = Record<string, number>;

/** The count entered for one denomination, defaulting to zero when unset. */
export function countFor(counts: ChipCounts, denominationId: string): number {
  return counts[denominationId] ?? 0;
}

/**
 * The agorot total of a counted stack: sum of count * value across every
 * denomination in the set. Denominations absent from `counts` contribute zero.
 */
export function totalAgorotForCounts(
  denominations: readonly ChipDenominationLike[],
  counts: ChipCounts,
): Agorot {
  const lineTotals = denominations.map((denomination) => {
    const count = countFor(counts, denomination.id);
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(
        `Chip count for denomination ${denomination.id} must be a non-negative integer, got ${count}`,
      );
    }
    return agorot(denomination.value * count);
  });
  return sumAgorot(lineTotals);
}

/** Display label for one denomination's value, e.g. "₪5". */
export function formatDenominationValue(value: Agorot): string {
  return formatILS(value);
}
