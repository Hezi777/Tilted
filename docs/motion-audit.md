# Motion audit — Tilted

- **Commit**: `2a76d6b`
- **Date**: 2026-09-12
- **Scope**: all interactive UI (`standard` effort)
- **Measured against**: `docs/design-system.md` (§Motion), `AGENTS.md` invariants, `src/lib/motion.ts`
- **Status**: read-only. Nothing in `src/` was modified.

---

## 1. Recon

**Stack.** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui over
Radix (`radix-ui` 1.6), `framer-motion` 13.2 (imported as `framer-motion`, Motion-era API),
`vaul` 1.1 for drawers, `sonner` 2.0 for toasts, `canvas-confetti` 1.9 for the settlement
celebration, `tw-animate-css` 1.4 for the shadcn `data-open:animate-in` keyframes.

**Where motion is defined.**

| Layer | File | Contents |
| --- | --- | --- |
| CSS tokens | `src/app/globals.css:225-236` | `--dur-micro/base/enter/count/stage`, `--stagger`, `--ease-out`, `--ease-in-out` |
| JS vocabulary | `src/lib/motion.ts` | `EASE_OUT`, `DUR`, `STAGGER`, `SPRING`, `EASE`, `rise`, `stagger`, `sheet`, `bump`, `motionSafe()`, `haptic()` |
| Reduced motion | `src/app/globals.css:280-298` + `src/components/MotionPreferences.tsx` | global `!important` override + `MotionConfig reducedMotion` |
| Keyframes | `src/app/globals.css:477-480` | `accent-sheen` (skeleton only) |

