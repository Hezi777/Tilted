/** Web push subscription storage (docs/v2-plan.md notifications). */

import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface UpsertPushSubscriptionInput {
  personId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/** Stores or refreshes a subscription, keyed by its unique endpoint. A device that
 * resubscribes (key rotation, browser reinstall) lands on the same row instead of
 * piling up duplicates. */
export async function upsertPushSubscription(
  input: UpsertPushSubscriptionInput,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      id: randomUUID(),
      personId: input.personId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        personId: input.personId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
}

/** Removes a subscription by endpoint, scoped to its owning Person so one device
 * cannot unsubscribe another's. */
export async function deletePushSubscription(
  personId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.personId, personId),
      ),
    );
}

export async function listPushSubscriptionsForPerson(
  personId: string,
): Promise<PushSubscriptionRecord[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.personId, personId));
}

/** Removes a subscription the push service rejected as gone (404/410). Not scoped to
 * a Person -- the caller already resolved it from a subscription row it sent to. */
export async function deletePushSubscriptionByEndpoint(
  endpoint: string,
): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
