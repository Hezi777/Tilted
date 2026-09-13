import { describe, expect, it } from "vitest";
import { railGeometry, railPoints, railTier } from "@/lib/seat-layout";

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
    expect(railTier(6).avatar).toBe("size-12");
    expect(railTier(7).avatar).toBe("size-11");
    expect(railTier(8).avatar).toBe("size-10");
  });
});
