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

export interface KnockNotificationInput {
  /** Who is standing outside. */
  guestName: string;
  gameId: string;
}

/**
 * Somebody is at the door, sent to the host.
 *
 * The live screen shows knocks in a banner, which works only for a host who is looking
 * at their phone. They are usually dealing. Without this the guest waits on a spinner
 * until the host happens to glance down, which is the exact moment the app is supposed
 * to be saving.
 */
export function buildKnockNotificationPayload(
  input: KnockNotificationInput,
): NotificationPayload {
  return {
    title: "מישהו בדלת",
    body: `${input.guestName} מבקשים להצטרף לשולחן`,
    icon: "/art/icon-192.png",
    url: `/game/${input.gameId}`,
  };
}

export interface SettlingNotificationInput {
  gameName: string | null;
  gameId: string;
}

/**
 * The table has started closing, sent to every seat that has not settled.
 *
 * This is the one moment the app needs something from everybody at once, and it is
 * also the moment phones are in pockets and people are finding their jackets. A seat
 * that never counts out is what leaves the night unclosable.
 */
export function buildSettlingNotificationPayload(
  input: SettlingNotificationInput,
): NotificationPayload {
  const table = input.gameName?.trim() || "השולחן";
  return {
    title: "סופרים את הקופה",
    body: `${table} נסגר — ספרו את הז׳יטונים שלכם`,
    icon: "/art/icon-192.png",
    url: `/game/${input.gameId}/cashout`,
  };
}

export interface ClosedNotificationInput {
  gameName: string | null;
  gameId: string;
}

/** The accounts are final and the transfers are on screen. */
export function buildClosedNotificationPayload(
  input: ClosedNotificationInput,
): NotificationPayload {
  const table = input.gameName?.trim() || "הערב";
  return {
    title: "החשבון נסגר",
    body: `${table} הסתיים — אפשר לראות מי מעביר למי`,
    icon: "/art/icon-192.png",
    url: `/game/${input.gameId}/settlement`,
  };
}
