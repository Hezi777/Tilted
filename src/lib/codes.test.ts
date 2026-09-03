import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/codes";

const AMBIGUOUS = /[01OIL]/;

describe("generateRoomCode", () => {
  it("is 4 characters long", () => {
    expect(generateRoomCode()).toHaveLength(CODE_LENGTH);
  });

  it("is uppercase alphanumeric", () => {
    expect(generateRoomCode()).toMatch(/^[A-Z0-9]{4}$/);
  });

  it("never contains visually ambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(AMBIGUOUS);
    }
  });

  it("is not perfectly deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("room-code input", () => {
  it("normalizes case, spacing and punctuation", () => {
    expect(normalizeRoomCode(" k-7 qm ")).toBe("K7QM");
  });

  it("limits input to four canonical characters", () => {
    expect(normalizeRoomCode("abcd123")).toBe("ABCD");
  });

  it("accepts exactly four uppercase alphanumeric characters", () => {
    expect(isValidRoomCode("K7QM")).toBe(true);
    expect(isValidRoomCode("K7Q")).toBe(false);
    expect(isValidRoomCode("K7Q-1")).toBe(false);
  });
});