**Conventions the codebase already has right.** The tokens are genuinely shared: every
Tailwind transition in the app is written as `duration-[var(--dur-base)]
ease-[var(--ease-out)]`, and `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) is mirrored in
`EASE_OUT` with a comment forbidding drift. `MotionConfig reducedMotion` is wired at the
root (`src/app/layout.tsx:87`), so **every** Framer transform animation degrades
automatically — `motionSafe()` is belt-and-braces on top of that. Press feedback is defined
once, on the Button primitive (`src/components/ui/button.tsx:8`,
`active:not-aria-[haspopup]:scale-[0.97]`, `--dur-micro`), and no screen re-implements it.
The dropdown uses `origin-(--radix-dropdown-menu-content-transform-origin)` — trigger-anchored,
correct. Tailwind v4's `hover:` variant already carries `@media (hover: hover)`, and the one
hand-written hover rule is gated explicitly (`globals.css:483`). There is no `transition: all`
outside vendored `src/components/ui/**`, no `scale(0)`, no animated layout properties, no
rAF loop, no `ease-in` anywhere in the repo.

**Personality.** Crisp, not playful — a phone held at a table mid-game. The design system
budgets micro 120ms / state 200ms / enter 280ms and reserves delight for one moment per
game (settlement). `src/lib/motion.ts` implements that tighter still (110/180/240ms).

**Frequency map** (drives severity below):

| Surface | Frequency | Current motion |
| --- | --- | --- |
| Tab bar, back link | 100+/day | colour only — **correct** |
| Home entrance (`src/app/page.tsx:62`) | tens/day | staggered `rise` from `opacity: 0` |
| Rebuy → pot counter | tens/evening | 600ms count-up, optimistic |
| Seat tap / focus | tens/evening | spring scale 1.05 |
| Cash-out net figure | tens/evening | `AnimatePresence` crossfade |
| Dialogs, drawers | occasional | CSS keyframes (`zoom-in-95`) |
| Settlement celebration | once per game | 2600ms staged sequence + confetti |

---

## 2. Findings

Ordered by leverage (impact ÷ effort). Every location was re-read at the cited line.

| # | Sev | Category | Location | Finding | Fix summary |
| --- | --- | --- | --- | --- | --- |
| 1 | **HIGH** | Physicality / RTL | `src/app/game/[id]/settlement/SettlementScreen.tsx:352`, `:65` | `start-1/2` (logical inset) paired with `-translate-x-1/2` (physical transform) — the exact mix `AGENTS.md` forbids. Under `dir="rtl"` the winner's crown renders a full icon-width off-centre (32px on screen, 44px in the exported share PNG). ESLint cannot see it: `PHYSICAL_CLASS` in `eslint.config.mjs:8` lists `left`/`right` but not `translate-x`. | Swap to the sanctioned safe pair — `style={{ left: "50%" }}` + `-translate-x-1/2`, exactly as `src/components/ui/dialog.tsx:67` already does. |
| 2 | **HIGH** | Interruptibility | `src/app/game/[id]/settlement/SettlementScreen.tsx:301` | "Any tap completes it immediately" (`design-system.md` §Motion) is not delivered. `finishSequence` flips `staged` to `false`, which only changes `initial` (inert post-mount) and `transition.delay`. Framer restarts an animation when the **target** changes; these targets (`{opacity:1}`, `{opacity:1,y:0}`) never change, so the already-scheduled 2.2s and 2.6s delays keep running and a tap looks like a no-op. | Gate the animation *target* on `staged` (e.g. `animate={staged ? "show" : "done"}`) so the target changes on tap and Framer retargets. |
| 3 | **MED-HIGH** | Performance | `src/components/Money.tsx:46-49` | `AnimatedMoney` drives its text through `useMotionValueEvent` → `setDisplayValue`, i.e. a React re-render per frame. On the settlement screen 2 + *n* instances count at once (pot, winner, one per player) — roughly 36 renders each over `DUR.count` — while `canvas-confetti` is drawing. This is the one place in the app where JS does what the compositor should. | Keep the motion value, drop the React state: write into a `ref`'s `textContent` from the `change` handler. |
| 4 | **MED** | Accessibility | `src/app/globals.css:280-298` | The blanket `animation-duration: 0.01ms !important; animation-iteration-count: 1 !important` freezes `animate-spin` loading indicators (`src/components/ui/arc-pill.tsx:37`, `src/components/ui/sonner.tsx:25`) at an arbitrary angle — a spinner that does not spin reads as a hang, not as calm. It also contradicts the design system's own wording, "reduced motion uses **opacity-only transitions**", by zeroing transitions outright. | Keep the global reset but exempt in-flight indicators, and give them an opacity pulse under reduced motion instead of a frozen arc. |
| 5 | **MED** | Cohesion / tokens | `src/app/game/[id]/settlement/SettlementScreen.tsx:334, 345, 355, 379, 407, 415` | The single most animation-heavy screen is the only one that never imports `src/lib/motion.ts` (it takes `haptic` and nothing else). Six hand-typed values that almost match the vocabulary: a one-off curve `[0.2, 0.8, 0.2, 1]` (:334), a one-off spring `stiffness: 420, damping: 15` (:355) beside `SPRING`'s `520/38/0.9`, durations `0.48`, `0.36`, `0.2`, `0.18` and two bare Framer defaults where `DUR.enter`/`DUR.base` exist. | Route every value through `DUR`, `EASE_OUT`, `SPRING`; keep only the stage delays as literals, named as constants. |
| 6 | **MED** | Cohesion | `src/lib/motion.ts:44, 63-67, 74-77` vs `src/components/ui/dialog.tsx:64` | `sheet` (a spring dialog variant), `EASE`, and `bump` are exported and imported by nothing. Meanwhile `design-system.md` says "Dialogs use a restrained spring" and the dialog actually runs a CSS `zoom-in-95` tween at `--dur-enter`. The documented vocabulary and the shipped behaviour disagree, with dead code sitting exactly where the gap is. | Decide once: either wire `sheet` into a Framer-driven dialog, or delete `sheet`/`EASE` and correct the design-system sentence. `bump` is knowingly parked (see #Missed 3) — keep it. |
| 7 | **MED** | Cohesion | `src/app/game/[id]/cashout/CashoutScreen.tsx:436` | `AnimatePresence` with the default `mode="sync"` keyed on `Math.sign(net)`. Crossing zero while counting chips puts the outgoing and incoming figures in flow simultaneously, so the row widens and the balance jumps sideways at the moment the host is reading it. The sibling container at :477 carries a comment saying the digits must *never* move. | `<AnimatePresence mode="popLayout" initial={false}>`. |
| 8 | **LOW** | Purpose / frequency | `src/app/page.tsx:62-64` | Home mounts with an unconditional `initial="hidden"`, so the two primary actions fade up from `opacity: 0` on every visit to the app's most-visited screen. `src/lib/motion.ts:6-9` states the opposite rule in its own header — "Nothing animates in from nothing… a fade from zero reads as a page that has not finished loading". `PokerTable.tsx:126` already models the alternative (`initial={reduceMotion ? false : "hidden"}`, and the table genuinely is an arrival). | Either start `rise` at `opacity: 1, y: 8` (settle, don't appear), or drop the entrance on the action block and keep it on the history list. |
| 9 | **LOW** | Physicality | `src/app/game/[id]/settlement/SettlementScreen.tsx:415` | `scaleX: 0 → 1` is applied to a flex row that contains both the hairline rule **and** `ArrowLeftIcon`, so the arrowhead is horizontally squashed for 180ms. `origin-right` is physical and lint-invisible (same blind spot as #1); it happens to be *correct* here because the app is RTL-only and the rail should grow from the payer, but nothing records that. | Scale only the `<span className="h-px flex-1">` rule; fade the icon in on opacity. Leave a one-line comment explaining why the origin is physical. |

### Not reported (checked and judged correct)

- `transform-origin: center` on `DialogContent` — modals are exempt (AUDIT §3).
- `src/components/shell/TabBar.tsx:56` — a 100+/day navigation control with colour-only
  transition and no indicator motion. This is the right answer, not an omission.
- `src/components/ui/dialog.tsx:67` `style={{ left: "50%" }}` — the deliberate workaround for
  ESLint's `left-` ban; it is the exemplar finding #1 should copy.
- `disableForReducedMotion: true` on the confetti options (`SettlementScreen.tsx:236`).
- `transition: all` / `transition-all` in `src/components/ui/{switch,badge,toggle}.tsx` —
  vendored shadcn, and `AGENTS.md` says "style them, do not police them".
- The 600ms pot count-up. `design-system.md` fixes it at 600ms; that is a settled decision.

---

## 3. Missed opportunities

1. **Seats teleport when a player joins.** `src/components/PokerTable.tsx:114-121` derives
   every seat's angle from `slots = players.length`. The sixth player sitting down snaps all
   five existing seats to new coordinates in one frame — the most jarring state change in the
   app, on its main screen. A 240ms `--ease-out` move would explain it. *Caveat: the positions
   are `left`/`top` percentages, so this cannot use Framer's `layout` prop without fighting the
   `translate(-50%, -50%)` centring — and animating `left`/`top` costs layout. Worth prototyping
   before committing; measure on a real phone with nine seats.*
2. **`LiveFeed` rows appear from nothing.** `src/components/LiveFeed.tsx:23` re-renders a
   plain `<li>` list on every rebuy; the newest row pops in and shoves the rest down. This is
   the app's most-repeated event. A 180ms `rise` inside `AnimatePresence` — not a stagger, the
   list is already on screen — would make a rebuy legible from across the table.
3. **A seat's own total still snaps when the pot counts.** `PokerTable.tsx:208` renders a
   plain `<Money>` while the pot beside it counts for 600ms. `src/lib/motion.ts:69-77` already
   defines `bump` for exactly this and says so in its own comment. The deferral is documented,
   so this is a parked opportunity, not a defect — but it is the cheapest delight left.
4. **The open-table card drops in mid-fetch.** `src/app/page.tsx:77` renders `activeGame` once
   `/api/games` resolves, pushing "ערבים קודמים" down with no transition. A height/opacity
   reveal (or reserving the slot in the skeleton) removes a layout jump on the first screen of
   every session.

---

## 4. Implementation plans

Each plan is self-contained. An executor with no other context should be able to run it.

---

### 001 — Fix the off-centre winner crown (logical inset + physical transform)

- **Status**: TODO · **Commit**: `2a76d6b` · **Severity**: HIGH · **Category**: Physicality / RTL
- **Scope**: 1 file, 2 lines

#### Problem

`AGENTS.md` states: *"Never mix a logical inset with a physical transform. `insetInlineStart`
flips under `dir="rtl"` and `translate-x` does not, so together they mirror an element away
from where the maths put it."* Two crowns do exactly this.

```tsx
// src/app/game/[id]/settlement/SettlementScreen.tsx:65 — current (inside ShareCard, the exported PNG)
<CrownIcon className="absolute -top-6 start-1/2 size-11 -translate-x-1/2 fill-brand-500 text-brand-300" />
```

```tsx
// src/app/game/[id]/settlement/SettlementScreen.tsx:351-356 — current (on-screen winner card)
<motion.div
  className="absolute -top-5 start-1/2 -translate-x-1/2"
  initial={staged ? { opacity: 0, y: -28, rotate: -18 } : false}
  animate={{ opacity: 1, y: 0, rotate: 0 }}
  transition={{ delay: staged ? 1.4 : 0, type: "spring", stiffness: 420, damping: 15 }}
>
```

The document root is `dir="rtl"` (`src/app/layout.tsx:79`). `start-1/2` therefore compiles to
`inset-inline-start: 50%` → `right: 50%`, which places the icon's **right** edge at the
container's centre. `-translate-x-1/2` then shifts it a further half-width to the **left**
(physical, unflipped). Net error: one full icon width. On screen that is 32px (`size-8`) over a
`size-20` avatar; in the exported share image it is 44px (`size-11`) over a `size-24` avatar.

ESLint does not catch it: `eslint.config.mjs:8` lists `ml|mr|pl|pr|left|right|border-l|border-r|
rounded-l|rounded-r|text-left|text-right` — `translate-x` is absent, and the logical property is
normally the *correct* one, which is why the rule cannot be extended naively.

#### Target

The repo's sanctioned safe pair: a physical `left` inset with the physical transform. Because
`left-1/2` as a className is banned by the ESLint rule above, `left` goes in the `style` prop —
which is precisely how the dialog primitive already solves this.

```tsx
/* target — line 65 */
<CrownIcon
  style={{ left: "50%" }}
  className="absolute -top-6 size-11 -translate-x-1/2 fill-brand-500 text-brand-300"
