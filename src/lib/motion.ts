/**
 * The app's motion vocabulary, in one place.
 *
 * Two rules decide everything here:
 *
 *   1. **Nothing animates in from nothing.** Content is visible by default and
 *      settles into position. An 8px rise reads as weight; a fade from zero reads
 *      as a page that has not finished loading, which on a phone at a poker table
 *      is a lie about latency.
 *   2. **Exponential ease-out.** `cubic-bezier(0.16, 1, 0.3, 1)` covers most of its
 *      distance immediately and then eases, which is what makes a 180ms transition
 *      feel instant rather than slow. It is `--ease-out` in `globals.css`; the two
 *      must not drift apart.
 *
 * Durations are deliberately short. Users here are mid-task -- someone has just
 * bought in and the table is waiting -- so motion confirms a state change and gets
 * out of the way. Nothing in this file exceeds 240ms except the money counter,
 * which is the one place the animation *is* the information.
 */

import type { Transition, Variants } from "framer-motion";

/** Mirrors `--ease-out`. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const DUR = {
  micro: 0.11,
  base: 0.18,
  enter: 0.24,
  count: 0.6,
} as const;

/** The stagger between siblings in a list. Mirrors `--stagger`. */
export const STAGGER = 0.028;

/** A weighted settle, for anything that arrives rather than merely appears. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.9,
};

export const EASE: Transition = { duration: DUR.enter, ease: EASE_OUT };

/**
 * Press feedback. Lives on the Button primitive so no screen re-implements it,
 * and applies to the whole element rather than a wrapper, so a full-width button
 * does not visibly detach from its container as it scales.
 */
export const press = { scale: 0.97 } as const;

/** A card, row, or section arriving. Paired with `stagger` on the parent. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: EASE },
};

/** Put on the parent of several `rise` children. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.02 } },
};

/** A dialog or sheet: from just below, on a spring, because it has mass. */
export const sheet: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
  exit: { opacity: 0, y: 8, scale: 0.99, transition: { duration: DUR.base, ease: EASE_OUT } },
};

/** A value that changed in place -- a pot after a rebuy, a net after a cash-out. */
export const bump: Variants = {
  idle: { scale: 1 },
  hit: { scale: [1, 1.06, 1], transition: { duration: DUR.base * 2, ease: EASE_OUT } },
};

/**
 * The reduced-motion form of any of the above: the same end state, reached with
 * opacity alone and no travel.
 *
 * Pass `useReducedMotion()` into this rather than branching at every call site --
 * the point is that a screen cannot forget, and the fallback stays one definition.
 */
export function motionSafe<T extends Variants>(variants: T, reduce: boolean | null): Variants {
  if (!reduce) return variants;
  const flattened: Variants = {};
  for (const [key, value] of Object.entries(variants)) {
    if (typeof value !== "object" || value === null) continue;
    const { opacity } = value as { opacity?: number };
    flattened[key] = {
      opacity: opacity ?? 1,
      transition: { duration: 0.01 },
    };
  }
  return flattened;
}

/**
 * A short haptic, where the platform has one.
 *
 * Reserved for the two moments that commit money -- a rebuy and the settlement
 * crown. Navigation and ordinary controls stay silent, because a phone that
 * buzzes on every tap stops meaning anything.
 */
export function haptic(pattern: number | number[] = 12): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // A browser may refuse without a user gesture. Nothing depends on this.
  }
}
