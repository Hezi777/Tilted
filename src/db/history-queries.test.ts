import { describe, expect, it } from "vitest";
import { isHistoryStatus } from "@/db/history-queries";

describe("history status", () => {
  it("includes only closed games", () => {
    expect(isHistoryStatus("closed")).toBe(true);
    expect(isHistoryStatus("active")).toBe(false);
    expect(isHistoryStatus("settling")).toBe(false);
    expect(isHistoryStatus("cancelled")).toBe(false);
  });
});
