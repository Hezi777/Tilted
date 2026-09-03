import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("toolchain", () => {
  it("resolves the @/ alias and runs tests", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
