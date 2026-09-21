import { describe, expect, it } from "vitest";
import { ARC_MAX_OPPONENTS, MAX_SEATS } from "@/lib/seat-layout";

/**
 * PLAN.md wave 1a item 6 / docs/2026-09-audit.md open items 7 and 8.
 *
 * A separate file from `seat-layout.test.ts` -- that file's own local `MAX_SEATS`
 * constant (12, "two past the ten avatar keys") predates this export and tests a
 * different question (geometry never overlapping); it is not touched here.
 */
describe("seat count cap", () => {
  it("caps the table at ten, not at the number of avatar faces", () => {
    expect(MAX_SEATS).toBe(10);
  });

  it("keeps the arc's own limit below the table cap, so the list mode is reachable", () => {
    // "The arc holds to seven seats" (docs/2026-09-audit.md item 7): a table's host
    // plus ARC_MAX_OPPONENTS opponents. Above that, PokerTableArc renders a list
    // instead -- which only matters if a table can actually reach that size.
    expect(ARC_MAX_OPPONENTS).toBeLessThan(MAX_SEATS);
    expect(ARC_MAX_OPPONENTS + 1).toBeLessThanOrEqual(MAX_SEATS);
  });
});
