/**
 * The three game read routes must apply the membership check their sibling
 * `/api/game/[id]/transfers` already applies.
 *
 * Executed against a real branch rather than mocked, because the thing under test is
 * whether a seat is found -- a property of the rows, not of the statement text. The
 * session is the only thing stubbed; there is no real auth here.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  hasIntegrationDb,
  seedActiveGame,
  type SeededGame,
} from "@/db/test-support/integration-db";

const { requireViewer } = vi.hoisted(() => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireViewer }));

/** Signs the next request in as this Person, the way a session cookie would. */
function signedInAs(personId: string) {
  requireViewer.mockResolvedValue({
    userId: `user_${personId}`,
    person: { id: personId, name: "בודק", nickname: null },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe.skipIf(!hasIntegrationDb)("game read routes require a seat", () => {
  let routes: {
    live: typeof import("./game/[id]/route");
    settlement: typeof import("./game/[id]/settlement/route");
    history: typeof import("./game/[id]/history/route");
  };
  let game: SeededGame;
  const outsider = randomUUID();

  beforeAll(async () => {
    routes = {
      live: await import("./game/[id]/route"),
      settlement: await import("./game/[id]/settlement/route"),
      history: await import("./game/[id]/history/route"),
    };
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    game = await seedActiveGame(10_000);
    // A finished night, so every one of the three routes has something to serve.
    const cashout = await import("@/db/cashout-queries");
    await cashout.beginSettling(game.gameId, game.host.personId);
    await cashout.saveCashout(game.gameId, game.host.personId, game.host.playerId, { amount: 15_000 }, false);
    await cashout.saveCashout(game.gameId, game.guest.personId, game.guest.playerId, { amount: 5_000 }, false);
    await cashout.closeSettlingGame(game.gameId, game.host.personId);
  });

  const cases = [
    { name: "GET /api/game/[id]", call: () => routes.live.GET({} as never, params(game.gameId)) },
    { name: "GET /api/game/[id]/settlement", call: () => routes.settlement.GET({} as never, params(game.gameId)) },
    { name: "GET /api/game/[id]/history", call: () => routes.history.GET({} as never, params(game.gameId)) },
  ];

  for (const { name, call } of cases) {
    it(`${name} serves a player at the table`, async () => {
      signedInAs(game.guest.personId);
      expect((await call()).status).toBe(200);
    });

    it(`${name} refuses a signed-in stranger holding the game id`, async () => {
      signedInAs(outsider);
      expect((await call()).status).toBe(403);
    });
  }

  /**
   * A seat the host made that its owner has not opened yet has `device_id` NULL, and
   * the invite notification links them straight to `/game/[id]`. Keying the check on
   * `getActorForGame` -- the *write* actor lookup, which needs a claimed seat -- would
   * 403 an invitee out of the screen they were invited to.
   *
   * Only reachable on a live game: a night cannot close while a seat still has no
   * cash-out, so there is no closed-game version of this to test.
   */
  it("GET /api/game/[id] serves someone holding a seat they have not claimed yet", async () => {
    const open = await seedActiveGame(10_000);
    const { db } = await import("@/db");
    const { people, players } = await import("@/db/schema");
    const invitee = randomUUID();

    await db.insert(people).values({ id: invitee, name: "מוזמן", userId: `user_${invitee}` });
    await db.insert(players).values({
      gameId: open.gameId,
      personId: invitee,
      name: "מוזמן",
      seatOrder: 2,
      deviceId: null,
    });

    signedInAs(invitee);
    expect((await routes.live.GET({} as never, params(open.gameId))).status).toBe(200);
  });
});
