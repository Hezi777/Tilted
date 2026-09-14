import { describe, expect, it } from "vitest";
import {
  AVATAR_KEYS,
  DEFAULT_AVATAR_KEY,
  RESERVED_AVATAR_KEYS,
  SELECTABLE_AVATAR_KEYS,
  avatarSrc,
  avatarKeyForPerson,
  isCustomAvatarKey,
  toCustomAvatarKey,
  avatarKeyForPlayer,
  avatarKeyForSeat,
  isReservedAvatarKey,
  reservedAvatarForName,
  selectableAvatarKeys,
} from "@/lib/avatar";

describe("reservedAvatarForName", () => {
  it("claims a character from the Hebrew spelling the regulars will actually type", () => {
    expect(reservedAvatarForName("חן")).toBe("hen");
    expect(reservedAvatarForName("עידו")).toBe("ido");
    expect(reservedAvatarForName("ענר")).toBe("aner");
    expect(reservedAvatarForName("ניר")).toBe("nir");
    expect(reservedAvatarForName("מתן")).toBe("matan");
    expect(reservedAvatarForName("איתי")).toBe("itay");
    expect(reservedAvatarForName("רועי")).toBe("roey");
    expect(reservedAvatarForName("סער")).toBe("saar");
    expect(reservedAvatarForName("דור")).toBe("dor");
    expect(reservedAvatarForName("יניב")).toBe("yaniv");
  });

  it("claims from a transliteration too, so an English keyboard still works", () => {
    expect(reservedAvatarForName("Nir")).toBe("nir");
    expect(reservedAvatarForName("MATAN")).toBe("matan");
    expect(reservedAvatarForName("itai")).toBe("itay");
    expect(reservedAvatarForName("ROEY")).toBe("roey");
    expect(reservedAvatarForName("SAAR")).toBe("saar");
    expect(reservedAvatarForName("DOR")).toBe("dor");
    expect(reservedAvatarForName("YANIV")).toBe("yaniv");
  });

  it("ignores a surname, because signing up with one must not cost you your face", () => {
    expect(reservedAvatarForName("חן זריהן")).toBe("hen");
    expect(reservedAvatarForName("  ענר   כהן ")).toBe("aner");
  });

  it("ignores niqqud and a geresh", () => {
    expect(reservedAvatarForName("חֵן")).toBe("hen");
    expect(reservedAvatarForName("ניר'")).toBe("nir");
  });

  it("claims nothing for anyone else", () => {
    expect(reservedAvatarForName("דניאל")).toBeNull();
    expect(reservedAvatarForName("")).toBeNull();
    expect(reservedAvatarForName("   ")).toBeNull();
  });
});

describe("defaults", () => {
  it("never hands a stranger a reserved character", () => {
    // The hash has to land somewhere for every possible Person id; none of those
    // landings may be somebody else's face.
    for (let index = 0; index < 500; index += 1) {
      const key = avatarKeyForPerson(`person-${index}`);
      expect(isReservedAvatarKey(key)).toBe(false);
    }
  });

  it("is stable for one Person id", () => {
    expect(avatarKeyForPerson("abc")).toBe(avatarKeyForPerson("abc"));
  });

  it("gives consecutive seats different faces", () => {
    // A nine-seat table is the largest the app allows, so that is the bar.
    const seats = Array.from({ length: 9 }, (_, seat) => avatarKeyForSeat(seat));
    expect(new Set(seats).size).toBe(9);
  });

  it("never seats a stranger in a reserved character either", () => {
    for (let seat = 0; seat < 20; seat += 1) {
      expect(isReservedAvatarKey(avatarKeyForSeat(seat))).toBe(false);
    }
  });
});

describe("avatarKeyForPlayer", () => {
  it("seats someone as the character their profile shows", () => {
    expect(avatarKeyForPlayer("hen", [])).toBe("hen");
    expect(avatarKeyForPlayer("cap", ["bald"])).toBe("cap");
  });

  it("falls back to an open character when the table already wears theirs", () => {
    const seated = avatarKeyForPlayer("cap", ["cap"]);
    expect(seated).not.toBe("cap");
    expect(isReservedAvatarKey(seated!)).toBe(false);
  });

  it("gives an open character to someone who has never picked one", () => {
    const seated = avatarKeyForPlayer(null, []);
    expect(isReservedAvatarKey(seated!)).toBe(false);
  });
});

describe("selectableAvatarKeys", () => {
  it("offers every open character to someone holding none", () => {
    expect(selectableAvatarKeys(null)).toEqual([...SELECTABLE_AVATAR_KEYS]);
    expect(selectableAvatarKeys("bald")).toEqual([...SELECTABLE_AVATAR_KEYS]);
  });

  it("offers a regular their own character on top of the open ones", () => {
    expect(selectableAvatarKeys("ido")).toEqual([
      "ido",
      ...SELECTABLE_AVATAR_KEYS,
    ]);
  });

  it("never offers a reserved character belonging to someone else", () => {
    const offered = selectableAvatarKeys("ido");
    for (const key of RESERVED_AVATAR_KEYS) {
      if (key === "ido") continue;
      expect(offered).not.toContain(key);
    }
  });
});

