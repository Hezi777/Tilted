import { describe, expect, it } from "vitest";
import { isEligibleSuccessor, seatStatus } from "@/lib/roster-status";

describe("seatStatus", () => {
  it("is waiting when the host made the seat and nobody has opened it yet", () => {
    expect(seatStatus({ isWaiting: true, isSettled: false })).toBe("waiting");
  });

  it("is settled once its owner has frozen a result", () => {
    expect(seatStatus({ isWaiting: false, isSettled: true })).toBe("settled");
  });

  it("is active otherwise", () => {
    expect(seatStatus({ isWaiting: false, isSettled: false })).toBe("active");
  });

  it("treats waiting as taking priority over settled", () => {
    // Not a state the app ever produces (a seat nobody has claimed cannot have
    // frozen its own result), but the predicate should still resolve one way.
    expect(seatStatus({ isWaiting: true, isSettled: true })).toBe("waiting");
  });
});

describe("isEligibleSuccessor", () => {
  it("excludes the departing host's own seat", () => {
    expect(isEligibleSuccessor({ isYou: true, isSettled: false, isWaiting: false })).toBe(false);
  });

  it("excludes a seat that already froze its result", () => {
    expect(isEligibleSuccessor({ isYou: false, isSettled: true, isWaiting: false })).toBe(false);
  });

  it("excludes a seat nobody has opened yet", () => {
    expect(isEligibleSuccessor({ isYou: false, isSettled: false, isWaiting: true })).toBe(false);
  });

  it("accepts any other live, claimed, signed-in seat", () => {
    expect(isEligibleSuccessor({ isYou: false, isSettled: false, isWaiting: false })).toBe(true);
  });
});