/>
```

```tsx
/* target — line 352 */
<motion.div
  style={{ left: "50%" }}
  className="absolute -top-5 -translate-x-1/2"
  initial={staged ? { opacity: 0, y: -28, rotate: -18 } : false}
  animate={{ opacity: 1, y: 0, rotate: 0 }}
  transition={{ delay: staged ? 1.4 : 0, type: "spring", stiffness: 420, damping: 15 }}
>
```

Note on line 352: Framer merges the `style` prop with the transform it manages. `-translate-x-1/2`
is a Tailwind class (CSS `translate` property), not a Framer value, so `y`/`rotate` in `animate`
and the class-based X offset compose without conflict — the same arrangement the file already
relies on for `initial.y`.

#### Repo conventions to follow

- Exemplar, verbatim: `src/components/ui/dialog.tsx:64-67` — `"fixed top-1/2 … -translate-x-1/2
  -translate-y-1/2 …"` with `style={{ left: "50%" }}` on the same element.
- Do not add `left-1/2` to any `className`; `eslint.config.mjs:15-27` fails the build on it, and
  `src/components/ui/**` (the only exempt directory) is not where this file lives.

#### Steps

1. `src/app/game/[id]/settlement/SettlementScreen.tsx:65` — delete `start-1/2` from the
   className and add `style={{ left: "50%" }}` to the `<CrownIcon>`. Keep `-translate-x-1/2`.
2. Same file, line 352 — delete `start-1/2` from the `<motion.div>` className and add
   `style={{ left: "50%" }}`. Keep `-translate-x-1/2`.

#### Boundaries

