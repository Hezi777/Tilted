import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(), context: vi.fn(), join: vi.fn(), request: vi.fn(), standing: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireViewer: mocks.viewer }));
vi.mock("@/db/roster-queries", () => ({
  getRosterContext: mocks.context, joinGameByCode: mocks.join,
  RosterConflictError: class extends Error {},
}));
vi.mock("@/db/join-request-queries", () => ({ requestToJoin: mocks.request, getJoinStanding: mocks.standing }));

import { POST as createLink } from "@/app/api/game/[id]/join-link/route";
import { POST as join } from "@/app/api/games/[code]/join/route";
import { createInstantJoinToken } from "./instant-join";
import { RosterConflictError } from "@/db/roster-queries";

const gameId = "d7ff2222-1111-4222-8333-444444444444";
const personId = "d7ff2222-1111-4222-8333-555555555555";
const params = { params: Promise.resolve({ id: gameId }) };
function joinRequest(body?: unknown) {
  return new NextRequest("https://tilted-poker.vercel.app/api/games/CPPT/join", {
    method: "POST", ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const joinParams = { params: Promise.resolve({ code: "CPPT" }) };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "test-invite-secret-at-least-32-characters");
  mocks.viewer.mockResolvedValue({ person: { id: personId } });
  mocks.context.mockResolvedValue({
    game: { status: "active" },
    actor: { id: "host-seat", isHost: true, deviceId: personId, settledAt: null, deletedAt: null },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("instant-join routes", () => {
  it("allows the actual active host to issue a grant", async () => {
    const response = await createLink(new Request("https://example.com"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe(createInstantJoinToken(gameId));
    expect(mocks.context).toHaveBeenCalledWith(gameId, personId);
  });

  it.each(["guest", "shared member"])("refuses grants to a %s", async () => {
    mocks.context.mockResolvedValue({ game: { status: "active" }, actor: {
      id: "host-seat", isHost: false, deviceId: personId, settledAt: null, deletedAt: null,
    } });
    expect((await createLink(new Request("https://example.com"), params)).status).toBe(403);
  });

  it("refuses to issue grants once the game is closed", async () => {
    const context = await mocks.context();
    mocks.context.mockResolvedValue({ ...context, game: { status: "closed" } });
    expect((await createLink(new Request("https://example.com"), params)).status).toBe(409);
  });

  it("still requires a signed-in account for instant joining", async () => {
    mocks.viewer.mockResolvedValue(NextResponse.json({ error: "צריך להתחבר" }, { status: 401 }));
    const response = await join(joinRequest({ invite: createInstantJoinToken(gameId) }), joinParams);
    expect(response.status).toBe(401);
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("keeps ordinary links on the approval path", async () => {
    mocks.request.mockResolvedValue({ state: "pending", gameId });
    expect((await join(joinRequest(), joinParams)).status).toBe(202);
    expect(mocks.request).toHaveBeenCalledWith("CPPT", personId);
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("seats the authenticated person using a valid host grant", async () => {
    mocks.join.mockResolvedValue({ gameId, playerId: "seat" });
    const response = await join(joinRequest({ invite: createInstantJoinToken(gameId), personId: "forged" }), joinParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "seated", gameId });
    expect(mocks.join).toHaveBeenCalledWith("CPPT", personId, gameId);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("refuses a forged grant without seating or knocking", async () => {
    expect((await join(joinRequest({ invite: `${gameId}.${"a".repeat(43)}` }), joinParams)).status).toBe(403);
    expect(mocks.join).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("does not turn a stale or wrong-game grant into a join request", async () => {
    mocks.join.mockRejectedValue(new RosterConflictError("המשחק לא נמצא או שכבר נסגר"));
    expect((await join(joinRequest({ invite: createInstantJoinToken(gameId) }), joinParams)).status).toBe(409);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
