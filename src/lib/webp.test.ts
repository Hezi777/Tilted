import { describe, expect, it } from "vitest";
import { fitWithin, MAX_AVATAR_EDGE, webpFileName } from "@/lib/webp";

/**
 * Only the pure halves are covered here. `toWebpFile` needs a canvas encoder, which the
 * node test environment does not have -- asserting against a stub would prove the stub
 * works, not the conversion. Its contract that matters (every failure returns the
 * original file, never throws) is enforced by its own structure: every branch returns
 * `file`.
 */

describe("webpFileName", () => {
  it("swaps the extension", () => {
    expect(webpFileName("Subject 4.png")).toBe("Subject 4.webp");
    expect(webpFileName("yarin.jpeg")).toBe("yarin.webp");
  });

  it("keeps dots inside the name", () => {
    expect(webpFileName("hen.v2.png")).toBe("hen.v2.webp");
  });

  it("handles a name with no extension", () => {
    expect(webpFileName("character")).toBe("character.webp");
  });

  it("never returns a bare extension", () => {
    expect(webpFileName(".png")).toBe("avatar.webp");
    expect(webpFileName("")).toBe("avatar.webp");
  });
});

describe("fitWithin", () => {
  it("leaves an image that already fits alone", () => {
    expect(fitWithin(200, 200)).toEqual({ width: 200, height: 200 });
    expect(fitWithin(MAX_AVATAR_EDGE, MAX_AVATAR_EDGE)).toEqual({
      width: MAX_AVATAR_EDGE,
      height: MAX_AVATAR_EDGE,
    });
  });

  it("scales the longest edge down and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 2000)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(2000, 4000)).toEqual({ width: 128, height: 256 });
  });

  it("never returns an edge above the cap", () => {
    for (const [w, h] of [[3000, 17], [17, 3000], [1024, 1024]] as const) {
      const fitted = fitWithin(w, h);
      expect(Math.max(fitted.width, fitted.height)).toBeLessThanOrEqual(
        MAX_AVATAR_EDGE,
      );
    }
  });
});
