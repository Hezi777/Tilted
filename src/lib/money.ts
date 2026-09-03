/**
 * Money is integer agorot everywhere in this app: 100 agorot = 1 shekel.
 *
 * Floats are the classic way to make a settlement not add up, so the only place a
 * fractional shekel is allowed to exist is a user's keypad input, which
 * `shekelsToAgorot` converts once, at the edge. Everything downstream is integers,
 * and formatting happens only at the moment of display.
 */

/** ₪1,000,000. Far beyond any home game, close enough to catch a units mistake. */
export const MAX_AGOROT = 100_000_000;

export const AGOROT_PER_SHEKEL = 100;

declare const AGOROT: unique symbol;

/** An integer number of agorot. The brand stops shekels being passed by mistake. */
export type Agorot = number & { readonly [AGOROT]: true };

export function isAgorot(value: unknown): value is Agorot {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_AGOROT
  );
}

/** Asserts an integer in range and brands it. Throws rather than rounding. */
export function agorot(value: number): Agorot {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Amount must be a finite number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `Amount must be an integer number of agorot, got ${value}`,
    );
  }
  if (Math.abs(value) > MAX_AGOROT) {
    throw new RangeError(`Amount ${value} is outside the supported range`);
  }
  return value as Agorot;
}

/**
 * Converts a shekel amount from user input. Rounds the multiplication to kill the
 * float representation error (19.99 * 100 is 1998.9999...), then rejects anything
 * that was genuinely finer-grained than an agora.
 */
export function shekelsToAgorot(shekels: number): Agorot {
  if (!Number.isFinite(shekels)) {
    throw new RangeError(`Amount must be a finite number, got ${shekels}`);
  }
  const scaled = shekels * AGOROT_PER_SHEKEL;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError(`Amount ${shekels} is finer than one agora`);
  }
  return agorot(rounded);
}

export function sumAgorot(values: readonly Agorot[]): Agorot {
  return agorot(values.reduce<number>((total, value) => total + value, 0));
}

function formatAmount(value: number): string {
  const whole = Math.trunc(value / AGOROT_PER_SHEKEL);
  const remainder = Math.abs(value % AGOROT_PER_SHEKEL);
  const grouped = whole.toLocaleString("en-US");
  return remainder === 0
    ? grouped
    : `${grouped}.${String(remainder).padStart(2, "0")}`;
}

/**
 * `₪50`, `₪45.50`, `₪1,200`, `-₪90`. The sign leads, so the shekel sign stays
 * glued to the digits. No bidi control characters here — the UI gets direction
 * from CSS, and only the plain-text WhatsApp export needs isolates.
 */
export function formatILS(value: Agorot): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}₪${formatAmount(Math.abs(value))}`;
}

/**
 * Signed form for results: `+₪180`, `-₪90`, and a bare `0` for an exact
 * break-even — all three exactly as the spec's section 7 example writes them.
 */
export function formatSignedILS(value: Agorot): string {
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "-";
  return `${sign}₪${formatAmount(Math.abs(value))}`;
}
