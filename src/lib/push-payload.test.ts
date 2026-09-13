import { describe, expect, it } from "vitest";
import { buildInviteNotificationPayload } from "@/lib/push-payload";

describe("buildInviteNotificationPayload", () => {
  it("names the host and the table", () => {
    const payload = buildInviteNotificationPayload({
      hostName: "עידו",
      gameName: "ערב חמישי",
      gameId: "game-1",
    });
    expect(payload.title).toBe("הזמנה לשולחן");
    expect(payload.body).toBe("עידו הזמינו אתכם לערב חמישי");
  });

  it("falls back to a generic table name when the game has none", () => {
    const payload = buildInviteNotificationPayload({
      hostName: "עידו",
      gameName: null,
      gameId: "game-1",
    });
    expect(payload.body).toBe("עידו הזמינו אתכם לשולחן פוקר");
  });

  it("falls back when the game name is blank", () => {
    const payload = buildInviteNotificationPayload({
      hostName: "עידו",
      gameName: "   ",
      gameId: "game-1",
    });
    expect(payload.body).toBe("עידו הזמינו אתכם לשולחן פוקר");
  });

  it("points notificationclick at that game", () => {
    const payload = buildInviteNotificationPayload({
      hostName: "עידו",
      gameName: "ערב חמישי",
      gameId: "abc-123",
    });
    expect(payload.url).toBe("/game/abc-123");
  });

  it("uses the app icon", () => {
    const payload = buildInviteNotificationPayload({
      hostName: "עידו",
      gameName: null,
      gameId: "game-1",
    });
    expect(payload.icon).toBe("/art/icon-192.png");
  });
});
