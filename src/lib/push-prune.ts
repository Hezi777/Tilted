/**
 * Whether a push service's error response means the subscription is gone for good.
 *
 * A 404 or 410 is the push service telling us the endpoint no longer exists -- the
 * browser unregistered, the profile was reset, and so on. An expired subscription
 * that is never pruned is a permanent error on every future send, so `src/lib/push.ts`
 * deletes it on exactly these two codes and nothing else (a 429 or 5xx is the push
 * service's own trouble, not a reason to forget the subscription).
 */
export function shouldPruneSubscription(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
