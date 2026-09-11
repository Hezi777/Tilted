# Tilted design system

The source of truth for presentation and motion. Behaviour and data belong to
`docs/poker-night-spec.md` and `docs/v2-plan.md`.

**This document describes what `src/app/globals.css` and `src/lib/motion.ts` actually
contain.** Those two files are the implementation and this is their reading; if they
disagree, the code is right and this file is the bug. Token values live there, not here —
this document names the *roles* and the reasoning, so a change of hex does not make it
stale.

> Superseded, 2026-09-12: this file previously described a warm red-and-green direction —
> oxblood actions, green felt, Suez One and IBM Plex, hairline borders on every edge. That
> direction shipped and was then replaced. None of it is in the code any more.

## Direction

A dim living room at 2am, one lamp on, phones face-up on the table. The app is dark-only;
there is no light theme and no `.dark` class to toggle — `:root` is the single palette.

Structure comes from **value steps, not lines**. A panel separates from its ground by being
a lighter step of the same near-black, plus space, plus a 1px inset specular along its top
edge. There is not one hairline border in the component layer. This is also what the
dark-UI literature recommends: heavy shadows go muddy on dark grounds, so elevation is
carried by surface lightness instead.

Colour has exactly two jobs:

- the **avatar** is saturated, and is the only saturated fill in the app;
- **money is ink** — green up, rose down — never a fill, and always beside an explicit
  sign, so colour is never the only cue.

The primary action is therefore a **light pill with dark text**: the highest-contrast
object on any screen, carrying no hue, and impossible to read as money.

## Tokens

All defined in `src/app/globals.css` under `:root`. Named by role, not by appearance.

| Group | Tokens | What they are |
|---|---|---|
| Ground | `--ink-950` … `--ink-500` | Six value steps. 950 page, 900 base, 800 card, 700 raised/pill/input, 600 hover, 500 disabled fill. |
| Translucency | `--glass-1/2/3` | White at 6/10/14%. For pills that sit on whatever is beneath them. |
| Type | `--text-0` … `--text-3` | 0 primary, 1 secondary, 2 meta, 3 disabled-only. |
| Primary action | `--light`, `--light-ink` | The pill and its ink. |
| Money | `--green-400` up, `--red-400` down, `--text-1` even | Ink only. Nothing is filled in these. |
| Atmosphere | `--violet-300/500/700/900` | The light the table sits under. `--violet-300` is the only step that may carry text. |
| Elevation | `--elevation-1/2/3` | Inset specular top edge + soft offset shadow. |
| Stacking | `--z-base` … `--z-toast` | One scale. Nothing invents its own. |

**Ground is cool charcoal (`#0b0b0f`), never pure black.** Pure black plus near-white text
causes halation — the text blooms, and it reads as blurred to astigmatic users.

### Contrast

Ratios are quoted **against `--ink-800`, the card** — not against the page. Almost nothing
sits directly on the page, and quoting the page number flatters every step by about a stop.
The comments in `globals.css` carry both the card and the pill (`--ink-700`) figure.

- `--text-0` 15.7:1 · `--text-1` 6.4:1 · `--text-2` 5.1:1 on a card, 4.5:1 in a pill.
- `--text-3` is **disabled text only**, which WCAG exempts. Never use it for meta.
- Anything below AA on the surface it actually lands on is a bug, not a style choice.

## Typography

Two families, via `next/font/google`, split by capability rather than by taste:

- **Assistant** (`--font-app`) — Hebrew and Latin UI text. The smoothest and most open of
  the Hebrew faces.
- **Rubik** (`--font-numeral`, reached through `--font-money`) — money, and nothing else.

The split exists because Assistant's figures are not tabular and Rubik's are. See
*Money, and why the face cannot change* below before changing either.

Eight steps in `@layer components`, and nothing outside them: `.t-display`, `.t-display-l`,
`.t-heading`, `.t-title`, `.t-body`, `.t-label`, `.t-caption`, `.section-label`.

**Hebrew rules that Latin type guidance will get wrong:**

