/**
 * Composes a Bit (ביט) deep link that opens the app with a phone number and amount
 * pre-filled. Bit does not publish an official web API, so this uses the deep-link
 * scheme (`bit://pay?phone=...&amount=...`) already relied on by other Israeli sites
 * that hand off a payment to the Bit app.
 *
 * This module never talks to a server and never confirms a payment happened — it only
 * builds a link. Whether the transfer actually occurred is always a human decision,
 * recorded by the "paid" toggle elsewhere.
 *
 * Plan resolution #2 (docs/v2-plan.md): this is explicitly allowed even though the v1
 * spec forbids "Bit/PayBox integration" — no funds, credentials or payment API touch
 * the runtime, only a link composed client-side.
 */

import { AGOROT_PER_SHEKEL, MAX_AGOROT } from "@/lib/money";

/** Israeli mobile numbers only: 05X followed by seven digits, ten digits total. */
const ISRAELI_MOBILE_PATTERN = /^05\d{8}$/;

/**
 * Normalises an Israeli mobile number to local 0-prefixed form (e.g. "0501234567"),
 * accepting spaces, hyphens, a leading 0, or a +972/972 country code. Returns null for
 * anything missing or that does not resolve to a valid Israeli mobile number.
 */
export function normalizeIsraeliPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/[\s-]/g, "");
  if (stripped.length === 0) return null;

  let digits: string;
  if (stripped.startsWith("+972")) {
    digits = `0${stripped.slice(4)}`;
  } else if (stripped.startsWith("972")) {
    digits = `0${stripped.slice(3)}`;
  } else {
    digits = stripped;
  }

  if (!/^\d+$/.test(digits)) return null;
  return ISRAELI_MOBILE_PATTERN.test(digits) ? digits : null;
}

/**
 * Formats an agorot amount as a plain shekel number for the URL (e.g. "45.5", "20"),
 * using integer division only — the same technique `formatILS` uses, just without the
 * currency sign a query parameter has no use for.
 */
function shekelAmountParam(amount: number): string {
  const whole = Math.trunc(amount / AGOROT_PER_SHEKEL);
  const remainder = amount % AGOROT_PER_SHEKEL;
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Builds a `bit://` deep link for paying `amountAgorot` to `phone`. Returns null when
 * the phone is missing/malformed or the amount is not a positive, in-range integer —
 * callers should hide the Bit action rather than link to a broken deep link.
 */
export function buildBitLink(
  phone: string | null | undefined,
  amountAgorot: number,
): string | null {
  const normalized = normalizeIsraeliPhone(phone);
  if (!normalized) return null;
  if (!Number.isInteger(amountAgorot) || amountAgorot <= 0 || amountAgorot > MAX_AGOROT) {
    return null;
  }

  const params = new URLSearchParams({
    phone: normalized,
    amount: shekelAmountParam(amountAgorot),
  });
  return `bit://pay?${params.toString()}`;
}
