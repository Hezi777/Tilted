# Tilted v2 — build plan

Source: the twelve-point requirements list from the product owner (2026-09-04). This file
is the settled reading of that list: where a requirement collides with an invariant in
`AGENTS.md` or a rule in `docs/poker-night-spec.md`, the resolution is recorded here and
this file wins. `docs/design-system.md` still owns presentation and motion.

## Conflicts with existing invariants, and their resolutions

| # | Requirement | Collides with | Resolution |
|---|---|---|---|
| 1 | Item 2, Authentication | `AGENTS.md`: "**No authentication, ever.**" | The invariant is retired by the product owner's explicit decision. **Neon Managed Better Auth** (`@neondatabase/auth`), free to 60,000 MAU on the plan this project already runs on, so the "costs nothing to run" invariant holds. Chosen over Auth.js because the auth tables live in this same Neon database — users are an ordinary SQL join from `people`, not a synced mirror — and they branch with the database. Two caveats it buys: the product is in Beta and has already had one breaking migration (the legacy Stack Auth flavour is closed to new users), and its `@neondatabase/auth-ui` components would violate the shadcn invariant and have unproven RTL/Hebrew support, so M10 uses the **headless client only** (`createAuthClient` / `useSession` / `auth.getSession`) behind our own shadcn screens. Every server write derives the actor from the session; the client never supplies its own identity. |
| 2 | Item 5, Bit transfers | `AGENTS.md`: "no money moves inside the app" | Bit has no documented person-to-person deep-link API. The app therefore shows who owes whom, copies the recipient's mobile number for pasting into Bit, and records a manually-ticked `paid_at`. It does not ship an undocumented `bit://` URL or claim to open a prefilled payment. No funds, credentials, or payment APIs touch the runtime. |
| 3 | Item 4, per-player reporting | `AGENTS.md`: "One authorization rule, enforced server-side" | Already the rule. This is enforcement and UI work, not a new permission model. No second permission check gets added. |
| 4 | Items 1/8/9, chip counting | `AGENTS.md`: "Money is integer agorot end to end" and "`money.ts`/`settlement.ts` are test-locked" | Denomination values are agorot integers. Chip count × denomination value is integer multiplication, done in a new `src/lib/chips.ts`. Neither `money.ts` nor `settlement.ts` is edited; `chips.ts` produces an agorot total and hands it to the existing cash-out path. |
| 5 | Item 8, two colours sharing a value | — | The denomination row, not the colour, carries the value. Colour is presentation. A chip set may contain two rows with the same value and different colours. |

## Data model additions

All money stays integer agorot.

- `chip_sets` — id, name, `owner_person_id` (null = shared preset), `is_preset`, timestamps.
- `chip_denominations` — id, `chip_set_id`, `color` (hex), `value` (agorot), `image_key`, `sort_order`. Two rows in one set may share a `value`.
- `games` — add `location` (text), `chip_set_id`, `created_by_person_id`, `notes`.
- `players` — add `table_seat` (integer, the physical chair). Distinct from `seat_order`, which stays the creation order the pot and settlement rely on. **Retired: see M5.** The column still exists; nothing reads it.
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

**M4 — transfers, Bit hand-off, paid tracking** (item 5)
`src/db/transfer-queries.ts`, `src/app/api/game/[id]/transfers/**`, settlement UI rows.

**M5 — seating** (item 10) — **retired, 2026-09-15, by the product owner.**
It shipped as a schema column, a unique index, a query, an API route and a 254-line
`PokerTable.tsx`, and no screen ever called any of it: the live table draws
`PokerTableArc`, so `table_seat` was null for every player who has ever played. All of
that is removed. The `players.table_seat` column and its unique index stay in the
database, because dropping a column is a destructive migration and nothing reads it.
Do not re-add this without being asked — the table falls back to join order on purpose.

**M6 — join flow and home CTA** (item 3)
`src/app/join/**`, `src/app/page.tsx`.

**M7 — terminology pass** (item 6)
Every user-facing Hebrew string. Text only, no logic.

**M8 — music** (item 11)
`src/app/api/playlists/**`, `src/components/MusicButton.tsx`.

**M9 — iconic hands** (item 12)
`src/app/api/game/[id]/hands/**`, `src/components/HandRecorder.tsx`, history surfacing.

**M10 — authentication and profiles** (items 2, 4)
Neon Managed Better Auth wiring (`NEON_AUTH_BASE_URL` + cookie secret, a `[...path]`
handler route, `proxy.ts` for protected paths on Next 16), `src/app/profile/**`, binding a
signed-in user to a `Person`, phone on the profile, and the server-side check that a
non-host may only write their own row. Runs last: it touches every route handler, so it
cannot run concurrently with anything else.

It also closes the hole M1 leaves behind: chip-set ownership currently trusts a
client-supplied `personId`, because outside a game there is no device-to-person mapping to
check against. A real server-side session replaces that check rather than patching it.

**2026-10-02 — per-link instant joining.** Ordinary links and room codes still require
host approval. When sharing, the actual host can turn approval off for that link only.
The server signs an invitation bound to the game's UUID; possessing a room code or
changing a query flag cannot grant instant access. The recipient must sign in, the game
must still be active, and the normal seat limit and one-initial-buy-in rule still apply.
Shared-seat members cannot issue these links on behalf of the host.

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
