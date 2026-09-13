import { describe, expect, it } from "vitest";
import { israelDateKey } from "@/lib/date";

describe("israelDateKey", () => {
  it("keeps a late-evening Israel time on the same day", () => {
    // 23:30 Israel time (UTC+3 in September) is still 20:30 UTC the same day.
    expect(israelDateKey("2026-09-13T20:30:00.000Z")).toBe("2026-09-13");
  });

  it("does not roll a just-after-midnight Israel time back to the previous UTC day", () => {
    // 00:30 Israel time (UTC+3) is 21:30 UTC the previous day -- naive UTC formatting
    // would read this as the 12th, but it is the 13th in Israel.
    expect(israelDateKey("2026-09-12T21:30:00.000Z")).toBe("2026-09-13");
  });

  it("accepts a Date instance directly", () => {
    expect(israelDateKey(new Date("2026-09-13T20:30:00.000Z"))).toBe("2026-09-13");
  });
});
