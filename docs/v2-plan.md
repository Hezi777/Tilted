# Tilted v2 — build plan

Source: the twelve-point requirements list from the product owner (2026-09-04). This file
is the settled reading of that list: where a requirement collides with an invariant in
`AGENTS.md` or a rule in `docs/poker-night-spec.md`, the resolution is recorded here and
this file wins. `docs/design-system.md` still owns presentation and motion.

## Conflicts with existing invariants, and their resolutions

| # | Requirement | Collides with | Resolution |
|---|---|---|---|
| 1 | Item 2, Authentication | `AGENTS.md`: "**No authentication, ever.**" | The invariant is retired by the product owner's explicit decision. Auth.js (NextAuth v5) with Google OAuth and a Drizzle/Neon session store. Free tier only — no email provider, no paid identity service, so the "costs nothing to run" invariant holds. `device_id` survives as the write-authorization key so nothing in the live game path regresses; a signed-in user is bound to a `Person`. |
| 2 | Item 5, Bit transfers | `AGENTS.md`: "no money moves inside the app" | Compatible. The app composes a Bit deep link and records a manually-ticked `paid_at`. No funds, credentials, or payment APIs touch the runtime. The app never confirms a payment happened — a human does. |
| 3 | Item 4, per-player reporting | `AGENTS.md`: "One authorization rule, enforced server-side" | Already the rule. This is enforcement and UI work, not a new permission model. No second permission check gets added. |
| 4 | Items 1/8/9, chip counting | `AGENTS.md`: "Money is integer agorot end to end" and "`money.ts`/`settlement.ts` are test-locked" | Denomination values are agorot integers. Chip count × denomination value is integer multiplication, done in a new `src/lib/chips.ts`. Neither `money.ts` nor `settlement.ts` is edited; `chips.ts` produces an agorot total and hands it to the existing cash-out path. |
| 5 | Item 8, two colours sharing a value | — | The denomination row, not the colour, carries the value. Colour is presentation. A chip set may contain two rows with the same value and different colours. |

## Data model additions

All money stays integer agorot.

- `chip_sets` — id, name, `owner_person_id` (null = shared preset), `is_preset`, timestamps.
- `chip_denominations` — id, `chip_set_id`, `color` (hex), `value` (agorot), `image_key`, `sort_order`. Two rows in one set may share a `value`.
- `games` — add `location` (text), `chip_set_id`, `created_by_person_id`, `notes`.
- `players` — add `table_seat` (integer, the physical chair). Distinct from `seat_order`, which stays the creation order the pot and settlement rely on.
- `cash_out_chips` — `cash_out_id`, `denomination_id`, `count`. The counted stack, kept so a total can be re-derived and audited.
- `transfers` — id, `game_id`, `from_player_id`, `to_player_id`, `amount`, `paid_at`, `marked_by_device`. Persists what `settlement.ts` computes so "who has paid" is durable. The computation still lives in `settlement.ts` and is not reimplemented.
- `people` — add `phone` (for Bit), `user_id` (auth phase).
- `playlists` — id, name, url, `sort_order`.
- `hands` — id, `game_id`, `title`, `note`, `board` (text), `pot_amount`, `winner_player_id`, `created_at`.
- `hand_players` — `hand_id`, `player_id`, `hole_cards`, `delta` (agorot, signed).

## Milestones

Each milestone owns a disjoint set of files so they can run concurrently. A milestone is
done when `pnpm verify` passes.

**M0 — schema and migration** (serialization point; no other milestone starts before it lands)
`src/db/schema.ts`, `drizzle/migrations/*`.

**M1 — chip sets and denominations** (items 1, 8)
`src/lib/chips.ts` (+ tests), `src/db/chip-queries.ts`, `src/app/api/chip-sets/**`,
`src/components/ChipSetEditor.tsx`, `src/components/ChipCounter.tsx`.

**M2 — game identity: location, notes, editable rules, delete** (items 3, 7)
`src/app/api/game/[id]/route.ts` (PATCH/DELETE), `src/app/game/new/page.tsx` location
field, `src/app/history/HistoryScreen.tsx` delete affordance.

**M3 — cash-out by chip count and the end-of-game summary** (item 9)
`src/components/cashout-screen.tsx`, `src/app/game/[id]/settlement/SettlementScreen.tsx`,
`src/db/cashout-queries.ts`.

**M4 — transfers, Bit links, paid tracking** (item 5)
`src/db/transfer-queries.ts`, `src/app/api/game/[id]/transfers/**`, settlement UI rows.

**M5 — seating** (item 10)
`src/components/PokerTable.tsx`, `src/app/join/page.tsx`, `players.table_seat` wiring.

**M6 — join flow and home CTA** (item 3)
`src/app/join/**`, `src/app/page.tsx`.

**M7 — terminology pass** (item 6)
Every user-facing Hebrew string. Text only, no logic.

**M8 — music** (item 11)
`src/app/api/playlists/**`, `src/components/MusicButton.tsx`.

**M9 — iconic hands** (item 12)
`src/app/api/game/[id]/hands/**`, `src/components/HandRecorder.tsx`, history surfacing.

**M10 — authentication and profiles** (items 2, 4)
Auth.js wiring, `src/app/profile/**`, binding a user to a `Person`, phone on the profile,
and the server-side check that a non-host may only write their own row. Runs last: it
touches every route handler, so it cannot run concurrently with anything else.

## Terminology (item 6), settled

Hebrew UI, English code stays the rule. The interface terms:

| Concept | Hebrew in UI | Not |
|---|---|---|
| Buy-in | כניסה | באיין |
| Rebuy | ריביי | קנייה חוזרת, רי-ביי |
| Cash out | סגירת חשבון | קאשאאוט |
| Pot | קופה | פוט |
| Chip | ז׳יטון | צ׳יפ |
| Chip set | חבילת ז׳יטונים | סט צ׳יפים |
| Host | מארח | מנהל |
| Settlement | סגירת הערב | סטלמנט |

M7 applies this table everywhere and fixes any string that disagrees with it.
