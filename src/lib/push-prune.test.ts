import { describe, expect, it } from "vitest";
import { shouldPruneSubscription } from "@/lib/push-prune";

describe("shouldPruneSubscription", () => {
  it("prunes on 404 (endpoint no longer exists)", () => {
    expect(shouldPruneSubscription(404)).toBe(true);
  });

  it("prunes on 410 (endpoint gone)", () => {
    expect(shouldPruneSubscription(410)).toBe(true);
  });

  it("does not prune on a rate limit", () => {
    expect(shouldPruneSubscription(429)).toBe(false);
  });

  it("does not prune on a push service outage", () => {
    expect(shouldPruneSubscription(500)).toBe(false);
    expect(shouldPruneSubscription(503)).toBe(false);
  });

  it("does not prune on success or a malformed request", () => {
    expect(shouldPruneSubscription(201)).toBe(false);
    expect(shouldPruneSubscription(400)).toBe(false);
  });

  it("does not prune when the status code is unknown", () => {
    expect(shouldPruneSubscription(NaN)).toBe(false);
  });
});