- Touch only these two elements. Do not alter the spring, the delays, or any other class.
- Do not "fix" `start-`/`end-` anywhere else in the file — the rest are inset-only and correct.
- Do not modify `eslint.config.mjs`.

#### Verification

- **Mechanical**: `pnpm verify` (typecheck → lint → test → build) passes. Lint must not report
  the `no-restricted-syntax` RTL error; if it does, the fix used a className instead of `style`.
- **Feel check**: open a settled game's `/game/<id>/settlement`.
  - The crown sits symmetrically above the winner's avatar, centre over centre.
  - Tap "שתפו את הסיכום" and inspect the produced PNG: the crown is centred there too.
  - In DevTools, force `dir="ltr"` on `<html>`: the crown must stay centred in both directions
    — that is the property the safe pair buys.
- **Done when**: both crowns are visually centred in RTL and in LTR, and `pnpm verify` is green.

---

### 002 — Make a tap actually skip the settlement sequence

- **Status**: TODO · **Commit**: `2a76d6b` · **Severity**: HIGH · **Category**: Interruptibility
- **Scope**: 1 file, ~6 call sites

#### Problem

`docs/design-system.md` §Motion: *"Settlement stages once per game per device. **Any tap
completes it immediately.**"* The handler exists:

```tsx
// src/app/game/[id]/settlement/SettlementScreen.tsx:301 — current
<main className="flex flex-1 flex-col" onPointerDown={stage === "playing" ? finishSequence : undefined}>
```

`finishSequence` (`:209-212`) sets `stage = "complete"`, so `staged` (`:255`) becomes `false`.
But `staged` is only consumed in two places per element — `initial` and `transition.delay`:

```tsx
// src/app/game/[id]/settlement/SettlementScreen.tsx:403-407 — current
<motion.div
  initial={staged ? { opacity: 0 } : false}
  animate={{ opacity: 1 }}
  transition={{ delay: staged ? 2.2 + index * 0.08 : 0 }}
```

`initial` is inert after mount. Framer restarts an animation when the **animate target**
changes; `{ opacity: 1 }` is identical before and after the tap, so the already-scheduled
animation — delay included — keeps running to completion. The transfer rows at 2.2s and the
sticky action bar at 2.6s (`:456`) still appear on the original schedule. To the user, tapping
during the celebration does nothing.

(The money figures *do* skip correctly, because `AnimatedMoney` receives a changed `from` prop
at `:338`, `:363`, `:384`, which re-runs its effect and calls `motionValue.set(value)`. That
half already works and must keep working.)

#### Target

Make `staged` change the animate **target**, not just the transition. Drive each staged element
from a variant pair selected by a single `animate` string that flips on tap.

```tsx
/* target — pattern to apply to each staged motion element */
const STAGE_DELAYS = {
  chips: 0.2,
  pot: 0.7,
  winner: 1.2,
  crown: 1.4,
  winnerNet: 1.55,
  players: 1.6,
  transfers: 2.2,
  actions: 2.6,
} as const;

// …per element:
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { delay: STAGE_DELAYS.transfers + index * 0.08, duration: DUR.base, ease: EASE_OUT } },
    done: { opacity: 1, transition: { duration: 0 } },
  }}
  initial={staged ? "hidden" : false}
  animate={staged ? "show" : "done"}
>
```

Because `"show"` → `"done"` is a genuine target change, Framer cancels the pending delay and
snaps the element to its end state on the same frame as the tap.

#### Repo conventions to follow

- Import the vocabulary this file currently ignores:
  `import { DUR, EASE_OUT, SPRING, haptic } from "@/lib/motion";` (it already imports `haptic`
  from there at `:30`).
- Exemplar for variant-driven staging with a `custom`/state-selected target:
  `src/components/PokerTable.tsx:21-39`.
- `DUR.base = 0.18`, `DUR.enter = 0.24`, `EASE_OUT = [0.16, 1, 0.3, 1]`, `SPRING =
  { type: "spring", stiffness: 520, damping: 38, mass: 0.9 }` — take these from
  `src/lib/motion.ts:24-42`, never retype the numbers.

#### Steps

1. Add the `STAGE_DELAYS` constant near the top of `SettlementScreen.tsx`, replacing the eight
   magic delay literals currently inlined at `:334`, `:338`, `:345`, `:355`, `:363`, `:379`,
   `:384`, `:407`, `:456`.
2. Extend the import at `:30` to `import { DUR, EASE_OUT, SPRING, haptic } from "@/lib/motion";`.
3. Convert each staged element (`:322` section, `:329` chips, `:342` winner card, `:351` crown,
   `:375` player rows, `:403` transfer rows, `:415` arrow rail, `:456` action bar) from
   `initial`/`animate`/`transition` objects to the `variants` + `animate={staged ? "show" : "done"}`
   pattern above. Each element keeps its own delay from `STAGE_DELAYS` and its own end state.
4. Leave every `AnimatedMoney` call exactly as it is — its `from={staged ? 0 : …}` /
   `delay={staged ? … : 0}` props already skip correctly.
5. Leave `finishSequence`, the `localStorage` guard, the confetti effect and the
   `onPointerDown` handler untouched.

#### Boundaries

- Do NOT change the timings of the sequence when it is *not* skipped — the staged experience
  must look identical to today apart from the values now coming from `DUR`/`SPRING`.
