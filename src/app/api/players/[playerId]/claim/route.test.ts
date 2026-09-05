import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { claimPlayer, requireViewer } = vi.hoisted(() => ({
  claimPlayer: vi.fn(),
  requireViewer: vi.fn(),
}));

vi.mock("@/db/roster-queries", () => ({
  claimPlayer,
  ClaimConflictError: class ClaimConflictError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({ requireViewer }));

import { POST } from "./route";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";

function request(body: unknown, forgedActor = "attacker-controlled") {
  return new NextRequest(`http://localhost/api/players/${PLAYER_ID}/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": forgedActor,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/players/[playerId]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireViewer.mockResolvedValue({
      userId: "auth-user",
      person: { id: PERSON_ID, name: "עידו", nickname: null },
    });
    claimPlayer.mockResolvedValue({ id: PLAYER_ID });
  });

  it("derives the claiming identity from the session, not a forged header", async () => {
    const response = await POST(
      request({ gameId: GAME_ID, avatarKey: "chip-03" }),
      { params: Promise.resolve({ playerId: PLAYER_ID }) },
    );

    expect(response.status).toBe(200);
    expect(claimPlayer).toHaveBeenCalledWith(
      GAME_ID,
      PLAYER_ID,
      PERSON_ID,
      "chip-03",
    );
    expect(claimPlayer).not.toHaveBeenCalledWith(
      GAME_ID,
      PLAYER_ID,
      "attacker-controlled",
      "chip-03",
    );
  });

  it("stops before the claim when there is no authenticated viewer", async () => {
    requireViewer.mockResolvedValue(
      NextResponse.json({ error: "צריך להתחבר כדי להמשיך" }, { status: 401 }),
    );

    const response = await POST(
      request({ gameId: GAME_ID, avatarKey: "chip-03" }),
      { params: Promise.resolve({ playerId: PLAYER_ID }) },
    );

    expect(response.status).toBe(401);
    expect(claimPlayer).not.toHaveBeenCalled();
  });

  it("ignores the retired force-claim field", async () => {
    await POST(
      request({ gameId: GAME_ID, avatarKey: "chip-03", force: true }),
      { params: Promise.resolve({ playerId: PLAYER_ID }) },
    );

    expect(claimPlayer).toHaveBeenCalledTimes(1);
    expect(claimPlayer.mock.calls[0]).toHaveLength(4);
  });
});
