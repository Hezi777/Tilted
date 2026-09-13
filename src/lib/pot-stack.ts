export type PotStackTier = 1 | 2 | 3 | 4;

/**
 * The pot grows from seats and rebuys, then deliberately stops before it crowds the table.
 */
export function potStackTierForBuyIns(buyInCount: number): PotStackTier {
  if (buyInCount <= 2) return 1;
  if (buyInCount <= 4) return 2;
  if (buyInCount <= 7) return 3;
  return 4;
}