- Do NOT touch `ShareCard` (lines 30-107) — it is a static export target with no motion.
- Do NOT add dependencies, and do NOT introduce `AnimatePresence`.
- If the file has drifted from the line numbers above, STOP and report rather than guess.

#### Verification

- **Mechanical**: `pnpm verify` passes.
- **Feel check**: clear the flag first —
  `localStorage.removeItem('tilted:settlement:<gameId>:seen')` — then reload
  `/game/<id>/settlement`.
  - Let it run untouched: chips deal in, the pot counts, the crown springs, rows and the action
    bar arrive. Timing should be indistinguishable from before this change.
  - Reload, clear the flag again, and tap the screen at ~0.5s. **Everything** must be in its
    final state on the next frame — transfer rows and the sticky action bar included. Today
    they still arrive at 2.2s and 2.6s; that is the regression this plan removes.
  - Tap at ~2.0s: same result, no flicker, no element re-fading.
  - Reload once more without clearing the flag: `stage` starts at `complete`, nothing animates.
  - DevTools → Rendering → "Emulate prefers-reduced-motion: reduce", clear the flag, reload:
    `stage` goes straight to `complete` (`:206`), no confetti, final money values.
- **Done when**: a tap at any point during the sequence leaves no pending animation.

---

### 003 — Stop `AnimatedMoney` re-rendering React once per frame

- **Status**: TODO · **Commit**: `2a76d6b` · **Severity**: MEDIUM-HIGH · **Category**: Performance
- **Scope**: 1 file, ~15 lines

#### Problem

```tsx
// src/components/Money.tsx:42-68 — current
const reduceMotion = useReducedMotion();
const motionValue = useMotionValue(from ?? value);
const [displayValue, setDisplayValue] = useState(from ?? value);

useMotionValueEvent(motionValue, "change", (latest) => {
  // This interpolation is display-only; persisted money remains integer agorot.
  setDisplayValue(Math.round(latest));
});
// …
return (
  <span dir="ltr" className={cn("money inline-block", className)} {...props}>
    {moneyText(displayValue, signed)}
  </span>
);
```

Every animation frame calls `setState`, so React re-renders the component ~36 times over
`DUR.count` (600ms). On `/game/[id]/settlement` there are `2 + players.length` instances
counting concurrently (`:338` pot, `:363` winner net, `:384` one per player) while
`canvas-confetti` is compositing two cannons — a six-player game is roughly 290 React renders
inside the celebration window. `AUDIT` §5: JS should not do what the compositor can, and a
motion value's whole purpose is to update the DOM outside React's render cycle.

#### Target

Keep the motion value and the rounding; write the formatted string straight to the DOM node.

```tsx
/* target — src/components/Money.tsx, AnimatedMoney body */
const reduceMotion = useReducedMotion();
const motionValue = useMotionValue(from ?? value);
const ref = useRef<HTMLSpanElement>(null);

useMotionValueEvent(motionValue, "change", (latest) => {
  // Display-only interpolation; persisted money remains integer agorot.
  const node = ref.current;
  if (node) node.textContent = moneyText(Math.round(latest), signed);
});

useEffect(() => {
  if (reduceMotion || from === value) {
    motionValue.set(value);
    return;
  }
  const controls = animate(motionValue, value, { duration: DUR.count, delay, ease: EASE_OUT });
  return () => controls.stop();
}, [delay, from, motionValue, reduceMotion, value]);

return (
  <span ref={ref} dir="ltr" className={cn("money inline-block", className)} {...props}>
    {moneyText(from ?? value, signed)}
  </span>
);
```

The initial children keep the server-rendered and hydration-time text correct (`from ?? value`
is exactly what the current `useState` initialiser uses); the `change` handler takes over from
the first frame. `motionValue.set(value)` in the reduced-motion / no-op branch still fires a
`change` event, so the final value lands without a render.

#### Repo conventions to follow

- `moneyText()` already exists in this file at `:9-11` — reuse it, do not inline formatting.
- **Do not touch money arithmetic.** `AGENTS.md`: money is integer agorot and all maths lives in
  `src/lib/money.ts`. The only numeric operation permitted here is the existing `Math.round`
  on the display interpolation.
- The plain `Money` component (`:13-27`) is unaffected and must not change — it is the
  component every non-animated amount in the app renders through.

#### Steps

1. In `src/components/Money.tsx`, replace the `useState` import usage with `useRef` (keep
   `useEffect`).
2. Replace the `displayValue` state with `const ref = useRef<HTMLSpanElement>(null);`.
3. Rewrite the `useMotionValueEvent` body to set `ref.current.textContent`.
4. Attach `ref` to the returned `<span>` and render `{moneyText(from ?? value, signed)}` as its
   initial children.
5. Leave the `useEffect` at `:51-62` byte-identical.

#### Boundaries

- Do NOT change `Money`, `moneyText`, any call site, or `src/lib/money.ts`.
- Do NOT change `DUR.count`, the easing, or the `delay` prop contract — `SettlementScreen`
  depends on all three.
- Do NOT add `useLayoutEffect` or a second effect.

#### Verification

- **Mechanical**: `pnpm verify` passes. `pnpm test` must stay green — `src/lib/money.test.ts`
  and `src/lib/settlement.test.ts` are the test-locked files and must be untouched.
