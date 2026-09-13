/**
 * Sends web push notifications via VAPID, straight to the browser vendors' own push
 * services -- free, and the only mechanism the app is allowed to use (AGENTS.md: no
 * paid API in the runtime path). Node-only (web-push signs with Node's crypto), so
 * this file must never be imported from client code -- `server-only` throws a build
 * error if it is.
 */

import "server-only";

import webpush from "web-push";
import {
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsForPerson,
  type PushSubscriptionRecord,
} from "@/db/push-queries";
import { shouldPruneSubscription } from "@/lib/push-prune";
import type { NotificationPayload } from "@/lib/push-payload";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

async function sendToSubscription(
  subscription: PushSubscriptionRecord,
  payload: NotificationPayload,
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
  } catch (error) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : NaN;
    if (shouldPruneSubscription(statusCode)) {
      await deletePushSubscriptionByEndpoint(subscription.endpoint);
      return;
    }
    // Any other failure (rate limit, push service outage) is logged and swallowed --
    // this must never fail the request that triggered it (e.g. the host seating
    // someone).
    console.error("push send failed", statusCode || error);
  }
}

/** Sends one notification to every device this Person has subscribed from. Never
 * throws: a push failure must not surface to the caller that triggered it. */
export async function sendPushToPerson(
  personId: string,
  payload: NotificationPayload,
): Promise<void> {
  if (!ensureConfigured()) {
    console.error("push not configured: missing VAPID env vars");
    return;
  }
  try {
    const subscriptions = await listPushSubscriptionsForPerson(personId);
    await Promise.all(
      subscriptions.map((subscription) => sendToSubscription(subscription, payload)),
    );
  } catch (error) {
    console.error("push send failed", error);
  }
}
