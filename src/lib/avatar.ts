const AVATAR_COUNT = 12;

/** Stable across games because the input is the persistent Person id. */
export function avatarKeyForPerson(personId: string): string {
  let hash = 0;
  for (const character of personId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  const number = (hash % AVATAR_COUNT) + 1;
  return `chip-${String(number).padStart(2, "0")}`;
}
