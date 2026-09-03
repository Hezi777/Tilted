import { describe, expect, it } from "vitest";
import {
  agorot,
  formatILS,
  formatSignedILS,
  MAX_AGOROT,
  shekelsToAgorot,
  sumAgorot,
} from "@/lib/money";

describe("agorot", () => {
  it("accepts integers", () => {
    expect(agorot(5000)).toBe(5000);
    expect(agorot(0)).toBe(0);
    expect(agorot(-9000)).toBe(-9000);
  });

  it("throws on a float, which is the whole point of the type", () => {
    expect(() => agorot(50.5)).toThrow(/integer/i);
    expect(() => agorot(0.1 + 0.2)).toThrow(/integer/i);
  });

  it("throws on NaN and Infinity", () => {
    expect(() => agorot(Number.NaN)).toThrow();
    expect(() => agorot(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("throws outside the sane range", () => {
    expect(() => agorot(MAX_AGOROT + 1)).toThrow(/range/i);
    expect(() => agorot(-MAX_AGOROT - 1)).toThrow(/range/i);
  });
});

describe("shekelsToAgorot", () => {
  it("converts whole shekels", () => {
    expect(shekelsToAgorot(50)).toBe(5000);
  });

  it("converts the two-decimal case without float drift", () => {
    expect(shekelsToAgorot(45.5)).toBe(4550);
    expect(shekelsToAgorot(0.07)).toBe(7);
    expect(shekelsToAgorot(1.1)).toBe(110);
    expect(shekelsToAgorot(19.99)).toBe(1999);
  });

  it("rejects more precision than an agora", () => {
    expect(() => shekelsToAgorot(1.005)).toThrow(/agor/i);
  });
});

describe("sumAgorot", () => {
  it("sums to an Agorot", () => {
    expect(sumAgorot([agorot(5000), agorot(2500), agorot(-1000)])).toBe(6500);
  });

  it("is 0 for an empty list", () => {
    expect(sumAgorot([])).toBe(0);
  });
});

describe("formatILS", () => {
  it("omits decimals on whole shekels", () => {
    expect(formatILS(agorot(5000))).toBe("₪50");
    expect(formatILS(agorot(0))).toBe("₪0");
  });

  it("shows two decimals only when there are agorot", () => {
    expect(formatILS(agorot(4550))).toBe("₪45.50");
    expect(formatILS(agorot(7))).toBe("₪0.07");
  });

  it("groups thousands", () => {
    expect(formatILS(agorot(120000))).toBe("₪1,200");
  });

  it("puts the minus before the shekel sign", () => {
    expect(formatILS(agorot(-9000))).toBe("-₪90");
  });
});

describe("formatSignedILS", () => {
  // These four strings appear verbatim in the spec's section 7 example.
  it("matches the spec's summary formatting", () => {
    expect(formatSignedILS(agorot(18000))).toBe("+₪180");
    expect(formatSignedILS(agorot(4000))).toBe("+₪40");
    expect(formatSignedILS(agorot(-9000))).toBe("-₪90");
    expect(formatSignedILS(agorot(-13000))).toBe("-₪130");
  });

  it("renders an exact break-even as a bare zero, not ₪0", () => {
    expect(formatSignedILS(agorot(0))).toBe("0");
  });
});
