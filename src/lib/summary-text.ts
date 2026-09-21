/**
 * The night as plain text, for pasting into the group chat.
 *
 * The image (`share-card.ts`) stays the headline: it survives WhatsApp's rendering and
 * it looks like the app. But an image cannot be searched, and three weeks later the
 * question is always "רגע, כמה העברתי לניר?" -- which is a `Ctrl+F` in a chat, not a
 * scroll through photos. So both are offered, and this is the one that is still useful
 * later.
 *
 * ## Why every amount is wrapped
 *
 * This is the reason a text export was dropped once already. Hebrew runs right-to-left
 * and digits run left-to-right, so the Unicode bidi algorithm has to decide where a
 * number ends and the sentence resumes. Next to a currency sign, a minus, or a line
 * break, it frequently decides wrong, and `-₪90` renders as `90₪-` in the middle of a
 * Hebrew line. WhatsApp applies the same algorithm, so the string that looked right in
 * the app arrived scrambled in the chat.
 *
 * `⁦` (LEFT-TO-RIGHT ISOLATE) ... `⁩` (POP DIRECTIONAL ISOLATE) fences each
 * amount off: the text inside is laid out on its own, and it cannot reorder the Hebrew
 * around it or be reordered by it. This is the W3C's standing recommendation over the
 * older embedding characters, and it is why the amounts below are never interpolated
 * bare.
 *
 * ## Why the transfer lines are sentences
 *
 * A signed column (`ניר  -₪90`) reads as a table and depends entirely on alignment that
 * plain text in a chat app does not have. "ניר מעביר לעידו ₪90" survives any renderer,
 * says who pays whom without a legend, and cannot be misread as the opposite direction.
 */

/** Fences an amount so the bidi algorithm cannot reorder it into the Hebrew around it. */
export function isolate(amount: string): string {
  return `⁦${amount}⁩`;
}

/**
 * The one name a shared seat (plan item 9) shows everywhere: the WhatsApp text
 * (`buildSummaryText`, below) and the share image (`share-card.ts`) both read it from
 * `SettlementPlayer.name`, and `SettlementScreen.tsx` builds both payloads from that
 * same field -- so calling this once, in one place, is what keeps them from disagreeing.
 */
export function formatSeatDisplayName(
  primaryName: string,
  memberNames: readonly string[],
): string {
  if (memberNames.length === 0) return primaryName;
  return [primaryName, ...memberNames].join(" ו");
}

export interface SummaryTextInput {
  title: string;
  dateLabel: string;
  pot: string;
  players: readonly {
    name: string;
    net: string;
    outcome: "winner" | "loser" | "even";
  }[];
  transfers: readonly { fromName: string; toName: string; amount: string }[];
  note: string | null;
}

export function buildSummaryText(data: SummaryTextInput): string {
  const lines: string[] = [];

  lines.push(`🃏 ${data.title} — ${data.dateLabel}`);
  lines.push(`קופה: ${isolate(data.pot)}`);
  lines.push("");

  lines.push("התוצאות:");
  for (const player of data.players) {
    // The marker is redundant with the sign, deliberately: colour is not available in a
    // chat message and a sign alone is one character to miss on a phone screen.
    const marker =
      player.outcome === "winner" ? "🟢" : player.outcome === "loser" ? "🔴" : "⚪";
    lines.push(`${marker} ${player.name}: ${isolate(player.net)}`);
  }

  if (data.transfers.length > 0) {
    lines.push("");
    lines.push("מי מעביר למי:");
    for (const transfer of data.transfers) {
      lines.push(
        `• ${transfer.fromName} מעביר ל${transfer.toName} ${isolate(transfer.amount)}`,
      );
    }
  } else {
    lines.push("");
    lines.push("אין העברות — כולם יצאו באפס.");
  }

  if (data.note) {
    lines.push("");
    lines.push(data.note);
  }

  return lines.join("\n");
}
