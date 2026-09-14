/**
 * Who a person looks like at the table.
 *
 * Sixteen current characters. Ten belong to the regulars and are **reserved**: they are
 * claimed automatically when someone signs up under that name, and nobody else may select
 * them. The other six are open to anyone.
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

/** The ten that belong to specific people. */
export const RESERVED_AVATAR_KEYS = [
  "aner",
  "nir",
  "ido",
  "hen",
  "itay",
  "matan",
  "roey",
  "saar",
  "dor",
  "yaniv",
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

/**
 * The original twelve, kept as extras.
 *
 * They are faces without people attached -- plain coloured chips rather than someone's
 * likeness -- so they are open to anyone and make good defaults. Keeping them costs 116 KB
 * and gives the picker enough range that a nine-seat table never repeats.
 */
export const LEGACY_AVATAR_KEYS = [
  "legacy-01",
  "legacy-02",
  "legacy-03",
  "legacy-04",
  "legacy-05",
  "legacy-06",
  "legacy-07",
  "legacy-08",
  "legacy-09",
  "legacy-10",
  "legacy-11",
  "legacy-12",
] as const;

/**
 * The face to show when nothing else is known.
 *
 * Explicitly an open character. `AVATAR_KEYS[0]` reads like a harmless default and is
 * "aner" -- a reserved character -- so anything falling back to it handed one person's
 * face to everybody.
 */
export const DEFAULT_AVATAR_KEY = "legacy-01" as const;

/** Everything a stranger may choose from. */
export const SELECTABLE_AVATAR_KEYS = [
  ...OPEN_AVATAR_KEYS,
  ...LEGACY_AVATAR_KEYS,
] as const;

export const AVATAR_KEYS = [
  ...RESERVED_AVATAR_KEYS,
  ...OPEN_AVATAR_KEYS,
  ...LEGACY_AVATAR_KEYS,
] as const;

/** A character that ships with the app, as a literal union. */
export type BuiltInAvatarKey = (typeof AVATAR_KEYS)[number];

/**
 * A character the admin added. Open-ended by nature: the set lives in the database, so
 * the type can only describe the shape the key must have.
 */
export type CustomAvatarKey = `custom-${string}`;

/**
 * Any character. The custom arm is what lets `people.avatar_key` stay one text column
 * -- widening it here rather than casting at each call site is what makes the compiler
 * able to tell a built-in key from a custom one at the places that must branch.
 */
export type AvatarKey = BuiltInAvatarKey | CustomAvatarKey;

export type ReservedAvatarKey = (typeof RESERVED_AVATAR_KEYS)[number];

const AVATAR_KEY_SET: ReadonlySet<string> = new Set(AVATAR_KEYS);

/**
 * The prefix every admin-added character carries.
 *
 * It is what keeps `people.avatar_key` a plain text column: the prefix alone tells
 * `avatarSrc` to serve the row from `/api/avatar/[key]` instead of a committed file, so
 * nothing downstream needs a join or an await to render a face.
 */
export const CUSTOM_AVATAR_PREFIX = "custom-";

/** The slug rule for a new character, enforced at the API and in the database CHECK. */
const CUSTOM_KEY_PATTERN = /^custom-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;

/**
 * True for a well-formed custom key.
 *
 * Shape only. Whether the row actually exists is a database question, answered by the
 * server on save; a key that passes here and matches nothing renders as the default.
 */
export function isCustomAvatarKey(value: unknown): value is CustomAvatarKey {
  return typeof value === "string" && CUSTOM_KEY_PATTERN.test(value);
}

/** Folds an admin-typed label into a `custom-` slug. Empty when nothing survives. */
export function toCustomAvatarKey(label: string): string | null {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0591-\u05c7\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  if (!slug) return null;
  const key = `${CUSTOM_AVATAR_PREFIX}${slug}`;
  return CUSTOM_KEY_PATTERN.test(key) ? key : null;
}

export function isAvatarKey(value: unknown): value is AvatarKey {
  return (
    (typeof value === "string" && AVATAR_KEY_SET.has(value)) ||
    isCustomAvatarKey(value)
  );
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
 *
 * The ten Hebrew spellings are the ones these ten people actually write, confirmed by
 * name. Do not add a near-miss spelling "just in case": a claim is first come, first
 * served, so an extra spelling is a way for a stranger who happens to be called that to
 * walk off with someone's face. ענר was carrying אנר -- ayin misspelled as alef -- which
 * is both a real word and the reason he signed up under his own name and got nothing.
 */
const CLAIMS: ReadonlyArray<readonly [ReservedAvatarKey, readonly string[]]> = [
  ["aner", ["ענר", "aner"]],
  ["nir", ["ניר", "nir"]],
  ["ido", ["עידו", "ido"]],
  ["hen", ["חן", "hen"]],
  ["itay", ["איתי", "itay", "itai"]],
  ["matan", ["מתן", "matan"]],
  ["roey", ["רועי", "roey"]],
  ["saar", ["סער", "saar"]],
  ["dor", ["דור", "dor"]],
  ["yaniv", ["יניב", "yaniv"]],
];

/**
 * Folds a typed name to something comparable.
 *
 * Strips Hebrew niqqud and geresh, collapses whitespace, drops punctuation, lowercases.
 * Only the first word counts: "חן זריהן" and "חן" are the same person signing up, and a
 * surname must not cost someone their character.
 */
export function normalizeName(name: string): string {
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
export function selectableAvatarKeys(
  currentKey: string | null,
  /**
   * The open characters the admin has added since the app shipped, keys only. They are
   * passed in rather than imported because they live in the database and this module
   * stays pure and synchronous -- the screen that renders the picker does the reading.
   */
  customOpenKeys: readonly string[] = [],
): AvatarKey[] {
  // Someone holding a custom *reserved* character keeps it in their own picker for the
  // same reason a committed reserved one stays: otherwise saving any other field would
  // silently offer to take their face away.
  const own: AvatarKey[] =
    currentKey && isReservedAvatarKey(currentKey)
      ? [currentKey]
      : currentKey && isCustomAvatarKey(currentKey)
        ? [currentKey]
        : [];
  const custom = customOpenKeys.filter(
    (key): key is CustomAvatarKey =>
      isCustomAvatarKey(key) && key !== currentKey,
  );
  return [...own, ...custom, ...SELECTABLE_AVATAR_KEYS];
}

/**
 * Where a character's picture lives.
 *
 * The originals keep their own filenames under `legacy/` rather than being renumbered:
 * renaming twelve committed files to make one function tidier is churn that breaks every
 * `people.avatar_key` already in the database.
 */
export function avatarSrc(key: string): string {
  // Admin-added characters have no committed file -- their bytes live in the database
  // and are served, immutably cached, by /api/avatar/[key].
  if (key.startsWith(CUSTOM_AVATAR_PREFIX)) {
    return `/api/avatar/${key}`;
  }
  if (key.startsWith("legacy-")) {
    return `/art/legacy/chip-${key.slice("legacy-".length)}.webp`;
  }
  return `/art/avatar-${key}.webp`;
}

const OPEN_COUNT = SELECTABLE_AVATAR_KEYS.length;

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
  return SELECTABLE_AVATAR_KEYS[hash % OPEN_COUNT];
}

/** Unique-by-seat default for a single table, so no two chairs wear the same face. */
export function avatarKeyForSeat(seatOrder: number): AvatarKey {
  return SELECTABLE_AVATAR_KEYS[seatOrder % OPEN_COUNT];
}

/**
 * The character to seat someone in.
 *
 * Their own, the one their profile shows everywhere else in the app, whenever this
 * table has not already given it to somebody. A seat that ignores it puts a stranger's
 * face on a friend at the only screen everybody is looking at. The fallback is an open
 * character, never a reserved one.
 */
export function avatarKeyForPlayer(
  own: string | null,
  usedKeys: Iterable<string | null>,
): AvatarKey | null {
  const used = new Set(usedKeys);
  if (own && isAvatarKey(own) && !used.has(own)) return own;
  return firstAvailableAvatarKey(used);
}

export function firstAvailableAvatarKey(
  usedKeys: Iterable<string | null>,
): AvatarKey | null {
  const used = new Set(usedKeys);
  return SELECTABLE_AVATAR_KEYS.find((key) => !used.has(key)) ?? null;
}
