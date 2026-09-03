import { describe, expect, it } from "vitest";
import {
  AVATAR_KEYS,
  avatarKeyForPerson,
  avatarKeyForSeat,
  firstAvailableAvatarKey,
} from "@/lib/avatar";

describe("avatarKeyForPerson", () => {
  it("is stable for the same persistent person", () => {
    expect(avatarKeyForPerson("1a9c2a35-43c8-4f9d-a88e-friend"))
      .toBe(avatarKeyForPerson("1a9c2a35-43c8-4f9d-a88e-friend"));
  });

  it("always maps into the committed chip set", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(avatarKeyForPerson(`person-${index}`)).toMatch(/^chip-(0[1-9]|1[0-2])$/);
    }
  });
});

describe("table avatar allocation", () => {
  it("assigns every seat a distinct committed character", () => {
    expect(Array.from({ length: 12 }, (_, index) => avatarKeyForSeat(index)))
      .toEqual(AVATAR_KEYS);
  });

  it("returns the first character that is not already seated", () => {
    expect(firstAvailableAvatarKey(["chip-01", "chip-02", null]))
      .toBe("chip-03");
    expect(firstAvailableAvatarKey(AVATAR_KEYS)).toBeNull();
  });
});
