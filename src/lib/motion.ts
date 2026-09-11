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

/* Press feedback is not defined here: it lives on the Button primitive as
   `active:scale-[0.97]` in CSS, so no screen re-implements it and it applies to the
   whole element rather than a wrapper. A Framer twin only invited them to drift. */

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

/* There is deliberately no `sheet` variant here. Dialogs and drawers are Radix and
   vaul primitives that already animate off their own `data-state`, and the project
   invariant is to leave that alone rather than run a second, Framer-driven opening
   on top of it. A spring variant sat unused in this file for exactly that reason. */

/**
 * A value that changed in place -- a pot after a rebuy, a net after a cash-out.
 * Currently unused: the counters that would carry it (a seat's own total, a chip
 * count's running sum) still snap. It stays because it is the answer when they stop.
 */
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
 * Whether the signed-in Person wants haptics at all. Module state rather than a hook
 * because `haptic()` is called from event handlers and effects, not from render, and
 * the alternative was threading a preference through every button that commits money.
 * `MotionPreferences` sets it once the viewer is known; the default is the same `true`
 * the column defaults to, so a tap before hydration behaves as the account says.
 */
let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

/**
 * A short haptic, where the platform has one and the Person has asked for one.
 *
 * Reserved for the two moments that commit money -- a rebuy and the settlement
 * crown. Navigation and ordinary controls stay silent, because a phone that
 * buzzes on every tap stops meaning anything. Call this rather than
 * `navigator.vibrate` directly: the preference is only enforced here.
 */
export function haptic(pattern: number | number[] = 12): void {
  if (!hapticsEnabled) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // A browser may refuse without a user gesture. Nothing depends on this.
  }
}
