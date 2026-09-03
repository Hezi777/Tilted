import { describe, expect, it } from "vitest";
import {
  assertCanDeleteBuyIn,
  assertCanInsertBuyIn,
  assertCanManageRoster,
  assertCanSettle,
  AuthzError,
  requireActor,
  UNDO_WINDOW_MS,
  type ActorPlayer,
  type BuyInRow,
} from "@/lib/authz";

const NOW = new Date("2026-09-03T20:00:00Z");

function actor(over: Partial<ActorPlayer> = {}): ActorPlayer {
  return {
    id: "me",
    isHost: false,
    deviceId: "device-a",
    settledAt: null,
    deletedAt: null,
    ...over,
  };
}

function target(id = "me", over = {}) {
  return { id, settledAt: null, deletedAt: null, ...over };
}

function buyIn(over: Partial<BuyInRow> = {}): BuyInRow {
  return {
    id: "b1",
    playerId: "me",
    createdByDevice: "device-a",
    createdAt: new Date(NOW.getTime() - 5_000),
    deletedAt: null,
    ...over,
  };
}

function codeOf(fn: () => void): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error instanceof AuthzError ? error.code : "wrong-error";
  }
}

describe("requireActor", () => {
  it("rejects a device with no seat in this game", () => {
    expect(codeOf(() => requireActor(null))).toBe("not_in_game");
  });

  it("rejects a seat that was removed", () => {
    expect(codeOf(() => requireActor(actor({ deletedAt: NOW })))).toBe(
      "not_in_game",
    );
  });
});

describe("assertCanInsertBuyIn", () => {
  it("allows your own seat", () => {
    expect(codeOf(() => assertCanInsertBuyIn("active", actor(), target()))).toBe(
      "ok",
    );
  });

  it("refuses somebody else's seat", () => {
    expect(
      codeOf(() => assertCanInsertBuyIn("active", actor(), target("someone"))),
    ).toBe("not_your_seat");
  });

  it("lets the host write for anyone -- the single exception in the app", () => {
    expect(
      codeOf(() =>
        assertCanInsertBuyIn("active", actor({ isHost: true }), target("other")),
      ),
    ).toBe("ok");
  });

  it("refuses once the game has left active, host included", () => {
    for (const status of ["settling", "closed", "cancelled"] as const) {
      expect(
        codeOf(() =>
          assertCanInsertBuyIn(status, actor({ isHost: true }), target()),
        ),
      ).toBe("game_not_active");
    }
  });

  it("refuses a player who already cashed out early", () => {
    expect(
      codeOf(() =>
        assertCanInsertBuyIn("active", actor({ isHost: true }), {
          ...target("other"),
          settledAt: NOW,
        }),
      ),
    ).toBe("player_settled");
  });

  it("refuses a removed player", () => {
    expect(
      codeOf(() =>
        assertCanInsertBuyIn("active", actor({ isHost: true }), {
          ...target("other"),
          deletedAt: NOW,
        }),
      ),
    ).toBe("player_deleted");
  });
});

describe("assertCanDeleteBuyIn", () => {
  it("allows the author inside the 60 second window", () => {
    expect(codeOf(() => assertCanDeleteBuyIn("active", actor(), buyIn(), NOW))).toBe(
      "ok",
    );
  });

  it("refuses the author once the window has closed", () => {
    const old = buyIn({
      createdAt: new Date(NOW.getTime() - UNDO_WINDOW_MS - 1),
    });
    expect(codeOf(() => assertCanDeleteBuyIn("active", actor(), old, NOW))).toBe(
      "undo_window_closed",
    );
  });

  it("still allows the host after the window", () => {
    const old = buyIn({
      createdAt: new Date(NOW.getTime() - UNDO_WINDOW_MS - 60_000),
      createdByDevice: "someone-else",
    });
    expect(
      codeOf(() =>
        assertCanDeleteBuyIn("active", actor({ isHost: true }), old, NOW),
      ),
    ).toBe("ok");
  });

  it("does not let a guest undo a host-entered correction on their own card", () => {
    // The row sits on this guest's seat, but the host wrote it. Checking the seat
    // instead of the author would wrongly allow this.
    const hostWritten = buyIn({ playerId: "me", createdByDevice: "device-host" });
    expect(
      codeOf(() => assertCanDeleteBuyIn("active", actor(), hostWritten, NOW)),
    ).toBe("not_your_seat");
  });

  it("refuses a row that is already soft-deleted", () => {
    expect(
      codeOf(() =>
        assertCanDeleteBuyIn("active", actor(), buyIn({ deletedAt: NOW }), NOW),
      ),
    ).toBe("already_deleted");
  });
});

describe("host-only operations", () => {
  it("settling is host-only and allowed while active or settling", () => {
    expect(codeOf(() => assertCanSettle("settling", actor({ isHost: true })))).toBe(
      "ok",
    );
    expect(codeOf(() => assertCanSettle("settling", actor()))).toBe("not_host");
    expect(codeOf(() => assertCanSettle("closed", actor({ isHost: true })))).toBe(
      "game_not_active",
    );
  });

  it("roster changes are host-only and active-only", () => {
    expect(
      codeOf(() => assertCanManageRoster("active", actor({ isHost: true }))),
    ).toBe("ok");
    expect(codeOf(() => assertCanManageRoster("active", actor()))).toBe("not_host");
  });
});
