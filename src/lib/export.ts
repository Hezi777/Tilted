/**
 * The WhatsApp-ready plain-text game summary. Spec section 7.
 *
 * Pure formatting only — every shekel figure here comes straight out of
 * `money.ts` and `settlement.ts`. Nothing in this file computes a net, a
 * transfer, or a pot; it only arranges strings around numbers those modules
 * already produced.
 */

import { agorot, formatILS, formatSignedILS, sumAgorot } from "@/lib/money";
import {
  computeNets,
  potTotal,
  settle,
  type MismatchResolution,
  type PlayerLedger,
} from "@/lib/settlement";

export interface SummaryPlayer {
  playerId: string;
  name: string;
}

export interface WhatsAppSummaryInput {
  /** Shown after the 🃏 title emoji, e.g. "פוקר - חמישי 12.9" becomes gameName "חמישי 12.9". */
  gameName: string;
  players: readonly SummaryPlayer[];
  ledgers: readonly PlayerLedger[];
  /** The mismatch resolution applied at cash-out, if any (spec 5.5 / 5.6). */
  resolution?: MismatchResolution;
}

/**
 * Left-to-right isolate (U+2066) ... pop directional isolate (U+2069). Wrapping
 * each amount run in these stops WhatsApp's bidi algorithm from reordering a
 * `+₪180`-style run inside surrounding Hebrew text. Applied only to amount
 * runs — never to names, counts, or emoji.
 */
function isolate(text: string): string {
  return `⁦${text}⁩`;
}

/** Strips the isolate marks `isolate` adds, for asserting the visible text in tests. */
export function stripBidiIsolates(text: string): string {
  return text.replace(/[⁦⁩]/g, "");
}

function nameLookup(players: readonly SummaryPlayer[]): (playerId: string) => string {
  const byId = new Map(players.map((p) => [p.playerId, p.name]));
  return (playerId: string) => {
    const name = byId.get(playerId);
    if (name === undefined) {
      throw new Error(`Unknown player ${playerId}`);
    }
    return name;
  };
}

/** One extra line naming the mismatch resolution applied at cash-out, spec 5.5. */
function mismatchLine(
  resolution: MismatchResolution,
  ledgers: readonly PlayerLedger[],
  nameFor: (playerId: string) => string,
): string {
  const totalAdjustment = sumAgorot(ledgers.map((l) => l.adjustment));
  const amount = formatILS(agorot(Math.abs(totalAdjustment)));

  if (resolution.kind === "split") {
    return `ההפרש בספירה פוצל בין המנצחים · ${isolate(amount)}`;
  }
  return `ההפרש בספירה הוקצה ל־${nameFor(resolution.playerId)} · ${isolate(amount)}`;
}

/** Builds the plain-text WhatsApp summary from spec section 7. */
export function formatWhatsAppSummary(input: WhatsAppSummaryInput): string {
  const { gameName, players, ledgers, resolution } = input;
  const nameFor = nameLookup(players);

  const pot = potTotal(ledgers);
  const nets = computeNets(ledgers);
  const transfers = settle(nets);

  const sortedNets = [...nets].sort(
    (a, b) => b.net - a.net || a.seatOrder - b.seatOrder,
  );

  const lines: string[] = [];
  lines.push(`🃏 פוקר - ${gameName}`);
  lines.push("");
  lines.push(`הקופה: ${isolate(formatILS(pot))}`);
  lines.push(`${ledgers.length} שחקנים`);
  lines.push("");
  lines.push("תוצאות:");
  for (const n of sortedNets) {
    const marker = n.net > 0 ? "🟢" : n.net < 0 ? "🔴" : "⚪";
    const amount = isolate(formatSignedILS(agorot(n.net)));
    lines.push(`${marker} ${nameFor(n.playerId)} ${amount}`);
  }

  if (transfers.length > 0) {
    lines.push("");
    lines.push("העברות:");
    for (const t of transfers) {
      const amount = isolate(formatILS(t.amount));
      lines.push(`${nameFor(t.fromPlayerId)} ➜ ${nameFor(t.toPlayerId)} · ${amount}`);
    }
  }

  if (resolution) {
    lines.push(mismatchLine(resolution, ledgers, nameFor));
  }

  return lines.join("\n");
}
