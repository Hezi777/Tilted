# Apple design review

A read-only review of Tilted's UI against Apple's interface and motion principles
(*Designing Fluid Interfaces*, *The Details of UI Typography*, *Principles of Great Design*),
translated for the web.

**Ground rules for this document.** `docs/design-system.md` is the presentation source of
truth. Where Apple's approach and the design system disagree, the design system wins — those
cases are recorded under *Disagreements* and are not proposed as fixes. Everything else is a
place where the code and the design system already agree and the code is short of it.

Ordering is by how much it affects the real context: a 390px phone, held one-handed, in a dim
room, by someone mid-hand who is not looking carefully.

---

## Tier 1 — costs you something in the room

### 1. The live screen's bottom bar is 40px, and its four buttons are not the same height

`src/app/game/[id]/LiveGameScreen.tsx:328-332`

```
<Button … size="sm" className="flex-1">הזמנה</Button>      // h-10 = 40px
<Button … size="sm" className="flex-1">היסטוריה</Button>    // h-10 = 40px
<HandRecorder … />                                          // default size = h-12 = 48px
<Button asChild … size="sm" className="flex-1">סגירת הערב</Button>  // h-10 = 40px
```

`HandRecorder`'s trigger (`src/components/HandRecorder.tsx:213`) takes the default size, so the
row renders three 40px pills and one 48px pill, vertically centred — the mismatch is visible as
a stepped edge, and every target is below the 48px floor the app's own `TabBar` comment defends
(`src/components/shell/TabBar.tsx:55`: *"48px is the stricter of the two platform floors, so it
is the one to keep"*). One of those 40px pills ends the night.

**Fix.** Drop `size="sm"` from all three and give `HandRecorder`'s trigger the same treatment;
the default `h-12` is already the right value. Remove `text-xs` from the recorder trigger
(`HandRecorder.tsx:213`) so all four labels share a step. If four `h-12` pills overflow at
390px, the row is telling you it has one action too many — move "הזמנה" to the header beside the
room code, where sharing already lives.

### 2. The winner's crown is one crown-width off centre — the exact invariant AGENTS.md warns about

`src/app/game/[id]/settlement/SettlementScreen.tsx:352` and `:65`

```tsx
className="absolute -top-5 start-1/2 -translate-x-1/2"
```

`start-1/2` resolves to `right: 50%` under `dir="rtl"`. `-translate-x-1/2` does **not** flip — it
always shifts physically leftward. So instead of centring, the two compose: the crown's right
edge lands on the 50% line and is then pushed a further 50% of its own width to the left. The
size-8 crown sits ~32px left of the avatar's centre; the size-11 one in `ShareCard` (`:65`) sits
~44px off.

This is the failure AGENTS.md names by name ("Never mix a logical inset with a physical
transform … This shipped a table with seats rendered outside their container"). `PokerTable` and
`SeatPicker` both get it right; these two are the leak. `ShareCard` is the worse of the two —
it renders the image that gets posted to the group's WhatsApp.

**Fix.** Use the pair `Dialog` already uses (`src/components/ui/dialog.tsx:67`): physical `left`
with a physical transform.

```tsx
<motion.div className="absolute -top-5 -translate-x-1/2" style={{ left: "50%" }} …>
```

ESLint cannot catch this — `start-1/2` is normally the correct property — so it is worth a
comment at both sites.

### 3. Invisible buttons are live during the settlement stage

`src/app/game/[id]/settlement/SettlementScreen.tsx:301, 456`

The staged celebration runs for 2600ms. Every staged element starts at `opacity: 0` and the
sticky action bar is delayed to `2.6`. The skip gesture is `onPointerDown` on `<main>`, which is
correct (Apple §1 — respond on pointer-down). But an invisible element with `opacity: 0` is
still hit-testable, and the sticky bar occupies the bottom of the screen for the entire sequence.

A tap in the lower third to skip the animation fires "שתפו את הסיכום" — an image render plus a
system share sheet — on a button the user could not see.

**Fix.** Gate interactivity on the stage, not just opacity:

```tsx
<motion.div
  className={cn("sticky bottom-0 …", staged && "pointer-events-none")}
  …
```

Cleaner still: make the skip target a full-screen transparent layer above the staged content,
which removes the whole class of mis-taps and gives the gesture one obvious owner.

### 4. Counting chips is one tap per chip

`src/components/ChipCounter.tsx:78-112`

Cash-out is the longest interaction in the app and the one with the least interaction design.
Each denomination gets a `−` and a `+` that fire once per `onClick`. Counting a 45-chip stack is
45 discrete taps with no hold-to-repeat, no drag on the number, and no coarse step. The typed
field is the escape hatch, but it opens a numeric keyboard over the row you are reading.

Apple §6 ("take a small input and make a big output") and §1 (continuous feedback *during* the
interaction, not only at the end) both point the same way.

**Fix.** Add pointer-down auto-repeat to the two steppers — 400ms before the first repeat, then
accelerate 120ms → 40ms — cancelled on `pointerup`, `pointercancel` and `pointerleave`, with
`setPointerCapture` so a finger that drifts off the button keeps counting. Keep the typed field
for someone who already knows the number. This is one small hook used twice; the existing
`setCount` clamp needs no change.

### 5. Cancel-the-game sits 4px from return-to-the-game, at 40px, on the home screen

`src/app/page.tsx:145-146`

```tsx
<Button asChild size="sm"><Link …>חזרה לשולחן</Link></Button>
<Button size="sm" variant="ghost" …>ביטול משחק</Button>
```

Two 40px controls stacked with `gap-1` (4px). One resumes the evening; the other, per its own
dialog, *"יוסר מההיסטוריה ולא יהיה ניתן להמשיך אותו"* — irreversible, and the confirm dialog is
the only thing between a mis-tap and a destroyed game. Apple's *agency* principle pairs choice
with forgiveness; an unrecoverable action next to the happy path, both under the touch floor,
in a dim room, is the opposite.

**Fix.** Cancelling a game is not a home-screen action. Move it into the live screen's existing
"פעולות נוספות" drawer (`LiveGameScreen.tsx:353`), where destructive host actions already
belong, and leave home with one button.

---

## Tier 2 — motion and materials

### 6. The live screen is the only major screen that doesn't arrive

`src/app/game/[id]/LiveGameScreen.tsx:228`

Home, new-game and profile all wrap their body in `motion.div` with `stagger` + `rise` from
`src/lib/motion.ts`. The live screen's `<main>` is a plain element. `PokerTable` animates itself
(`PokerTable.tsx:124`), so the table settles in while the header, the time strip, the rebuy row
and the bottom bar appear instantly around it — one element arriving and four popping.

Apple §7 is about spatial consistency: the same kind of thing should behave the same way in the
same place. The vocabulary already exists and is correct; the screen just doesn't use it.

**Fix.** Wrap the body below `AppHeader` in `motion.div variants={motionSafe(stagger,
reduceMotion)} initial="hidden" animate="show"` and mark the time strip, the rebuy row and the
table section as `rise` children. `PokerTable`'s own `tableVariants` should become the child
variant so the table participates in one stagger rather than running a second one.

### 7. Dialogs are CSS keyframes, and the spring the design system asks for is dead code

`src/components/ui/dialog.tsx:64` · `src/lib/motion.ts:63`

`docs/design-system.md` says *"Dialogs use a restrained spring."* `lib/motion.ts:63` defines
exactly that spring as `sheet` — and nothing in the app imports it. `DialogContent` animates
with tw-animate-css keyframes (`data-open:zoom-in-95` / `data-closed:zoom-out-95`) at a fixed
240ms.

Apple §3 ("avoid CSS transitions and `@keyframes` for anything gesture-driven; springs animate
from the current value") is a hard rule for dragged things and a soft one for a tapped dialog.
The practical cost here is small but real: a keyframe cannot start from a presentation value, so
re-opening the seat dialog during its close keyframe jumps rather than reverses — which happens
when someone taps two seats in quick succession on the live table.

**Fix, if the system's own stated intent is the goal.** Render `DialogPrimitive.Content asChild`
around a `motion.div` driven by `sheet`, with `AnimatePresence` on the portal. Note that
`src/components/ui/` is vendored shadcn and AGENTS.md says to style it, not police it — so the
alternative, equally legitimate, is to delete `sheet` from `motion.ts` and record that dialogs
are keyframe-driven by choice. What should not persist is a design-system sentence, a motion
token, and an implementation that are three different answers.

### 8. The drawer's drag handle is effectively invisible, and it isn't vaul's handle

`src/components/ui/drawer.tsx:64`

```tsx
<div className="mx-auto mt-4 hidden h-1 w-[100px] shrink-0 rounded-full bg-muted …" />
```

`--muted` is `--ink-800` (#1c1c23). `--popover`, the drawer's own background, is `--ink-700`
(#26262f). That is a 1px-tall bar at roughly 1.2:1 against the surface it sits on — the single
affordance telling the user this sheet can be dragged, rendered below the threshold of being
seen at all. It is also a plain `<div>`, not `DrawerPrimitive.Handle`, so vaul's enlarged hit
area and its own drag handling are not in play.

This matters more than it looks: the drawer is the app's only gesture-driven surface. Everything
else is taps. Apple's whole fluid-interface argument rests on the user believing things can be
grabbed.

**Fix.** `<DrawerPrimitive.Handle className="mx-auto mt-4 h-1.5 w-10 rounded-full
bg-[var(--glass-3)]" />` — 14% white on the sheet reads clearly, 6px tall is the iOS grabber
proportion, and 40px is the width people recognise. 100px reads as a divider.

### 9. The drawer has no scrim; the dialog does

`src/components/ui/drawer.tsx:40` — `bg-black/10 backdrop-blur-xs`
`src/components/ui/dialog.tsx:42` — `bg-surface-0/80 backdrop-blur-sm`

10% black over a #0b0b0f ground is not a dim — it is arithmetically almost nothing. The "פעולות
נוספות" drawer therefore does not read as modal, and nothing signals that tapping outside
dismisses it. Apple §12: *dim to focus* for a modal task, translucency-without-scrim only for a
parallel, non-blocking panel. This drawer is modal.

Two overlays for two modal surfaces in the same app should also not be two different materials
(§16, *familiarity*: things that look the same behave the same).

**Fix.** Match the dialog: `bg-surface-0/70 supports-backdrop-filter:backdrop-blur-sm`.

### 10. The primary chrome is translucent; the header is not

`src/app/game/[id]/LiveGameScreen.tsx:229, 328` · `src/components/AppHeader.tsx:21`

The bottom nav does this correctly — `bg-ink-950/85 backdrop-blur-xl` with content scrolling
under it, which is exactly Apple §12. `AppHeader` is opaque, static, and consumes a fixed strip
of a 390px screen that also has to hold a nine-seat table, a rebuy row and a four-button bar.

**Fix (low priority).** Make `AppHeader` sticky with the same material the nav uses, and let the
table scroll beneath it. A scroll-edge fade rather than a border, per §12.

### 11. Press feedback is suppressed on popup triggers

`src/components/ui/button.tsx:8` — `active:not-aria-[haspopup]:scale-[0.97]`

Radix sets `aria-haspopup` on its triggers, so this exclusion silences the press scale on them.
In practice it affects exactly one control today — the per-player action menu in
`src/components/PlayerCard.tsx:54`, reached from the seat dialog on the live table — because
every other overlay in the app is state-controlled rather than trigger-controlled.

Narrow, but it points the wrong way: Apple §1 puts feedback on pointer-down unconditionally, and
a menu trigger is precisely where a user needs to know the tap registered before the menu paints.

**Fix.** Drop the `not-aria-[haspopup]` guard. If it exists because the scale fought a Radix
open animation, scope the exclusion to that component rather than to the primitive.

### 12. Press motion as a CSS transition — correct as-is, no change

`src/components/ui/button.tsx:8` · `src/lib/motion.ts:46-48`

Worth recording because it looks like a violation of Apple §4 (springs over fixed curves) and
isn't. Over a 3% scale, 110ms of `cubic-bezier(0.16, 1, 0.3, 1)` is perceptually identical to a
critically damped spring, and `lib/motion.ts` argues explicitly for keeping one definition in
CSS rather than a Framer twin that drifts. Apple's spring rule is about things a user can
*grab*; a tap is not one. Leave it.

---

## Tier 3 — typography, and where Apple's guidance assumes Latin

Apple's typography talk is written for a script with ascenders, descenders and capitals. Hebrew
has none of the three. Two of its rules invert.

### 13. Negative tracking is applied down to body sizes, where Hebrew can least afford it

`src/app/globals.css:317-318`

```css
.t-heading { font-size: 1.375rem; letter-spacing: -0.02em; }
.t-title   { font-size: 1.125rem; letter-spacing: -0.01em; }
```

Apple's rule is that tracking is size-specific: tighten large display text (letters read too far
apart as they grow), keep body near zero, open small text slightly. The scale here follows the
shape of that rule but applies tightening two steps too far down.

For Hebrew it is worse than for Latin. Hebrew is a boxy, uniform-width, low-contrast script with
no ascender/descender rhythm to separate one letter from the next, and several pairs that differ
only by an open counter or a corner: ב/כ, ד/ר, ה/ח, ו/ז/ן. Closing the sidebearings at 18-22px
closes exactly the gaps those pairs are told apart by. `.t-title` is the player-name step on the
live table and in every dialog title — names read at a glance, from across a table, by someone
who isn't looking carefully.

**Fix.** Zero the tracking on `.t-title` and `.t-heading`. Keep `-0.03em` on `.t-display` and
`-0.025em` on `.t-display-l`, where the rule genuinely applies. Leave `.money` at `-0.02em`: it
is `dir="ltr"` tabular Latin digits and behaves like Latin.

### 14. Display leading is Latin-tight under a Hebrew two-line clamp

`src/app/globals.css:303-315` · `src/components/AppHeader.tsx:35`

`.t-display` is 40px/42px — 1.05, which is Apple's tight-display value and right for a single
line of Latin. But `AppHeader` renders every screen title as `line-clamp-2 text-balance
break-words`, and a two-line Hebrew title at 1.05 has final letters (ך ן ף ץ) descending from
line one into the top of line two. Game names are user-supplied and wrap often.

**Fix.** `line-height: 1.15` on `.t-display` and `.t-display-l` (46px and 34px). The body steps
are already generous and need no change.

### 15. Pinch-zoom is disabled

`src/app/layout.tsx:52` — `maximumScale: 1`

Apple §15 is explicit about respecting the user's text-size setting and scaling layout with the
text. iOS Safari has ignored `maximum-scale` since iOS 10, but Android Chrome honours it, and it
fails WCAG 1.4.4 either way. The layout is `rem`-based and would survive zoom fine.

**Fix.** Delete `maximumScale` — the viewport keeps `viewportFit: "cover"` and everything else.

### 16. Optical sizing — out of reach, noted for completeness

Apple's `font-optical-sizing` guidance needs a variable `opsz` axis. Rubik has none, so there is
nothing to switch on. The tracking steps in `globals.css` are the manual substitute and, with
finding 13 applied, a good one. No action.

---

## Tier 4 — smaller, still real

### 17. Switch and Checkbox are under the touch floor

`src/components/ui/switch.tsx` — 32 × 18.4px, expanded by `after:-inset-x-3 after:-inset-y-2`
to roughly 56 × 34px. `src/components/ui/checkbox.tsx` — 16px, expanded to ~32px tall. Both
fall short of 44px vertically. These are the reduce-motion and haptics toggles on the profile
screen, so this is a calm-context control, not an in-the-room one.

These are vendored primitives and AGENTS.md says to style them rather than police them — which
this is: `after:-inset-y-3.5` on the switch and `after:-inset-y-3` on the checkbox reach 44px
without touching the drawn size.

### 18. Colour swatches are 32px in a 6px-gap grid

`src/components/ChipSetEditor.tsx:124` — `size-8` round buttons, `gap-1.5`. Fix with an
`after:-inset-1.5` hit expansion rather than a bigger swatch; the visual size is doing real work
in a colour picker.

### 19. Tapping an empty chair does nothing

`src/components/PokerTable.tsx:136-144`

Empty slots render as a `<div>` with a dashed ring. The most obvious gesture at a poker table —
touch the empty chair to put someone in it — is inert, while the same action is reachable only
through a header overflow drawer, then a second dialog. Apple's *mapping* rule: put the control
at the thing it affects; if you need a label to explain a control, the mapping is weak.

**Fix.** When the viewer has no seat, render empty slots as buttons that open `SeatPicker` with
that seat pre-selected. The `saveSeat` path in `LiveGameScreen.tsx:142` already does the work.

### 20. `origin-right` is a physical origin the lint rule doesn't see

`src/app/game/[id]/settlement/SettlementScreen.tsx:415` — `origin-right` on the transfer arrow's
`scaleX` growth. It happens to be correct under `dir="rtl"` (start = right, so the line grows
from the payer), but it is a physical property surviving only because the app is RTL-only.
`origin-{left,right}` is not in `eslint.config.mjs`'s `PHYSICAL_CLASS` pattern. Either switch to
`origin-[right_center]` with a comment, or add `origin-l|origin-r` to the lint pattern. Note
only — nothing is broken today.

### 21. One frame of empty green before the settlement sequence

`src/app/game/[id]/settlement/SettlementScreen.tsx:320`

`stage === "pending"` renders a bare `felt-panel` slab at 70% opacity, and the effect that
promotes the stage runs after paint — so the screen shows an empty green rectangle, then the
skeleton is gone, then the sequence starts. Keep the `Skeleton` block visible until
`stage !== "pending"` instead.

### 22. A cash-out save discards other players' in-flight counts

`src/app/game/[id]/cashout/CashoutScreen.tsx:161` — `save()` replaces the entire `state` with the
server response, including every other player's `chipCounts`, any of which may be mid-debounce
in `chipSaveTimers`. `persistChipCounts` already does the careful thing (merges only the player
it saved, at `:198-215`); `save()` should do the same. Correctness rather than design, but it
surfaces as a count silently resetting while someone is looking at it.

---

## Disagreements — where the design system wins, and my job is only to flag

### A. The design system describes a different app from the one in the repo

`docs/design-system.md` specifies felt green `#1A6B4E`, oxblood `#C21E3A`, cream `#F5EDE6`,
Suez One + Assistant + IBM Plex Sans, `framer-motion` durations of 120/200/280/600/2600ms, and
"green is a material, not general interface chrome."

`src/app/globals.css:11-30` ships something else, and argues for it at length: cool charcoal
grounds, violet as the app's one atmospheric colour, a near-white pill as the primary action
(*"the primary action is therefore a light pill with dark text … can never be confused with
money"*), and money as ink only. `src/app/layout.tsx:13-22` collapses the three families to
Rubik alone, with a stated reason (real tabular figures, two fewer font requests). Durations in
`globals.css:228-233` are 110/180/240/600/2600.

AGENTS.md's invariant block still repeats the old palette ("felt ground, cream text, oxblood-red
actions", "`text-felt` on a card measures about 1.4:1"). `--color-felt` still exists and still
maps to the green — used correctly, as a material, in `felt-panel` and on
`text-felt-foreground`; I found no `text-felt` on a card anywhere.

I am not resolving this. But it is the highest-leverage fix in this document, because two of the
three documents an agent is told to obey now contradict the code, and each reading produces a
different app. The code has the better-argued position and has clearly won in practice.

### B. "Nothing animates in from nothing" vs. Apple's momentum-first framing

`src/lib/motion.ts:6-18` states the house rule: content is visible by default and settles;
durations stay under 240ms because *"someone has just bought in and the table is waiting."*
Apple's §4-§6 would push toward springs with velocity handoff and momentum projection
throughout.

The design system is right for this app and Apple's guidance does not actually contradict it —
momentum and velocity handoff are rules about *gestures*, and Tilted has almost no gestures by
design. Recorded so it isn't re-litigated: the absence of drag physics here is a product
decision, not an oversight. The one place it would earn its keep is the drawer, which already
gets it from vaul.

### C. Haptics are deliberately rationed

`src/lib/motion.ts:113-129` reserves the buzz for the two money-committing moments. Apple §13
(*utility* — "over-feedback trains users to ignore all of it") agrees exactly. The chip stepper
in finding 4 is the one place worth reconsidering, and even there the answer is probably no: 45
buzzes while counting a stack is the failure mode that rule exists to prevent.

---

## What's already right

Worth naming, because these are the parts that are hard and the repo got them right:

- **Latency.** `useLiveGame` (`src/hooks/useLiveGame.tsx:189`) updates local state and fires the
  haptic before the request leaves, rolls back on failure with a toast, and polls at 3s with
  visibility pausing and sequence guards. Apple §1, done properly.
- **Undo instead of confirmation.** The rebuy toast carries a 5s "בטל" action
  (`useLiveGame.tsx:213-217`) rather than a confirm dialog. Apple §16 *agency*: forgiveness over
  friction.
- **The seat maths.** `PokerTable.tsx:140, 166` and `SeatPicker.tsx:85` both use physical
  `left`/`top` with a physical `translate(-50%,-50%)` and say why in a comment. That is the
  correct resolution of the app's hardest RTL trap.
- **Reduced motion, three ways.** `prefers-reduced-motion` in CSS, `MotionConfig` for Framer, and
  an account-level `data-reduce-motion` mirror (`globals.css:280-298`,
  `MotionPreferences.tsx:30`), plus `disableForReducedMotion` on the confetti and a
  reduced-motion branch that skips the settlement stage entirely. More thorough than most
  production apps.
- **Toast placement.** `position="top-center"` (`layout.tsx:98`) keeps toasts off the thumb
  zone and off the fixed bottom bar. Sonner's default would have put them behind it.
- **Skip-on-pointer-down.** `SettlementScreen.tsx:301` commits the skip on `pointerdown`, not
  `click`. (Finding 3 is about what else is under that pointer, not about the timing.)
