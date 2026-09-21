import { describe, expect, it } from "vitest";
import { clampRematchSeats } from "@/lib/rematch-prefill";
import { MAX_SEATS } from "@/lib/seat-layout";

describe("clampRematchSeats", () => {
  it("seats everyone when the seed fits under the cap", () => {
    const host = "host";
    const people = [
      { id: "a", name: "א" },
      { id: "b", name: "ב" },
    ];
    const known = new Set([host, "a", "b"]);

    const result = clampRematchSeats(people, host, known);

    expect(result.seatedIds).toEqual(["a", "b"]);
    expect(result.droppedNames).toEqual([]);
  });

  it("clamps a 12-seat legacy game to at most MAX_SEATS - 1 extra seats and names who was dropped", () => {
    const host = "host";
    // 12 non-host people from a legacy night seated under the old 28 cap.
    const people = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `שחקן ${i}`,
    }));
    const known = new Set([host, ...people.map((p) => p.id)]);

    const result = clampRematchSeats(people, host, known);

    // Total seats (host + extras) never exceeds MAX_SEATS.
    expect(result.seatedIds.length + 1).toBeLessThanOrEqual(MAX_SEATS);
    expect(result.seatedIds).toEqual(people.slice(0, MAX_SEATS - 1).map((p) => p.id));
    expect(result.droppedNames).toEqual(people.slice(MAX_SEATS - 1).map((p) => p.name));
  });

  it("drops people who are no longer known before applying the cap", () => {
    const host = "host";
    const people = [
      { id: "a", name: "א" },
      { id: "gone", name: "עזב" },
    ];
    const known = new Set([host, "a"]);

    const result = clampRematchSeats(people, host, known);

    expect(result.seatedIds).toEqual(["a"]);
    expect(result.droppedNames).toEqual([]);
  });

  it("never includes the host", () => {
    const host = "host";
    const people = [{ id: "host", name: "מארח" }, { id: "a", name: "א" }];
    const known = new Set([host, "a"]);

    const result = clampRematchSeats(people, host, known);

    expect(result.seatedIds).toEqual(["a"]);
  });
});
