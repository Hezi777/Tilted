import { describe, expect, it } from "vitest";
import { agorot } from "@/lib/money";
import {
  countFor,
  denominationInputText,
  formatDenominationValue,
  totalAgorotForCounts,
  type ChipDenominationLike,
} from "@/lib/chips";

describe("totalAgorotForCounts", () => {
  it("sums count times value across denominations", () => {
    const denominations: ChipDenominationLike[] = [
      { id: "white", value: agorot(100) }, // ₪1
      { id: "red", value: agorot(500) }, // ₪5
      { id: "black", value: agorot(10000) }, // ₪100
    ];
    const total = totalAgorotForCounts(denominations, {
      white: 10,
      red: 4,
      black: 2,
    });
    // 10*100 + 4*500 + 2*10000 = 1000 + 2000 + 20000 = 23000
    expect(total).toBe(23000);
  });

  it("treats a missing count as zero", () => {
    const denominations: ChipDenominationLike[] = [
      { id: "white", value: agorot(100) },
      { id: "red", value: agorot(500) },
    ];
    expect(totalAgorotForCounts(denominations, { white: 3 })).toBe(300);
  });

  it("returns zero for an empty set of denominations", () => {
    expect(totalAgorotForCounts([], {})).toBe(0);
  });

  it("uses the value on each row, never the colour, when two rows share a colour", () => {
    // Same "colour" concept (both red), different values — the id/value pair on the
    // row must drive the total, not any shared colour string.
    const denominations: ChipDenominationLike[] = [
      { id: "red-small", value: agorot(500) }, // ₪5, red
      { id: "red-big", value: agorot(2500) }, // ₪25, also red
    ];
    const total = totalAgorotForCounts(denominations, {
      "red-small": 2,
      "red-big": 1,
    });
    // 2*500 + 1*2500 = 3500
    expect(total).toBe(3500);
  });

  it("lets two differently coloured denominations share a value without collapsing", () => {
    const denominations: ChipDenominationLike[] = [
      { id: "green", value: agorot(1000) }, // ₪10
      { id: "blue", value: agorot(1000) }, // ₪10, same value as green
    ];
    const total = totalAgorotForCounts(denominations, {
      green: 3,
      blue: 5,
    });
    // Each row counted independently by id: 3*1000 + 5*1000 = 8000, not deduped
    // by the fact the two rows carry the same value.
    expect(total).toBe(8000);
  });

  it("rejects a negative count", () => {
    const denominations: ChipDenominationLike[] = [
      { id: "white", value: agorot(100) },
    ];
    expect(() =>
      totalAgorotForCounts(denominations, { white: -1 }),
    ).toThrow(RangeError);
  });

  it("rejects a non-integer count", () => {
    const denominations: ChipDenominationLike[] = [
      { id: "white", value: agorot(100) },
    ];
    expect(() =>
      totalAgorotForCounts(denominations, { white: 1.5 }),
    ).toThrow(RangeError);
  });
});

describe("countFor", () => {
  it("returns the stored count", () => {
    expect(countFor({ white: 7 }, "white")).toBe(7);
  });

  it("defaults an unset denomination to zero", () => {
    expect(countFor({}, "white")).toBe(0);
  });
});

describe("formatDenominationValue", () => {
  it("formats a whole-shekel value", () => {
    expect(formatDenominationValue(agorot(500))).toBe("₪5");
  });

  it("formats a value with agorot", () => {
    expect(formatDenominationValue(agorot(550))).toBe("₪5.50");
  });
});

describe("denominationInputText", () => {
  it("returns editable shekel text without grouping or a currency sign", () => {
    expect(denominationInputText(agorot(123450))).toBe("1234.50");
  });
});