- **No negative tracking below the display steps.** Hebrew has no ascender/descender rhythm
  to hold letters apart, and several pairs are distinguished only by an open counter —
  ב/כ, ד/ר, ה/ח. Tightening at 18–22px closes exactly those. `.t-heading` and `.t-title`
  therefore carry no `letter-spacing`; the display steps keep theirs, because at 30px+ the
  counters survive it.
- **Leading is looser than a Latin eye wants.** Hebrew finals — ך ן ף ץ — descend well below
  the baseline. `.t-display` runs 1.15, not the 1.05 that looks right in a Latin specimen.
- **Never rely on italics or on weight alone.** Hebrew has no true italic, and heavy weights
  close the same counters tracking does.

### Money, and why the face cannot change

Every rendered amount goes through the `Money` / `AnimatedMoney` components in
`src/components/Money.tsx`, with `dir="ltr"` and tabular figures.

Rubik is not a default here, it is the intersection of three requirements, and it is
a small intersection. Measured, not assumed:

- **The shekel sign.** No Latin-only geometric face has U+20AA. Poppins, Montserrat
  and Outfit render `₪` from the system fallback — their glyphs for it are within
  3-6 pixels of each other and nothing like their own digits. An amount set in one
  of them is two fonts.
- **Tabular figures**, because `AnimatedMoney` counts over 600ms and a number that
  reflows mid-count is the thing the whole component exists to prevent. Advance
  width across `111,111` / `000,000` / `888,888` / `456,789`: Rubik 0px spread,
  Heebo 0px, Noto Sans Hebrew 0px, **Assistant 10px**.
- **Hebrew**, for everything that is not a digit.

Assistant is the smoothest Hebrew face of the three and is disqualified for money by
the second rule alone. It remains a legitimate choice for UI *text*, which needs no
tabular figures — that would be two families, both Hebrew-capable.

Reference clients in this genre use geometric Latin faces with a double-storey `a`
(so: not Poppins). None of them is reachable here while Hebrew and the shekel are
requirements. Do not re-litigate this by eye; the numbers above are reproducible.

Numerals are **never** mirrored — the Unicode bidi algorithm already handles them, and
forcing them RTL is the classic RTL bug. Canonical forms: `₪150`, `+₪20`, `-₪20`, and bare
`0` for an even result.

## RTL

The whole UI is `dir="rtl"`. Two rules, one of which ESLint enforces:

