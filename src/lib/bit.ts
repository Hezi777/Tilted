/**
 * Phone normalisation for the manual Bit hand-off.
 *
 * Bit does not publish a person-to-person deep-link scheme. The settlement screen
 * therefore copies the recipient's verified mobile number and tells the payer to paste
 * it into Bit, instead of shipping an undocumented URL that silently does nothing.
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
