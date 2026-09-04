import { describe, expect, it } from "vitest";
import { buildBitLink, normalizeIsraeliPhone } from "@/lib/bit";

describe("normalizeIsraeliPhone", () => {
  it("keeps an already-local number", () => {
    expect(normalizeIsraeliPhone("0501234567")).toBe("0501234567");
  });

  it("strips spaces and hyphens", () => {
    expect(normalizeIsraeliPhone("050-123-4567")).toBe("0501234567");
    expect(normalizeIsraeliPhone("050 123 4567")).toBe("0501234567");
  });

  it("converts a +972 country code to the local leading 0", () => {
    expect(normalizeIsraeliPhone("+972501234567")).toBe("0501234567");
    expect(normalizeIsraeliPhone("+972-50-123-4567")).toBe("0501234567");
  });

  it("converts a 972 country code without a plus", () => {
    expect(normalizeIsraeliPhone("972501234567")).toBe("0501234567");
  });

  it("returns null for a missing number", () => {
    expect(normalizeIsraeliPhone(null)).toBeNull();
    expect(normalizeIsraeliPhone(undefined)).toBeNull();
    expect(normalizeIsraeliPhone("")).toBeNull();
  });

  it("returns null for a malformed number", () => {
    expect(normalizeIsraeliPhone("1234")).toBeNull();
    expect(normalizeIsraeliPhone("not a phone")).toBeNull();
    expect(normalizeIsraeliPhone("0221234567")).toBeNull(); // landline, not mobile
    expect(normalizeIsraeliPhone("05012345")).toBeNull(); // too short
  });
});

describe("buildBitLink", () => {
  it("composes a deep link with phone and amount", () => {
    expect(buildBitLink("050-123-4567", 4550)).toBe(
      "bit://pay?phone=0501234567&amount=45.50",
    );
  });

  it("formats a whole-shekel amount without a decimal point", () => {
    expect(buildBitLink("0501234567", 2000)).toBe(
      "bit://pay?phone=0501234567&amount=20",
    );
  });

  it("refuses a link when the phone is missing or malformed", () => {
    expect(buildBitLink(null, 1000)).toBeNull();
    expect(buildBitLink("not a phone", 1000)).toBeNull();
  });

  it("refuses a link for a non-positive or out-of-range amount", () => {
    expect(buildBitLink("0501234567", 0)).toBeNull();
    expect(buildBitLink("0501234567", -100)).toBeNull();
    expect(buildBitLink("0501234567", 1.5)).toBeNull();
    expect(buildBitLink("0501234567", 100_000_001)).toBeNull();
  });
});
