/**
 * Phone handling for the manual Bit hand-off.
 *
 * Bit still does not publish a person-to-person deep-link scheme. Its API is licensed
 * through Bank Hapoalim for businesses and PISPs; the "collect by link" flow is
 * generated inside the app by the payer, not constructible by a third party. So the
 * settlement screen copies the recipient's verified mobile number for pasting into Bit,
 * rather than shipping an undocumented URL that silently does nothing.
 *
 * What *is* a public, documented deep link is WhatsApp's -- which is the other half of
 * how this actually happens at 2am: you tell the person what you owe them, then pay it.
 * `whatsappPaymentLink` builds that message so it is one tap instead of copy, switch
 * app, find the chat, type the number.
 */

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
 * A wa.me link to the person being paid, with the amount already written.
 *
 * `wa.me` wants the number in international form with no plus and no separators, so the
 * local 0 becomes 972. Returns null when the number is not a usable Israeli mobile --
 * the caller then falls back to copying, which is what it did before this existed.
 */
export function whatsappPaymentLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const local = normalizeIsraeliPhone(phone);
  if (!local) return null;
  return `https://wa.me/972${local.slice(1)}?text=${encodeURIComponent(message)}`;
}
