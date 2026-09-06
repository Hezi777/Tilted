/**
 * Who a person looks like at the table.
 *
 * Twelve characters. Six belong to the regulars and are **reserved**: they are claimed
 * automatically when someone signs up under that name, and nobody else may select them.
 * The other six are open to anyone.
 *
 * Reserving by name is deliberately simple, because the alternative is asking six friends
 * to redeem an invite code for a cartoon. The rules that keep it honest are:
 *
 *   - a claim is **first come, first served** -- if the character is already held by another
 *     Person, the next person of that name just gets an open one;
 *   - a claim is **sticky** -- renaming yourself later neither grants nor removes a
 *     character, so nobody loses their face by fixing a typo;
 *   - selection is **checked on the server**, not just hidden in the picker, because the
 *     client can post whatever it likes.
 */

/** The six that belong to specific people. */
export const RESERVED_AVATAR_KEYS = [
  "aner",
  "nir",
  "ido",
  "hen",
  "itay",
  "matan",
] as const;

/** The six anyone may pick. */
export const OPEN_AVATAR_KEYS = [
  "bald",
  "longhair",
  "cap",
  "glasses",
  "silver",
  "cigar",
] as const;

export const AVATAR_KEYS = [
  ...RESERVED_AVATAR_KEYS,
  ...OPEN_AVATAR_KEYS,
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];
export type ReservedAvatarKey = (typeof RESERVED_AVATAR_KEYS)[number];

const AVATAR_KEY_SET: ReadonlySet<string> = new Set(AVATAR_KEYS);

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && AVATAR_KEY_SET.has(value);
}

const RESERVED_SET: ReadonlySet<string> = new Set(RESERVED_AVATAR_KEYS);

export function isReservedAvatarKey(value: string): value is ReservedAvatarKey {
  return RESERVED_SET.has(value);
}

/**
 * The names that claim a reserved character, in both scripts.
 *
 * Hebrew is what they will actually type; the transliterations are here so that someone
 * signing up on an English keyboard still gets their own face.
 */
const CLAIMS: ReadonlyArray<readonly [ReservedAvatarKey, readonly string[]]> = [
  ["aner", ["אנר", "aner"]],
  ["nir", ["ניר", "nir"]],
  ["ido", ["עידו", "ido"]],
  ["hen", ["חן", "hen"]],
  ["itay", ["איתי", "itay", "itai"]],
  ["matan", ["מתן", "matan"]],
];

/**
 * Folds a typed name to something comparable.
 *
 * Strips Hebrew niqqud and geresh, collapses whitespace, drops punctuation, lowercases.
 * Only the first word counts: "חן זריהן" and "חן" are the same person signing up, and a
 * surname must not cost someone their character.
 */
function normalizeName(name: string): string {
  const firstWord = name
    .normalize("NFKD")
    // Combining marks: Hebrew niqqud and Latin accents alike.
    .replace(/[֑-ׇ̀-ͯ]/g, "")
    .replace(/[׳'’`"״]/g, "")
    .trim()
    .split(/\s+/)[0] ?? "";
  return firstWord.toLowerCase();
}

/** The character this name claims, or null if the name claims none. */
export function reservedAvatarForName(name: string): ReservedAvatarKey | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  for (const [key, spellings] of CLAIMS) {
    if (spellings.some((spelling) => normalizeName(spelling) === normalized)) {
      return key;
    }
  }
  return null;
}

/**
 * What a person may choose from.
 *
 * Their own reserved character if they hold one, plus every open character. A reserved
 * character someone else holds never appears, and `saveChipAction` refuses it even if a
 * client posts it anyway.
 */
export function selectableAvatarKeys(currentKey: string | null): AvatarKey[] {
  const own =
    currentKey && isReservedAvatarKey(currentKey) ? [currentKey] : [];
  return [...own, ...OPEN_AVATAR_KEYS];
}

const OPEN_COUNT = OPEN_AVATAR_KEYS.length;

/**
 * A stable default for anyone who never picks.
 *
 * Only ever an open character: handing out a reserved one by hash would give a stranger
 * someone else's face.
 */
export function avatarKeyForPerson(personId: string): AvatarKey {
  let hash = 0;
  for (const character of personId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return OPEN_AVATAR_KEYS[hash % OPEN_COUNT];
}

/** Unique-by-seat default for a single table, so no two chairs wear the same face. */
export function avatarKeyForSeat(seatOrder: number): AvatarKey {
  return OPEN_AVATAR_KEYS[seatOrder % OPEN_COUNT];
}

export function firstAvailableAvatarKey(
  usedKeys: Iterable<string | null>,
): AvatarKey | null {
  const used = new Set(usedKeys);
  return OPEN_AVATAR_KEYS.find((key) => !used.has(key)) ?? null;
}
