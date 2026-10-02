import { afterEach, describe, expect, it, vi } from "vitest";
import { createInstantJoinToken, verifyInstantJoinToken } from "./instant-join";

const gameId = "d7ff2222-1111-4222-8333-444444444444";
const otherGame = "d7ff2222-1111-4222-8333-555555555555";
afterEach(() => vi.unstubAllEnvs());

describe("instant-join invitation", () => {
  it("grants only its signed game, and rejects altered grants", () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "test-invite-secret-at-least-32-characters");
    const token = createInstantJoinToken(gameId);
    expect(verifyInstantJoinToken(token)).toBe(gameId);
    expect(verifyInstantJoinToken(token.replace(gameId, otherGame))).toBeNull();
    expect(verifyInstantJoinToken(`${token.slice(0, -1)}!`)).toBeNull();
    expect(verifyInstantJoinToken(`${token}.extra`)).toBeNull();
    expect(verifyInstantJoinToken("true")).toBeNull();
  });

  it("rejects a link signed with a different secret", () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "test-invite-secret-at-least-32-characters");
    const token = createInstantJoinToken(gameId);
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "another-invite-secret-at-least-32-characters");
    expect(verifyInstantJoinToken(token)).toBeNull();
  });
});
