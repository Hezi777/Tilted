import { describe, expect, it } from "vitest";
import { buildSummaryText, isolate } from "@/lib/summary-text";

const base = {
  title: "ערב פוקר",
  dateLabel: "15.9.2026",
  pot: "₪1,200",
  players: [
    { name: "חן", net: "+₪180", outcome: "winner" as const },
    { name: "ניר", net: "-₪90", outcome: "loser" as const },
    { name: "עידו", net: "0", outcome: "even" as const },
  ],
  transfers: [{ fromName: "ניר", toName: "חן", amount: "₪90" }],
  note: null,
};

describe("summary text", () => {
  it("wraps every amount in directional isolates", () => {
    const text = buildSummaryText(base);
    // This is the whole reason the text export exists again, so it is asserted rather
    // than trusted: an unwrapped amount renders reversed inside a Hebrew line.
    for (const amount of ["₪1,200", "+₪180", "-₪90", "0", "₪90"]) {
      expect(text).toContain(isolate(amount));
    }
    // Every isolate opened is closed, or the rest of the message inherits its direction.
    const opens = [...text].filter((character) => character === "⁦").length;
    const closes = [...text].filter((character) => character === "⁩").length;
    expect(opens).toBe(closes);
    expect(opens).toBe(5);
  });

  it("states transfers as a direction, not a signed column", () => {
    expect(buildSummaryText(base)).toContain("ניר מעביר לחן");
  });

  it("marks each result with a glyph as well as a sign", () => {
    const text = buildSummaryText(base);
    expect(text).toContain("🟢 חן");
    expect(text).toContain("🔴 ניר");
    expect(text).toContain("⚪ עידו");
  });

  it("says so when nobody owes anybody", () => {
    const text = buildSummaryText({ ...base, transfers: [] });
    expect(text).toContain("אין העברות");
    expect(text).not.toContain("מי מעביר למי");
  });

  it("includes a mismatch note only when there was one", () => {
    expect(buildSummaryText(base)).not.toContain("ההפרש");
    expect(
      buildSummaryText({ ...base, note: "ההפרש בספירה פוצל בין המנצחים" }),
    ).toContain("ההפרש בספירה פוצל בין המנצחים");
  });
});
