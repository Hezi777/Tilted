import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("preserves an invited room path and query", () => {
    expect(safeNextPath("/join/A7K2?from=invite")).toBe(
      "/join/A7K2?from=invite",
    );
  });

  it.each([null, "", "https://evil.example", "//evil.example", "/auth/sign-in"])(
    "falls back home for an unsafe destination: %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
});