- **Feel check**:
  - `/game/<id>` with an open table: tap "הוספת ריביי". The pot still counts up over 600ms and
    lands on the exact new total, with tabular figures that do not reflow.
  - `/game/<id>/settlement` with the `seen` flag cleared: every figure counts, and the numbers
    agree with the static `Money` values shown after the sequence completes.
  - DevTools → Performance, record the settlement celebration. Compare against a recording from
    before the change: the React commit bars during the 600ms count windows should collapse to
    roughly one per instance. That drop is the whole point of the plan.
  - React DevTools → Profiler → "Highlight updates when components render": the money spans must
    stop flashing during the count.
  - Emulate `prefers-reduced-motion: reduce`: figures render at their final value immediately.
- **Done when**: the displayed values are identical to today and the per-frame React commits are
  gone from the profile.

---

### 004 — Let loading indicators keep spinning under reduced motion

- **Status**: TODO · **Commit**: `2a76d6b` · **Severity**: MEDIUM · **Category**: Accessibility
- **Scope**: 2 files, ~10 lines

#### Problem

```css
/* src/app/globals.css:280-298 — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

[data-reduce-motion="true"] *,
[data-reduce-motion="true"] *::before,
[data-reduce-motion="true"] *::after { /* …the same four declarations… */ }
```

`AUDIT` §6: *reduced motion means fewer and gentler animations, not zero.* Two in-flight
indicators are currently frozen mid-rotation by the `animation-iteration-count: 1` clause:

```tsx
// src/components/ui/arc-pill.tsx:35-38 — current
className={cn(
  "pointer-events-none absolute inset-0 size-full overflow-visible rounded-full",
  !determinate && "animate-spin [animation-duration:1.1s]",
)}
```

```tsx
// src/components/ui/sonner.tsx:25 — current
loading: (<Loader2Icon className="size-4 animate-spin" />),
```

A 28%-of-circumference arc stopped at a random angle is not a calmer spinner; it is a spinner
that has hung. `ArcPill` exists specifically to make the debounced cash-out autosave visible
(see its doc comment at `:4-12`), so the affordance it provides is the one the override
destroys. The `Skeleton` shimmer at `src/components/ui/skeleton.tsx:8` shows the correct
pattern already — `motion-reduce:after:hidden` removes the element rather than freezing it.

Secondary: the design system says reduced motion *"uses opacity-only transitions"*, but the
block zeroes `transition-duration` outright. The Framer half already honours the softer
reading (`MotionConfig reducedMotion` at `src/components/MotionPreferences.tsx:30`, plus
`motionSafe()` at `src/lib/motion.ts:86-98`, which preserves opacity and drops travel). Only
the CSS half is absolute.

#### Target

Exempt indeterminate progress indicators from the freeze, and give them a non-rotating pulse.

```css
/* target — add after the two reduced-motion blocks in src/app/globals.css */
@media (prefers-reduced-motion: reduce) {
  [data-spin-safe] {
    animation: none !important;
  }
}

[data-reduce-motion="true"] [data-spin-safe] {
  animation: none !important;
}

@keyframes indicator-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  [data-spin-safe] { animation: indicator-pulse 1.6s var(--ease-in-out) infinite !important; }
}

[data-reduce-motion="true"] [data-spin-safe] {
  animation: indicator-pulse 1.6s var(--ease-in-out) infinite !important;
}
```

An opacity pulse carries "still working" with no rotation and no position change — precisely
what `AUDIT` §6 asks for. `--ease-in-out` is `cubic-bezier(0.65, 0, 0.35, 1)` from
`globals.css:235`; do not retype the numbers.

#### Repo conventions to follow

- Keyframes live in the `@layer components` block of `src/app/globals.css` alongside
  `accent-sheen` (`:477-480`). Put `indicator-pulse` there.
- The reduced-motion overrides live in `@layer base` (`:280-298`). The two forms — the media
  query and the `[data-reduce-motion="true"]` attribute — must always be kept in lockstep; see
  the comment at `:289-290`.
- Exemplar of the right instinct already in the repo: `src/components/ui/skeleton.tsx:8`.

#### Steps

1. `src/app/globals.css` — add the `indicator-pulse` keyframes inside `@layer components`, next
   to `accent-sheen`.
2. `src/app/globals.css` — inside `@layer base`, after the existing two reduced-motion blocks,
   add the `[data-spin-safe]` overrides for both the media query and the attribute selector.
3. `src/components/ui/arc-pill.tsx:31` — add `data-spin-safe` to the `<svg>` element (it already
   carries the `animate-spin` class conditionally; the attribute can be unconditional).
4. `src/components/ui/sonner.tsx:25` — add `data-spin-safe` to `<Loader2Icon>`.

#### Boundaries

- Do NOT weaken or delete the existing global reduced-motion blocks — they are doing the right
  job for everything that is not an in-flight indicator.
- Do NOT add `data-spin-safe` to anything that is not an indeterminate progress indicator.
  Decorative motion stays frozen.
- Do NOT touch `MotionPreferences.tsx` or `src/lib/motion.ts`.

#### Verification

