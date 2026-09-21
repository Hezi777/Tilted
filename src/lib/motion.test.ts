import { describe, expect, it } from "vitest";
import { bump, motionSafe, rise, stagger } from "@/lib/motion";

/**
 * `motionSafe` is the one gate every animated path in the app is supposed to run
 * through (`docs/design-system.md` §Reduced motion). These assertions exist because
 * nothing else in the suite calls it directly -- every screen only ever imports the
 * result, so a regression here would ship silently until someone with reduced motion
 * on actually opened the app.
 */
describe("motionSafe", () => {
  it("returns the variants unchanged when reduce is false", () => {
    expect(motionSafe(rise, false)).toBe(rise);
    expect(motionSafe(stagger, false)).toBe(stagger);
    expect(motionSafe(bump, false)).toBe(bump);
  });

  it("returns the variants unchanged when reduce is null", () => {
    expect(motionSafe(rise, null)).toBe(rise);
  });

  it("collapses rise to opacity-only, dropping the travel", () => {
    const flattened = motionSafe(rise, true);
    expect(flattened.hidden).toEqual({ opacity: 0, transition: { duration: 0.01 } });
    expect(flattened.show).toEqual({ opacity: 1, transition: { duration: 0.01 } });
    // The 8px rise must not survive into the reduced-motion form.
    expect(flattened.show).not.toHaveProperty("y");
    expect(flattened.hidden).not.toHaveProperty("y");
  });

  it("collapses bump to a no-op opacity hold, dropping the scale pulse", () => {
    const flattened = motionSafe(bump, true);
    expect(flattened.idle).toEqual({ opacity: 1, transition: { duration: 0.01 } });
    expect(flattened.hit).toEqual({ opacity: 1, transition: { duration: 0.01 } });
    expect(flattened.hit).not.toHaveProperty("scale");
  });

  it("collapses a parent stagger variant to an inert entry with no delayChildren", () => {
    const flattened = motionSafe(stagger, true);
    expect(flattened.show).toEqual({ opacity: 1, transition: { duration: 0.01 } });
    expect(flattened.show).not.toHaveProperty("transition.staggerChildren");
  });
});
