import { describe, expect, it } from "vitest";
import { potStackTierForBuyIns } from "@/lib/pot-stack";

describe("potStackTierForBuyIns", () => {
  it("grows for joins and rebuys, then caps at tier four", () => {
    expect([1, 2, 3, 4, 5, 7, 8, 30].map(potStackTierForBuyIns)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

