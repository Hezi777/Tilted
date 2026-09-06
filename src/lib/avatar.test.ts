import { describe, expect, it } from "vitest";
import {
  AVATAR_KEYS,
  DEFAULT_AVATAR_KEY,
  RESERVED_AVATAR_KEYS,
  SELECTABLE_AVATAR_KEYS,
  avatarSrc,
  avatarKeyForPerson,
  avatarKeyForSeat,
  isReservedAvatarKey,
  reservedAvatarForName,
  selectableAvatarKeys,
} from "@/lib/avatar";

describe("reservedAvatarForName", () => {
  it("claims a character from the Hebrew spelling the regulars will actually type", () => {
    expect(reservedAvatarForName("חן")).toBe("hen");
    expect(reservedAvatarForName("עידו")).toBe("ido");
    // Ayin, not alef -- the spelling he actually types.
    expect(reservedAvatarForName("ענר")).toBe("aner");
    expect(reservedAvatarForName("איתי")).toBe("itay");
  });

  it("claims from a transliteration too, so an English keyboard still works", () => {
    expect(reservedAvatarForName("Nir")).toBe("nir");
    expect(reservedAvatarForName("MATAN")).toBe("matan");
    expect(reservedAvatarForName("itai")).toBe("itay");
  });

  it("ignores a surname, because signing up with one must not cost you your face", () => {
    expect(reservedAvatarForName("חן זריהן")).toBe("hen");
    expect(reservedAvatarForName("  אנר   כהן ")).toBe("aner");
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

  it("is six reserved plus everything selectable", () => {
    expect(RESERVED_AVATAR_KEYS).toHaveLength(6);
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
