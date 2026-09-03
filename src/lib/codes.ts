/**
 * 4-character room codes. Spec section 5.3: spoken aloud across a table, so visually
 * ambiguous characters are excluded — 0/O, 1/I/L.
 *
 * Uniqueness is enforced by the partial unique index on `games.code` (schema.ts), not
 * here — this is a pure generator. Callers retry on a unique-constraint conflict.
 */

const AMBIGUOUS = /[01OIL]/;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  .split("")
  .filter((char) => !AMBIGUOUS.test(char))
  .join("");

export const CODE_LENGTH = 4;

/** A random uppercase 4-character code, e.g. "K7QM". */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
