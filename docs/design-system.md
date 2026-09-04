# Tilted design system

This document is the presentation source of truth. It supersedes older visual, typography,
art-direction, and animation notes in `docs/poker-night-spec.md` and the approved build plan.

## Direction

Tilted is a low-lit private card room. Materials are grown-up; chip characters are fun. The
room is warm and dark, and the poker table is the only cool surface. Green is a material, not
general interface chrome.

## Tokens

- Surfaces: `#0B0809`, `#141011`, `#1C1618`, `#251D20`, `#2E2528`.
- Brand red: `#E8556B`, `#C21E3A`, `#8A1128`, `#4A0917`; actions, focus, and atmosphere.
- Felt: `#1A6B4E`, `#0F4A36`, `#06251B`; table material and profit figures only.
- Rail: `#4A1B21`, `#2A1013`, `#150608`.
- Text: `#F5EDE6`, `#B8A9A2`, `#7A6B67`, `#4E4340`.
- Money: profit `#4FE39B`, loss `#F2606B`, even `#B8A9A2`.

Cards use a 20px radius, buttons and inputs 14px, and pills are fully round. Raised surfaces
have a quiet hairline on every edge and a brighter top edge. Primary actions use oxblood red;
destructive actions use a lighter red outline.

## Typography and money

- Suez One: display titles.
- Assistant 400–700: Hebrew UI and body copy.
- IBM Plex Sans 400–700: all currency and changing numerals.

Every rendered amount uses the shared `Money` component, `dir="ltr"`, and tabular numerals.
The canonical forms are `₪150`, `+₪20`, `-₪20`, and bare `0` for an even result.

## Layout

- Phone baseline: 390px. Screen padding is 20px.
- Home: red-neon masthead, primary action, open table, then history or an illustrated invitation.
- Live game: header, useful time fact, physical table and exposed pot, rebuy controls, equal bottom actions.
- Settlement: chip stack and pot, winner, balances, transfers, then a sticky share action.
- Three-player tables use a tighter triangular seat layout rather than nine-seat coordinates.

## Motion

Motion uses `framer-motion`; chip confetti uses `canvas-confetti`.

- Micro 120ms, state 200ms, enter 280ms, money count 600ms, settlement stage 2600ms.
- Buttons press to 0.97. Selection cross-fades. Dialogs use a restrained spring.
- Rebuy and the settlement crown may trigger haptics. Navigation and ordinary controls do not.
- Settlement stages once per game per device. Any tap completes it immediately.
- Reduced motion uses opacity-only transitions, final money values, no staging, and no confetti.

## Settlement voice

Copy is deterministic and derived from the result. It borrows the rhythm of Israeli home-table
language and familiar English poker idioms without quoting personalities or mocking the loser.
Approved ingredients include `אס זוכה, קינג בוכה`, `קנטה`, `ריבר`, `Read ’em and weep`,
`ace in the hole`, and `the chips are down`. The line may celebrate a close finish, the winner's
rebuy comeback, or the top result. It must be gender-neutral Hebrew and never require an AI call.

Research references:

- https://www.ynet.co.il/articles/0,7340,L-5754083,00.html
- https://www.pokerstar.co.il/poker-terms
- https://poker.betmgm.com/en/blog/lifestyle/upping-the-ante-top-english-idioms-that-come-from-poker/
- https://www.pokerstars.es/en/poker/terms/
- https://en.wiktionary.org/wiki/read_%27em_and_weep

## Art

- `neon-hero.webp`: red neon masthead.
- `poker-table-green.webp`: green felt, oxblood rail, matte blackened-steel studs.
- `buyin-20.webp`, `buyin-30.webp`, `buyin-50.webp`, `buyin-100.webp`, and
  `buyin-custom.webp`: face-on red, green, cream, and charcoal denomination chips.
- Generated art is static and committed. No image API runs in the product.
