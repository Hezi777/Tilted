import { describe, expect, it } from "vitest";
import {
  assertCanCashOutEarly,
  assertCanDeleteBuyIn,
  assertCanEnterResult,
  assertCanHandoffHost,
  assertCanInsertBuyIn,
  assertCanManageRoster,
  assertCanSettle,
  AuthzError,
  requireActor,
  type ActorPlayer,
  type BuyInRow,
  type SuccessorCandidate,
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
    kind: "rebuy",
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

describe("assertCanCashOutEarly", () => {
  it("allows a player to freeze their own result", () => {
    expect(codeOf(() => assertCanCashOutEarly("active", actor(), target()))).toBe("ok");
  });

  it("refuses a guest writing another player's result", () => {
    expect(codeOf(() => assertCanCashOutEarly("active", actor(), target("other"))))
      .toBe("not_your_seat");
  });

  it("allows the host to freeze another player's result", () => {
    expect(codeOf(() => assertCanCashOutEarly("active", actor({ isHost: true }), target("other"))))
      .toBe("ok");
  });
});

describe("assertCanDeleteBuyIn", () => {
  it("allows a player to remove their own rebuy", () => {
    expect(codeOf(() => assertCanDeleteBuyIn("active", actor(), buyIn()))).toBe("ok");
  });

  // The sixty-second window was retired on 2026-09-13: a mis-tap noticed two hands
  // later is still a mis-tap, and a table that agrees on a smaller rebuy mid-evening
  // needs to be able to say so.
  it("still allows it hours later", () => {
    const old = buyIn({ createdAt: new Date(NOW.getTime() - 4 * 60 * 60_000) });
    expect(codeOf(() => assertCanDeleteBuyIn("active", actor(), old))).toBe("ok");
  });

  it("allows the host to remove anyone's rebuy", () => {
    const theirs = buyIn({ playerId: "other", createdByDevice: "someone-else" });
    expect(
      codeOf(() => assertCanDeleteBuyIn("active", actor({ isHost: true }), theirs)),
    ).toBe("ok");
  });

  it("lets a player correct a rebuy the host filed on their card", () => {
    // Ownership is the seat, not the author: the money is theirs either way.
    const hostWritten = buyIn({ playerId: "me", createdByDevice: "device-host" });
    expect(codeOf(() => assertCanDeleteBuyIn("active", actor(), hostWritten))).toBe("ok");
  });

  it("refuses a guest reaching for another player's rebuy", () => {
    expect(
      codeOf(() => assertCanDeleteBuyIn("active", actor(), buyIn({ playerId: "other" }))),
    ).toBe("not_your_seat");
  });

  it("never removes the initial buy-in, not even for the host", () => {
    const initial = buyIn({ kind: "initial" });
    expect(codeOf(() => assertCanDeleteBuyIn("active", actor(), initial))).toBe(
      "initial_buy_in",
    );
    expect(
      codeOf(() => assertCanDeleteBuyIn("active", actor({ isHost: true }), initial)),
    ).toBe("initial_buy_in");
  });

  it("refuses a row that is already soft-deleted", () => {
    expect(
      codeOf(() => assertCanDeleteBuyIn("active", actor(), buyIn({ deletedAt: NOW }))),
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

describe("assertCanEnterResult", () => {
  it("lets the host write anyone's result, settled or not", () => {
    const host = actor({ isHost: true });
    expect(
      codeOf(() => assertCanEnterResult("settling", host, target("other"))),
    ).toBe("ok");
    expect(
      codeOf(() =>
        assertCanEnterResult("settling", host, target("other", { settledAt: NOW })),
      ),
    ).toBe("ok");
  });

  it("lets a player write their own, unsettled result", () => {
    expect(
      codeOf(() => assertCanEnterResult("settling", actor(), target("me"))),
    ).toBe("ok");
  });

  it("never lets a player write someone else's result", () => {
    expect(
      codeOf(() => assertCanEnterResult("settling", actor(), target("other"))),
    ).toBe("not_your_seat");
  });

  it("refuses a player rewriting their own frozen early exit", () => {
    expect(
      codeOf(() =>
        assertCanEnterResult("settling", actor(), target("me", { settledAt: NOW })),
      ),
    ).toBe("player_settled");
  });

  it("refuses once the game is closed, whoever is asking", () => {
    expect(
      codeOf(() =>
        assertCanEnterResult("closed", actor({ isHost: true }), target("me")),
      ),
    ).toBe("game_not_active");
  });
});

describe("assertCanHandoffHost", () => {
  function successor(over: Partial<SuccessorCandidate> = {}): SuccessorCandidate {
    return { id: "other", hasAccount: true, settledAt: null, deletedAt: null, ...over };
  }

  it("lets the host hand off to another live, signed-in seat", () => {
    expect(
      codeOf(() =>
        assertCanHandoffHost("active", actor({ isHost: true }), successor()),
      ),
    ).toBe("ok");
  });

  it("refuses a non-host trying to hand off", () => {
    expect(
      codeOf(() => assertCanHandoffHost("active", actor(), successor())),
    ).toBe("not_host");
  });

  it("refuses handing off to yourself", () => {
    expect(
      codeOf(() =>
        assertCanHandoffHost(
          "active",
          actor({ isHost: true }),
          successor({ id: "me" }),
        ),
      ),
    ).toBe("invalid_successor");
  });

  it("refuses a deleted or already-settled seat", () => {
    const host = actor({ isHost: true });
    expect(
      codeOf(() => assertCanHandoffHost("active", host, successor({ deletedAt: NOW }))),
    ).toBe("invalid_successor");
    expect(
      codeOf(() => assertCanHandoffHost("active", host, successor({ settledAt: NOW }))),
    ).toBe("invalid_successor");
  });

  it("refuses a seat with no account", () => {
    expect(
      codeOf(() =>
        assertCanHandoffHost(
          "active",
          actor({ isHost: true }),
          successor({ hasAccount: false }),
        ),
      ),
    ).toBe("invalid_successor");
  });

  it("refuses once the game is no longer active", () => {
    expect(
      codeOf(() =>
        assertCanHandoffHost("settling", actor({ isHost: true }), successor()),
      ),
    ).toBe("game_not_active");
  });
});
