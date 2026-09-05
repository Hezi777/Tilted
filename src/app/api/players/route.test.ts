import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { addPlayerToGame, requireViewer } = vi.hoisted(() => ({
  addPlayerToGame: vi.fn(),
  requireViewer: vi.fn(),
}));

vi.mock("@/db/roster-queries", () => ({
  addPlayerToGame,
  RosterConflictError: class RosterConflictError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({ requireViewer }));

import { POST } from "./route";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/players", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": "forged-actor",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireViewer.mockResolvedValue({
      userId: "auth-user",
      person: { id: ACTOR_ID, name: "מארח", nickname: null },
    });
    addPlayerToGame.mockResolvedValue({ id: "player-id" });
  });

  it("adds only an existing account and uses the session actor", async () => {
    const response = await POST(request({ gameId: GAME_ID, personId: PERSON_ID }));

    expect(response.status).toBe(201);
    expect(addPlayerToGame).toHaveBeenCalledWith(GAME_ID, ACTOR_ID, {
      personId: PERSON_ID,
    });
  });

  it("rejects the old accountless name-only path", async () => {
    const response = await POST(
      request({ gameId: GAME_ID, name: "אורח", nickname: "בלי חשבון" }),
    );

    expect(response.status).toBe(400);
    expect(addPlayerToGame).not.toHaveBeenCalled();
  });
});
