import { describe, expect, it } from "vitest";
import {
  minAdjacentGapPx,
  railGeometry,
  railPoints,
  railTier,
  railTierWidthPx,
  REFERENCE_WIDTH_PX,
} from "@/lib/seat-layout";

describe("railGeometry", () => {
  it("holds the rail flat at three or fewer and deepens up to eight", () => {
    expect(railGeometry(3).t).toBe(0);
    expect(railGeometry(8).t).toBe(1);
    expect(railGeometry(3).height).toBeLessThan(railGeometry(8).height);
  });

  it("never climbs the apex or narrows past the caps at higher counts", () => {
    expect(railGeometry(20).t).toBe(1);
    expect(railGeometry(20)).toEqual(railGeometry(8));
  });
});

describe("railPoints", () => {
  it("places a single seat at the apex", () => {
    const rail = railGeometry(1);
    expect(railPoints(rail, 1)).toEqual([{ left: "50%", top: `${rail.apex}%` }]);
  });

  it("spaces seats symmetrically around the centre", () => {
    const rail = railGeometry(4);
    const points = railPoints(rail, 4);
    expect(points).toHaveLength(4);
    // `railPoints` walks the curve in discrete steps, so symmetric seats land
    // within a fraction of a step of each other rather than exactly.
    const xs = points.map((point) => Number.parseFloat(point.left));
    expect(xs[0]).toBeCloseTo(100 - xs[3], 0);
    expect(xs[1]).toBeCloseTo(100 - xs[2], 0);
  });
});

describe("railTier", () => {
  it("gives up avatar size only as the rail actually runs out of room", () => {
    expect(railTier(2).avatar).toBe("size-16");
    expect(railTier(4).avatar).toBe("size-14");
    expect(railTier(6).avatar).toBe("size-8");
    expect(railTier(7).avatar).toBe("size-6");
    expect(railTier(8).avatar).toBe("size-6");
  });

  it("shrinks the avatar monotonically as the table fills", () => {
    const size = (count: number) => Number(railTier(count).avatar.replace("size-", ""));
    for (let count = 2; count <= MAX_SEATS; count += 1) {
      expect(size(count)).toBeLessThanOrEqual(size(count - 1));
    }
  });
});

/**
 * The rail and the seat sizes have to agree, and they used to be written apart.
 *
 * `railPoints` spaces seats by equal arc length, so the gap between neighbours shrinks
 * with every player added. `railTier` handed back a fixed width. Nothing connected
 * them, and from six players up the buttons overlapped -- same `z-20`, so a tap in the
 * overlap went to whichever painted later rather than the one under the thumb, which on
 * the ordinary night means the host credits the wrong player's rebuy.
 *
 * These re-derive the gaps from the geometry rather than trusting a number written
 * down beside it, which is the only thing that stops the two drifting apart again.
 */

/** Two past the ten avatar keys, because only `createGame` enforces that cap. */
const MAX_SEATS = 12;

describe("seats never overlap", () => {
  it("keeps every button inside the gap it actually has", () => {
    for (let count = 2; count <= MAX_SEATS; count += 1) {
      expect(
        railTierWidthPx(count),
        `${count} opponents: a ${railTierWidthPx(count)}px button does not fit a ${minAdjacentGapPx(count).toFixed(1)}px gap`,
      ).toBeLessThanOrEqual(minAdjacentGapPx(count));
    }
  });

  it("gives up width only as the rail runs out of room", () => {
    for (let count = 3; count <= MAX_SEATS; count += 1) {
      expect(railTierWidthPx(count)).toBeLessThanOrEqual(railTierWidthPx(count - 1));
    }
  });

  it("keeps every seat inside the box it is drawn in", () => {
    for (let count = 1; count <= MAX_SEATS; count += 1) {
      const halfWidth = (railTierWidthPx(count) / 2 / REFERENCE_WIDTH_PX) * 100;
      for (const point of railPoints(railGeometry(count), count)) {
        const left = Number.parseFloat(point.left);
        expect(left - halfWidth).toBeGreaterThanOrEqual(0);
        expect(left + halfWidth).toBeLessThanOrEqual(100);
      }
    }
  });

  it("holds the 44px floor for the counts this group actually plays", () => {
    // Six opponents is seven at the table, and that is where the arc stops being able
    // to carry a 44px target at all. Recorded as a boundary rather than a wish: if a
    // change buys more room this should be raised, and if one costs room this fails.
    for (let count = 1; count <= 6; count += 1) {
      expect(railTierWidthPx(count)).toBeGreaterThanOrEqual(44);
    }
  });

  it("never lets the avatar become the thing a thumb aims at instead of the button", () => {
    // Some overflow is deliberate at the tightest tiers -- it is cosmetic, and the
    // button is what captures the tap -- but not so much that they swap roles.
    for (let count = 1; count <= MAX_SEATS; count += 1) {
      const avatar = Number(railTier(count).avatar.replace("size-", "")) * 4;
      expect(avatar).toBeLessThanOrEqual(railTierWidthPx(count) + 12);
    }
  });
});
