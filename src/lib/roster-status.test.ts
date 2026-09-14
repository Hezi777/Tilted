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

  // Handing the table to a phone that is not in the room strands the night: the
  // ex-host's seat settles and loses is_host, and nobody left can close or cancel.
  it("excludes a seat nobody has signed in to", () => {
    expect(isEligibleSuccessor({ isYou: false, isSettled: false, isWaiting: true })).toBe(false);
  });

  it("accepts another live seat whose owner has signed in", () => {
    expect(isEligibleSuccessor({ isYou: false, isSettled: false, isWaiting: false })).toBe(true);
  });
});
