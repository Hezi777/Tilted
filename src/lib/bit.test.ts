import { describe, expect, it } from "vitest";
import { normalizeIsraeliPhone, whatsappPaymentLink } from "@/lib/bit";

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

describe("whatsappPaymentLink", () => {
  it("builds an international wa.me link with the message already written", () => {
    expect(whatsappPaymentLink("0501234567", "שלום")).toBe(
      "https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D",
    );
  });

  it("accepts the same spellings the copy button does", () => {
    const expected = "https://wa.me/972501234567?text=x";
    expect(whatsappPaymentLink("+972-50-123-4567", "x")).toBe(expected);
    expect(whatsappPaymentLink("050 123 4567", "x")).toBe(expected);
  });

  it("is null for anything that is not an Israeli mobile, so the caller can fall back", () => {
    expect(whatsappPaymentLink(null, "x")).toBeNull();
    expect(whatsappPaymentLink("03-1234567", "x")).toBeNull();
    expect(whatsappPaymentLink("", "x")).toBeNull();
  });
});