1. **Logical properties only** — `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/
   `text-end`. `eslint.config.mjs` fails the build on the physical forms.
2. **Never combine a logical inset with a physical transform.** `start-1/2` flips under
   `dir="rtl"` and `-translate-x-1/2` does not, so together they land an element a full
   offset from where the maths put it. `left: 50%` + `-translate-x-1/2` is the safe pair —
   the one `src/components/ui/dialog.tsx` uses. `eslint.config.mjs` matches the *pair*,
   since neither utility is wrong alone.

`transform-origin` has no logical form in Tailwind. `origin-right` is therefore correct and
deliberate in an RTL-only app; it is the one physical name that stays.

## Motion

`framer-motion`, with the vocabulary in `src/lib/motion.ts`. Chip confetti uses
`canvas-confetti`.

Two rules decide everything:

1. **Nothing animates in from nothing.** Content is visible by default and settles into
   position. An 8px rise reads as weight; a fade from zero reads as a page that has not
   finished loading — which, on a phone at a poker table, is a lie about latency.
2. **Exponential ease-out**, `cubic-bezier(0.16, 1, 0.3, 1)`. Mirrored as `--ease-out` in
   `globals.css`; the two must not drift.

| Token | Value | For |
|---|---|---|
| `DUR.micro` | 110ms | Press, tap acknowledgement. |
| `DUR.base` | 180ms | A state change. |
| `DUR.enter` | 240ms | Something arriving. |
| `DUR.count` | 600ms | Money counting. The one place the animation *is* the information. |
| `STAGGER` | 28ms | Between siblings in a list. |
| `SPRING` | 520 / 38 / 0.9 | Anything with mass: a seat re-seating, a card landing. |

Variants: `rise` (a card or row arriving), `stagger` (its parent), `bump` (a value that
changed in place). There is deliberately **no** `sheet` variant — dialogs and drawers are
Radix and vaul primitives that animate off their own `data-state`, and running a second
Framer opening on top of them is the thing not to do.

- Buttons press to 0.97, defined once on the Button primitive in CSS so no screen
  re-implements it.
- Settlement stages once per game per device, over 2.6s. **Any tap completes it
  immediately** — which requires driving the staged elements by variant *label*, because
  Framer only retargets when the target changes, and every element there animates to the
  same final values either way.
- Haptics are reserved for the two moments that commit money: a rebuy, and the settlement
  crown. Navigation and ordinary controls stay silent.

### Reduced motion

Every motion path must respect it, and there are three mechanisms because Framer, CSS and
layout animations each need their own:

- `MotionConfig reducedMotion` at the root covers Framer transforms.
- `motionSafe(variants, reduceMotion)` in `src/lib/motion.ts` flattens a variant to
  opacity-only. Prefer it to branching at the call site, so a screen cannot forget.
- A `[data-reduce-motion="true"]` attribute plus a `prefers-reduced-motion` block in
  `globals.css` cover the CSS animations Framer never sees. Both honour the profile
  preference, not just the OS one.

`height: auto` disclosures cannot be flattened by `motionSafe` — it only rewrites opacity —
so those branch explicitly and skip the travel.

**Indeterminate indicators are exempt from the iteration cap.** A spinner frozen at a random
angle reads as a hang, which is the opposite of the reassurance it exists to give; under
reduced motion `.animate-spin` pulses on opacity instead of stopping.

## Touch and input

- **48px minimum** on anything tappable; 44px is the floor and 48 is the target. Controls
  drawn smaller than that — a checkbox, a switch, a colour swatch — keep their drawn size
  and grow the hit area underneath with an `after:absolute after:-inset-*` pseudo-element.
- **Latency is the product.** A tap updates local state immediately and persists in the
  background, rolling back with an error toast on failure. Never block a tap on a round
  trip.
- **Repeating input gets a hold.** Anything a person might do twenty times in a row — the
  chip steppers — repeats on press-and-hold: fire immediately, start repeating after 400ms,
  accelerate 120ms → 40ms. Keep the click handler for keyboard activation and tell the two
  apart with `event.detail === 0`.
- Pinch-zoom is never disabled. No `maximumScale` in the viewport.

## Components

shadcn/ui over Radix, vendored into `src/components/ui/`. Style them; do not police them —
they are the one place the lint rules are off, because they are upstream code.

Every control and overlay comes from there. If a screen needs a control shadcn does not
have, the answer is to compose the primitives, not to hand-roll a button.

## Settlement voice

Copy is deterministic and derived from the result. It borrows the rhythm of Israeli
home-table language and familiar English poker idioms without quoting personalities or
mocking the loser. Approved ingredients include `אס זוכה, קינג בוכה`, `קנטה`, `ריבר`,
`Read 'em and weep`, `ace in the hole`, and `the chips are down`. The line may celebrate a
close finish, the winner's rebuy comeback, or the top result. It must be gender-neutral
Hebrew and never require an AI call.

References: [Ynet poker terms](https://www.ynet.co.il/articles/0,7340,L-5754083,00.html) ·
[pokerstar.co.il](https://www.pokerstar.co.il/poker-terms) ·
[BetMGM poker idioms](https://poker.betmgm.com/en/blog/lifestyle/upping-the-ante-top-english-idioms-that-come-from-poker/) ·
[PokerStars glossary](https://www.pokerstars.es/en/poker/terms/)

## Art

Generated art is static and committed. **No image API runs in the product.** Files live in
`public/art/` as `.webp` (plus the PNG app icons); the prompts that produced them are
recorded in `docs/art-prompts.md`.
