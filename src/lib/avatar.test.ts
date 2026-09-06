import { describe, expect, it } from "vitest";
import {
  AVATAR_KEYS,
  OPEN_AVATAR_KEYS,
  RESERVED_AVATAR_KEYS,
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
    const seats = OPEN_AVATAR_KEYS.map((_, seat) => avatarKeyForSeat(seat));
    expect(new Set(seats).size).toBe(OPEN_AVATAR_KEYS.length);
  });

  it("never seats a stranger in a reserved character either", () => {
    for (let seat = 0; seat < 20; seat += 1) {
      expect(isReservedAvatarKey(avatarKeyForSeat(seat))).toBe(false);
    }
  });
});

describe("selectableAvatarKeys", () => {
  it("offers only the open six to someone holding none", () => {
    expect(selectableAvatarKeys(null)).toEqual([...OPEN_AVATAR_KEYS]);
    expect(selectableAvatarKeys("bald")).toEqual([...OPEN_AVATAR_KEYS]);
  });

  it("offers a regular their own character on top of the open six", () => {
    expect(selectableAvatarKeys("ido")).toEqual(["ido", ...OPEN_AVATAR_KEYS]);
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
  it("is twelve distinct keys", () => {
    expect(AVATAR_KEYS).toHaveLength(12);
    expect(new Set(AVATAR_KEYS).size).toBe(12);
  });
});
