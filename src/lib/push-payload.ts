/**
 * The web push notification payload for a new invite. Pure and DOM/network-free so the
 * Hebrew copy is unit-testable without a service worker or a real push service.
 */

export interface InviteNotificationInput {
  /** Who did the inviting -- the host's display name. */
  hostName: string;
  /** The table's name, or null when the host never named it. */
  gameName: string | null;
  gameId: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon: string;
  /** Where `notificationclick` should focus or open. */
  url: string;
}

/** Built once here and read the same way by `src/lib/push.ts` (sending) and
 * `public/sw.js` (display) -- the shape the service worker's `push` handler expects. */
export function buildInviteNotificationPayload(
  input: InviteNotificationInput,
): NotificationPayload {
  const table = input.gameName?.trim() || "שולחן פוקר";
  return {
    title: "הזמנה לשולחן",
    body: `${input.hostName} הזמינו אתכם ל${table}`,
    icon: "/art/icon-192.png",
    url: `/game/${input.gameId}`,
  };
}
