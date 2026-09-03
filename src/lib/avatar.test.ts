import { describe, expect, it } from "vitest";
import { avatarKeyForPerson } from "@/lib/avatar";

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