- **Mechanical**: `pnpm verify` passes.
- **Feel check**: DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion:
  reduce".
  - `/game/<id>/cashout` with a chip set configured: change a chip count and watch the
    `ArcPill` during the debounce/save window. It must pulse in opacity, never rotate, and never
    sit frozen at an angle.
  - Trigger a `toast.loading` (e.g. an action that takes a moment): the sonner spinner pulses
    rather than freezing.
  - Turn the emulation off: both indicators rotate exactly as before.
  - Repeat both with the account-level setting instead — set `reduceMotion` on the profile
    screen so `<html data-reduce-motion="true">` (`src/app/layout.tsx:81`), with OS emulation
    **off**. Behaviour must be identical; that is what keeping the two blocks in lockstep buys.
  - Confirm the `Skeleton` shimmer is still hidden and the confetti is still suppressed.
- **Done when**: no indicator is ever frozen mid-rotation, and nothing else gained motion.

---

### 005 — Put the settlement screen back on the shared motion vocabulary

- **Status**: TODO · **Commit**: `2a76d6b` · **Severity**: MEDIUM · **Category**: Cohesion / tokens
- **Scope**: 1 file, ~8 lines · **Depends on**: 002 (do 002 first; it rewrites the same lines)

#### Problem

`src/app/game/[id]/settlement/SettlementScreen.tsx` imports only `haptic` from
`src/lib/motion.ts` (`:30`). Every timing and curve on the app's most animated screen is typed
by hand, and each one nearly-but-not-quite matches the vocabulary:

```tsx
// :334  — a one-off curve; EASE_OUT is [0.16, 1, 0.3, 1]
transition={{ delay: staged ? 0.2 + index * 0.035 : 0, duration: staged ? 0.48 : 0.1, ease: [0.2, 0.8, 0.2, 1] }}

// :345  — 0.36 is not a DUR value
transition={{ delay: staged ? 1.2 : 0, duration: staged ? 0.36 : 0.1, type: staged ? "spring" : "tween", bounce: 0.22 }}

// :355  — a second spring; SPRING is stiffness 520 / damping 38 / mass 0.9
transition={{ delay: staged ? 1.4 : 0, type: "spring", stiffness: 420, damping: 15 }}

// :379  — 0.2 ≈ DUR.base (0.18)
transition={{ delay: staged ? 1.6 + index * 0.06 : 0, duration: 0.2 }}

// :407  — no duration at all: Framer's 0.3 default, longer than DUR.enter
transition={{ delay: staged ? 2.2 + index * 0.08 : 0 }}

// :415  — 0.18 is DUR.base, spelled as a number
transition={{ delay: staged ? 2.2 + index * 0.08 : 0, duration: 0.18 }}
```

`AUDIT` §7: five hand-typed near-matches are a consolidation finding. `src/lib/motion.ts:10-13`
explicitly warns that its values and `globals.css` *"must not drift apart"*; this screen is
where the drift is.

#### Target

Stage delays stay literal (they are choreography, and belong in the `STAGE_DELAYS` map that
plan 002 introduces). Everything else comes from the vocabulary.

```tsx
/* target — the value substitutions */
ease: [0.2, 0.8, 0.2, 1]                              →  ease: EASE_OUT
duration: 0.48                                        →  duration: DUR.count * 0.8   /* the chip deal is a deliberate 480ms; keep it, but derive it */
duration: 0.36, type: "spring", bounce: 0.22          →  ...SPRING
stiffness: 420, damping: 15                           →  ...SPRING
duration: 0.2                                         →  duration: DUR.base, ease: EASE_OUT
/* :407 — no duration */                              →  duration: DUR.base, ease: EASE_OUT
duration: 0.18                                        →  duration: DUR.base, ease: EASE_OUT
duration: 0.1   /* the non-staged fallback */         →  duration: DUR.micro
```

`SPRING` at `src/lib/motion.ts:37-42` is `{ type: "spring", stiffness: 520, damping: 38,
mass: 0.9 }` — a firm settle with almost no overshoot. The crown at `:355` currently uses
`damping: 15`, which is visibly bouncier. That bounce is the one place in the app where delight
is budgeted (`design-system.md`: *"Rare / first-time… can add delight"*), so it is a judgement
call, not a mechanical swap.

**Uncertainty, stated plainly:** whether the crown should lose its bounce cannot be decided from
the code. Make the swap, look at it, and if the crown reads as flat, keep a named local spring
instead — `const CROWN_SPRING: Transition = { type: "spring", stiffness: 420, damping: 15 };` —
with a one-line comment saying why it deliberately differs. Either outcome is acceptable; an
anonymous inline literal is not.

#### Repo conventions to follow

- Exemplar: `src/components/PokerTable.tsx:12` imports `{ DUR, EASE_OUT, SPRING, STAGGER }` and
  uses nothing else. That file is the model for this one.
- Values, from `src/lib/motion.ts:24-42`: `EASE_OUT = [0.16, 1, 0.3, 1]`, `DUR.micro = 0.11`,
  `DUR.base = 0.18`, `DUR.enter = 0.24`, `DUR.count = 0.6`, `STAGGER = 0.028`,
  `SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 }`.

#### Steps

1. Extend the import at `:30` to `import { DUR, EASE_OUT, SPRING, haptic } from "@/lib/motion";`
   (already done if plan 002 has landed).
2. Apply each substitution from the target table above, in place.
3. If a crown spring survives the feel check, hoist it to a named module constant with the
   justifying comment. Do not leave an inline anonymous spring.
4. Leave every `delay:` expression untouched — the choreography is deliberate.

#### Boundaries

