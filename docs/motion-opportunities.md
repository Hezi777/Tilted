# Motion opportunities

A read-only sweep for places in Tilted that do not animate but should, and — just as
importantly — the places that must stay still. Nothing here has been implemented.

Every recipe below is written in the vocabulary that already exists: the tokens in
`src/app/globals.css` (`--dur-micro` 110ms, `--dur-base` 180ms, `--dur-enter` 240ms,
`--dur-count` 600ms, `--stagger` 28ms, `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`) and
their Framer twins in `src/lib/motion.ts` (`DUR`, `STAGGER`, `EASE_OUT`, `SPRING`, `rise`,
`stagger`, `sheet`, `bump`, `motionSafe`). No new curve, no new duration, no parallel
system. Every proposal passes through `motionSafe(..., useReducedMotion())` or a CSS
transition that the existing `prefers-reduced-motion` / `[data-reduce-motion="true"]`
blocks already neutralise.

The baseline is good. This app is already more disciplined about motion than most: press
feedback lives once on the Button primitive, overlays ride Radix `data-state`, the
settlement sequence is a deliberate and fully spent delight budget, and `motion.ts`
states the house rule that nothing animates in from nothing. What follows is five gaps,
not a wishlist.

---

## Part 1 — Opportunities

| # | Location | Today | Purpose | Frequency | Suggested motion |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/components/PokerTable.tsx:208` | A seat's own `totalIn` pill snaps to the new figure after a rebuy, while the pot beside it counts up over 600ms. The tap's money lands invisibly on the person it was for. | State indication | Occasional (a handful of rebuys per evening, per viewer) | Use the `bump` variant that `src/lib/motion.ts:76` already defines and documents as waiting for exactly this: wrap the pill in `motion.span`, `animate={hit}` keyed on `player.totalIn`, `scale: [1, 1.06, 1]`, `duration: DUR.base * 2` (360ms), `ease: EASE_OUT`. Pass it through `motionSafe(bump, reduceMotion)` — `PokerTable` already holds `reduceMotion` at line 104. Value text must not travel; scale only. |
| 2 | `src/app/game/[id]/settlement/SettlementScreen.tsx:410` | Marking a transfer paid is supposed to dim the row to `opacity-60`. It does not: the wrapping `motion.div` sets `animate={{ opacity: 1 }}`, and Framer's inline `style.opacity` beats the Tailwind class. The only feedback is the `line-through`. **This is a broken state indicator, not just a missing animation.** | State indication | Occasional (each transfer marked once; 3–6 per game) | Move the dim into the value Framer already owns: `animate={{ opacity: paid ? 0.6 : 1 }}` with `transition={{ duration: staged ? undefined : DUR.base, ease: EASE_OUT }}` (180ms), and drop `paid && "opacity-60"` from the `cn`. Opacity only — the row must not move under a thumb that is still tapping the next one. |
| 3 | `src/app/join/page.tsx:266` | The roster section — the moment the spoken code resolves into your friends' faces — replaces the form area instantly, with no bridge from the code entry that produced it. | Preventing a jarring change (delight-adjacent) | Rare (once per evening, per player) | Wrap the `<section>` in `motion.section` with `variants={motionSafe(stagger, reduceMotion)}`, `initial="hidden"`, `animate="show"`, and give each player `<Card>` `variants={motionSafe(rise, reduceMotion)}` — i.e. `opacity: 0 → 1`, `y: 8 → 0`, `duration: DUR.enter` (240ms), `ease: EASE_OUT`, `staggerChildren: STAGGER` (28ms), `delayChildren: 0.02`. This is the existing house entrance verbatim; no new values. |
| 4 | `src/app/page.tsx:190` (and the empty state at `:183`) | The stagger container at `:116` mounts and finishes its entrance while `games === null`, so the skeletons are what animate. When the fetch lands, the real rows and the empty state teleport into place with no motion at all. | Preventing a jarring change | Occasional (home is the app's landing screen, but the swap happens once per load) | Keep the existing `rise`/`stagger` pair, but run the list's own entrance when the data arrives: give the `<ul>`/empty-state block its own `motion.div` with `key={games === null ? "loading" : "loaded"}`, `variants={motionSafe(stagger, reduceMotion)}`, children on `motionSafe(rise, reduceMotion)` — `opacity: 0 → 1`, `y: 8 → 0`, 240ms `EASE_OUT`, 28ms stagger, capped at the three rows already rendered. Do not stagger further than three items; this is a landing screen, not a reveal. |
| 5 | `src/components/HandRecorder.tsx:251` and `src/app/game/[id]/cashout/CashoutScreen.tsx:538` | Two disclosure reveals that snap: ticking a player into a memorable hand grows their card by two input rows and shoves the rest of the list down; choosing "שיוך ההפרש לשחקן אחד" pops a grid of player buttons under the button that was just pressed. | Preventing a jarring change | Occasional (host-only, a few times per evening) | Framer `initial={{ height: 0, opacity: 0 }}` → `animate={{ height: "auto", opacity: 1 }}` → `exit={{ height: 0, opacity: 0 }}` inside `<AnimatePresence initial={false}>`, `transition={{ duration: DUR.base, ease: EASE_OUT }}` (180ms), with `overflow: hidden` on the collapsing wrapper. Height is the one property allowed outside transform/opacity here, because the layout shift *is* the thing being bridged. Under reduced motion, render the block immediately with no collapse (branch on `useReducedMotion()`; `motionSafe` cannot flatten a height). Lowest-leverage row on the list — build it last, or not at all. |

### Notes that apply to all five

- **Never pair a logical inset with a physical transform.** None of these proposals
  positions anything; #1 scales in place and #3/#4/#5 translate only on the block axis
  (`y`), which is direction-neutral. If any of them grows an `x` offset later, it must use
  `left` + `translate(-50%, -50%)`, per `AGENTS.md`.
- **Nothing here gates a tap on a round trip.** #1 keys off `player.totalIn`, which the
  optimistic merge in `useLiveGame` sets before the request leaves; #2 keys off the
  optimistic `togglePaid` state. Both roll back with the existing toast path.
- **Money still formats through `Money`/`AnimatedMoney` and stays integer agorot.** #1
  animates the container, not the number.

---

## Part 2 — Rejected candidates

Deliberately **not** proposed, each with the gate question that killed it:

`src/components/ChipCounter.tsx:119` — counting up the running chip total on every +/−
**rejected: tens of taps per player per count, and it is a figure the host is reading
against real cash; a 600ms interpolation would show wrong numbers mid-tap**.
`src/app/game/[id]/cashout/CashoutScreen.tsx:491` — animating "נספר X מתוך Y"
**rejected: the code comment at :479 already settled this; colour only, never move the
digits, at the exact moment trust in the figure matters most**.
`src/app/profile/ProfileScreen.tsx:253-286` — count-ups on the six stat tiles
**rejected: functional, information-dense data the user opened the screen to read**.
`src/components/LiveFeed.tsx:23` — enter transitions on new feed rows **rejected: the
feed lives inside a dialog that is opened occasionally, so new items almost never arrive
while anyone is looking at them; motion nobody sees is cost without benefit**.
`src/components/PokerTable.tsx:158` — `AnimatePresence` exit for a removed seat
**rejected: the confirm dialog at `LiveGameScreen.tsx` already bridges the change, and
absolutely-positioned exiting seats are precisely the setup that shipped seats outside
their container once already**.
`src/app/game/[id]/LiveGameScreen.tsx:113` — the copy-code button's `CopyIcon → CheckIcon`
swap **rejected: a toast already confirms it; two confirmations for one tap is noise**.
`src/app/join/page.tsx:238` — the four room-code digit boxes **rejected: keyboard-driven,
four taps in a row, and they already carry a 180ms scale/colour transition; anything more
would lag the typing**.
`src/components/ui/button.tsx:8`, `dialog.tsx:42/64`, `drawer.tsx:40`, `dropdown-menu.tsx:46`
— press feedback and overlay entrances **rejected: already correct. `active:scale-[0.97]`
at `--dur-micro`, Radix `data-state` at `--dur-enter`. Leave them alone.**
`src/app/page.tsx:74-114` — an idle shimmer or parallax on the neon masthead **rejected:
decoration on the screen users see most; "it looks cool" is not a purpose**.
Route transitions between home / live game / cashout / settlement **rejected: core
navigation, many times per evening; a transition here makes the app feel slower, not
richer**. `src/app/game/[id]/settlement/SettlementScreen.tsx:300-462` — anything added to
the staged celebration **rejected: the delight budget is already fully spent here, once
per game per device, and it is the only place in the app that earns it**.

---

## Part 3 — Verdict

Tilted needs very little more motion than it already has, and most of what it is missing
is not decoration but confirmation — the two places where money changes hands and the
interface does not visibly agree. Row 2 is the highest leverage and should be built first:
it is a genuinely broken state indicator (Framer's inline opacity is silently eating the
`opacity-60` class), so fixing it costs one line and repairs a feature, not just a feel.
Row 1 is second and closes the app's core loop — the rebuy tap currently animates the pot
but not the person, and `motion.ts` already wrote the answer and left it unused. Rows 3–5
are polish; row 5 is optional.

Handoff: `improve-animations plan <row>` turns any of these into a self-contained
implementation plan.