describe("the set itself", () => {
  it("has no duplicate keys", () => {
    expect(new Set(AVATAR_KEYS).size).toBe(AVATAR_KEYS.length);
  });

  it("is ten reserved plus everything selectable", () => {
    expect(RESERVED_AVATAR_KEYS).toHaveLength(10);
    expect(AVATAR_KEYS).toHaveLength(
      RESERVED_AVATAR_KEYS.length + SELECTABLE_AVATAR_KEYS.length,
    );
  });

  it("resolves every key to a file that exists", async () => {
    const { access } = await import("node:fs/promises");
    for (const key of AVATAR_KEYS) {
      const path = `public${avatarSrc(key)}`;
      await expect(access(path)).resolves.toBeUndefined();
    }
  });
});

describe("the default character", () => {
  it("is never a reserved one", () => {
    // AVATAR_KEYS[0] is "aner". Anything falling back to it hands one person's face to
    // everybody, which is exactly the bug this guards.
    expect(isReservedAvatarKey(DEFAULT_AVATAR_KEY)).toBe(false);
  });

  it("is a real key with a real file", async () => {
    const { access } = await import("node:fs/promises");
    expect(AVATAR_KEYS).toContain(DEFAULT_AVATAR_KEY);
    await expect(
      access(`public${avatarSrc(DEFAULT_AVATAR_KEY)}`),
    ).resolves.toBeUndefined();
  });
});

describe("admin-added characters", () => {
  it("accepts a well-formed custom key and rejects everything near it", () => {
    expect(isCustomAvatarKey("custom-alon")).toBe(true);
    expect(isCustomAvatarKey("custom-a1-b2")).toBe(true);
    // No prefix, a trailing hyphen, uppercase, a path separator, or an empty slug.
    expect(isCustomAvatarKey("alon")).toBe(false);
    expect(isCustomAvatarKey("custom-")).toBe(false);
    expect(isCustomAvatarKey("custom-alon-")).toBe(false);
    expect(isCustomAvatarKey("custom-Alon")).toBe(false);
    expect(isCustomAvatarKey("custom-../../etc/passwd")).toBe(false);
    expect(isCustomAvatarKey(null)).toBe(false);
  });

  it("never collides with a committed key", () => {
    for (const key of AVATAR_KEYS) {
      expect(isCustomAvatarKey(key)).toBe(false);
    }
  });

  it("serves a custom key from the route and a committed one from a file", () => {
    expect(avatarSrc("custom-alon")).toBe("/api/avatar/custom-alon");
    expect(avatarSrc("hen")).toBe("/art/avatar-hen.webp");
    expect(avatarSrc("legacy-01")).toBe("/art/legacy/chip-01.webp");
  });

  it("folds a typed label into a slug, and refuses one that folds to nothing", () => {
    expect(toCustomAvatarKey("Alon")).toBe("custom-alon");
    expect(toCustomAvatarKey("  big  red  ")).toBe("custom-big-red");
    // A Hebrew-only label leaves no Latin characters, which is why the admin form has
    // a separate slug field rather than deriving one and hoping.
    expect(toCustomAvatarKey("אלון")).toBeNull();
    expect(toCustomAvatarKey("")).toBeNull();
    expect(toCustomAvatarKey("!!!")).toBeNull();
  });

  it("offers open custom characters to everyone, in front of the built-ins", () => {
    const keys = selectableAvatarKeys(null, ["custom-alon"]);
    expect(keys[0]).toBe("custom-alon");
    expect(keys).toEqual(expect.arrayContaining([...SELECTABLE_AVATAR_KEYS]));
  });

  it("keeps a custom character someone already wears in their own picker, once", () => {
    // Reserved ones are hidden from everyone else, but taking it out of the owner's
    // own picker would mean saving any other field silently offered to change it.
    const keys = selectableAvatarKeys("custom-mine", ["custom-open"]);
    expect(keys[0]).toBe("custom-mine");
    expect(keys.filter((key) => key === "custom-mine")).toHaveLength(1);
  });

  it("does not repeat a custom key that is both worn and open", () => {
    const keys = selectableAvatarKeys("custom-alon", ["custom-alon"]);
    expect(keys.filter((key) => key === "custom-alon")).toHaveLength(1);
  });

  it("ignores a malformed key handed to the picker", () => {
    expect(selectableAvatarKeys(null, ["not-custom", "custom-"])).toEqual([
      ...SELECTABLE_AVATAR_KEYS,
    ]);
  });
});
