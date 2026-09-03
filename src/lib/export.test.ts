import { describe, expect, it } from "vitest";
import { agorot, type Agorot } from "@/lib/money";
import type { PlayerLedger } from "@/lib/settlement";
import {
  formatWhatsAppSummary,
  stripBidiIsolates,
  type SummaryPlayer,
} from "@/lib/export";

/** Terse ledger builder: shekels in, shekels counted back out. */
function p(
  playerId: string,
  seatOrder: number,
  inShekels: number,
  outShekels: number,
  adjustmentAgorot = 0,
): PlayerLedger {
  return {
    playerId,
    seatOrder,
    totalIn: agorot(inShekels * 100) as Agorot,
    cashOut: agorot(outShekels * 100) as Agorot,
    adjustment: agorot(adjustmentAgorot) as Agorot,
  };
}

const SECTION_7_PLAYERS: SummaryPlayer[] = [
  { playerId: "alon", name: "אלון" },
  { playerId: "din", name: "דין" },
  { playerId: "yuval", name: "יובל" },
  { playerId: "shai", name: "שי" },
  { playerId: "roi", name: "רועי" },
];

const SECTION_7_LEDGERS: PlayerLedger[] = [
  p("alon", 1, 50, 230),
  p("din", 2, 50, 90),
  p("yuval", 3, 100, 100),
  p("shai", 4, 150, 60),
  p("roi", 5, 150, 20),
];

const SECTION_7_EXAMPLE = `🃏 פוקר - חמישי 12.9

הקופה: ₪500
5 שחקנים

תוצאות:
🟢 אלון +₪180
🟢 דין +₪40
⚪ יובל 0
🔴 שי -₪90
🔴 רועי -₪130

העברות:
רועי ➜ אלון · ₪130
שי ➜ אלון · ₪50
שי ➜ דין · ₪40`;

describe("formatWhatsAppSummary", () => {
  it("reproduces the section 7 example exactly", () => {
    const result = formatWhatsAppSummary({
      gameName: "חמישי 12.9",
      players: SECTION_7_PLAYERS,
      ledgers: SECTION_7_LEDGERS,
    });

    expect(stripBidiIsolates(result)).toBe(SECTION_7_EXAMPLE);
  });

  it("wraps every amount run in bidi isolates", () => {
    const result = formatWhatsAppSummary({
      gameName: "חמישי 12.9",
      players: SECTION_7_PLAYERS,
      ledgers: SECTION_7_LEDGERS,
    });

    expect(result).toContain("הקופה: ⁦₪500⁩");
    expect(result).toContain("🟢 אלון ⁦+₪180⁩");
    expect(result).toContain("⚪ יובל ⁦0⁩");
    expect(result).toContain("🔴 רועי ⁦-₪130⁩");
    expect(result).toContain("רועי ➜ אלון · ⁦₪130⁩");
    // Names and headers are untouched.
    expect(result).not.toContain("⁦אלון⁩");
    expect(result).not.toContain("⁦תוצאות:⁩");
  });

  it("omits the transfers section when everyone breaks even", () => {
    const players: SummaryPlayer[] = [
      { playerId: "a", name: "עומר" },
      { playerId: "b", name: "נועה" },
    ];
    const ledgers: PlayerLedger[] = [p("a", 1, 100, 100), p("b", 2, 100, 100)];

    const result = formatWhatsAppSummary({
      gameName: "בדיקה",
      players,
      ledgers,
    });

    expect(stripBidiIsolates(result)).toBe(
      `🃏 פוקר - בדיקה

הקופה: ₪200
2 שחקנים

תוצאות:
⚪ עומר 0
⚪ נועה 0`,
    );
    expect(result).not.toContain("העברות:");
  });

  it("shows a bare 0 (not ₪0) for an exact break-even player", () => {
    const players: SummaryPlayer[] = [
      { playerId: "a", name: "עומר" },
      { playerId: "b", name: "נועה" },
      { playerId: "c", name: "דור" },
    ];
    const ledgers: PlayerLedger[] = [
      p("a", 1, 50, 100),
      p("b", 2, 50, 50),
      p("c", 3, 50, 0),
    ];

    const result = formatWhatsAppSummary({
      gameName: "בדיקה",
      players,
      ledgers,
    });

    expect(stripBidiIsolates(result)).toContain("⚪ נועה 0");
    expect(stripBidiIsolates(result)).not.toContain("₪0");
  });

  it("appends the split-resolution line naming the amount", () => {
    // Chips counted came up ₪20 short of the pot; the diff was split across
    // the two winners (₪15 to דנה, ₪5 to גיל), leaving nets summing to zero.
    const players: SummaryPlayer[] = [
      { playerId: "dana", name: "דנה" },
      { playerId: "gil", name: "גיל" },
      { playerId: "noa", name: "נועה" },
    ];
    const ledgers: PlayerLedger[] = [
      p("dana", 1, 100, 110, 1500),
      p("gil", 2, 100, 105, 500),
      p("noa", 3, 100, 65, 0),
    ];

    const result = formatWhatsAppSummary({
      gameName: "חמישי 12.9",
      players,
      ledgers,
      resolution: { kind: "split" },
    });

    const visible = stripBidiIsolates(result);
    expect(visible.endsWith("ההפרש בספירה פוצל בין המנצחים · ₪20")).toBe(
      true,
    );
    expect(result).toContain("⁦₪20⁩");
  });

  it("appends the assign-resolution line naming the player and the amount", () => {
    // Same ₪20 shortfall, but assigned entirely to רועי instead of split.
    const ledgers: PlayerLedger[] = [
      p("alon", 1, 50, 230),
      p("din", 2, 50, 90),
      p("yuval", 3, 100, 100),
      p("shai", 4, 150, 60),
      p("roi", 5, 150, 0, 2000),
    ];

    const result = formatWhatsAppSummary({
      gameName: "חמישי 12.9",
      players: SECTION_7_PLAYERS,
      ledgers,
      resolution: { kind: "assign", playerId: "roi" },
    });

    const visible = stripBidiIsolates(result);
    expect(visible.endsWith("ההפרש בספירה הוקצה ל־רועי · ₪20")).toBe(true);
    expect(result).toContain("⁦₪20⁩");
  });
});