- Do NOT change the sequence's overall shape or total length (2600ms, `--dur-stage`).
- Do NOT touch `src/lib/motion.ts` or `src/app/globals.css`. If the vocabulary is missing
  something this screen needs, STOP and report it rather than adding a token.
- Do NOT touch `ShareCard` (lines 30-107).

#### Verification

- **Mechanical**: `pnpm verify` passes. Afterwards,
  `grep -nE 'cubic-bezier|stiffness|damping|duration: 0\.' 'src/app/game/[id]/settlement/SettlementScreen.tsx'`
  should return nothing except a named, commented spring constant if one was kept.
- **Feel check**: clear `tilted:settlement:<gameId>:seen`, reload, and watch the full sequence
  end to end.
  - The chip deal, the winner card and the crown must still read as one system with the rest of
    the app — compare directly against the home screen's `rise` entrance and the table's seat
    spring by flipping between the two screens.
  - DevTools → Animations panel at 10% playback: the chips should ease out hard and settle, not
    drift linearly. The one-off `[0.2, 0.8, 0.2, 1]` is much lazier at the start than
    `EASE_OUT`; the difference is visible at 10%.
  - The crown: decide the bounce question here, on a real phone, not from the diff.
- **Done when**: no anonymous numeric timing literal remains in the file, and the sequence looks
  the same or better.

---

### 006 — Stop the cash-out net figure jumping as it crosses zero

- **Status**: TODO · **Commit**: `2a76d6b` · **Severity**: MEDIUM · **Category**: Cohesion
- **Scope**: 1 file, 1 line

#### Problem

```tsx
// src/app/game/[id]/cashout/CashoutScreen.tsx:436-455 — current
<AnimatePresence>
  {player.cashOut !== null && (
    <motion.span
      key={Math.sign(net)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: DUR.micro, ease: EASE_OUT }}
    >
```

`AnimatePresence` defaults to `mode="sync"`, so when the sign flips the exiting span and the
entering span are both in the flex row for 110ms. The row is `justify-between` with no reserved
width, so the figure visibly shifts sideways and two amounts are momentarily readable at once
— `AUDIT` §7's "crossfade that visibly double-exposes". This happens while the host is typing
counts and watching the number, and the sibling panel 40 lines below carries the comment
*"Colour only -- never move the digits themselves"* (`:479-482`), so the intent is already on
record.

#### Target

```tsx
/* target — src/app/game/[id]/cashout/CashoutScreen.tsx:436 */
<AnimatePresence mode="popLayout" initial={false}>
```

`mode="popLayout"` takes the exiting element out of flow immediately, so the entering figure
owns the row for the whole transition. `initial={false}` stops the figure fading in when the
row first renders with a value already present — it is not an arrival, it is a value.

#### Repo conventions to follow

- The file already imports `AnimatePresence` (`:6`) and uses `DUR.micro` / `EASE_OUT` from
  `@/lib/motion` at `:443`. No new imports.
- Exemplar of the same "do not move the digits" rule already respected:
  `src/app/game/[id]/cashout/CashoutScreen.tsx:477-488` — colour-only transition on the
  balanced/mismatched panel.

#### Steps

1. `src/app/game/[id]/cashout/CashoutScreen.tsx:436` — change `<AnimatePresence>` to
   `<AnimatePresence mode="popLayout" initial={false}>`.

#### Boundaries

- Change only that one opening tag. Do not touch the `key`, the variants, the transition, or
  the `<Money>` inside.
- Do NOT add `layout` props — `popLayout` is enough and `layout` would animate the row itself.

#### Verification

- **Mechanical**: `pnpm verify` passes.
- **Feel check**: `/game/<id>/cashout` on a live game with a chip set.
  - Type a count that puts a player above their buy-in, then below it, crossing zero. The
    "מאזן כרגע" figure must crossfade in place; the row must not widen and the digits must not
    slide horizontally.
  - Cross zero repeatedly and quickly. No stacking, no doubled figures, no drift.
  - Reload the page with a count already entered: the figure is present immediately, with no
    fade-in.
  - DevTools → Animations at 10%: exactly one figure occupies the slot at any moment.
- **Done when**: the figure only ever changes colour and value in place.

---

## 5. Execution order

| Order | Plan | Severity | Why here |
| --- | --- | --- | --- |
| 1 | 001 — off-centre crown | HIGH | Independent, two lines, fixes a named invariant violation that also ships in the exported share image. |
| 2 | 002 — tap to skip | HIGH | Restores documented behaviour; rewrites the lines plan 005 also touches, so it must go first. |
| 3 | 003 — `AnimatedMoney` renders | MED-HIGH | Independent of the others; largest frame-budget win. |
| 4 | 004 — reduced-motion spinners | MED | Independent; touches only `globals.css` and two vendored primitives. |
| 5 | 005 — settlement tokens | MED | **Depends on 002.** Consolidation only; no behaviour change. |
| 6 | 006 — cash-out crossfade | MED | Independent, one line. Can be done at any point. |

Findings **8** (home entrance from `opacity: 0`) and **9** (squashed arrowhead) are deliberately
left without plans: 8 is a design decision about whether the home screen should have an
entrance at all, which is the user's call rather than an executor's, and 9 is a nit whose fix is
smaller than its description. Both are recorded above if they are wanted later.

The four missed opportunities in §3 are additive and none is a defect. If one is picked up
first, it should be **LiveFeed row entrance** — smallest change, most-repeated moment.
