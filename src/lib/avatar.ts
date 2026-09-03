export const AVATAR_KEYS = [
  "chip-01",
  "chip-02",
  "chip-03",
  "chip-04",
  "chip-05",
  "chip-06",
  "chip-07",
  "chip-08",
  "chip-09",
  "chip-10",
  "chip-11",
  "chip-12",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

const AVATAR_COUNT = AVATAR_KEYS.length;

/** Stable across games because the input is the persistent Person id. */
export function avatarKeyForPerson(personId: string): string {
  let hash = 0;
  for (const character of personId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  const number = (hash % AVATAR_COUNT) + 1;
  return AVATAR_KEYS[number - 1];
}

/** Unique-by-seat default for a single table. */
export function avatarKeyForSeat(seatOrder: number): AvatarKey {
  return AVATAR_KEYS[seatOrder % AVATAR_COUNT];
}

export function firstAvailableAvatarKey(
  usedKeys: Iterable<string | null>,
): AvatarKey | null {
  const used = new Set(usedKeys);
  return AVATAR_KEYS.find((key) => !used.has(key)) ?? null;
}
