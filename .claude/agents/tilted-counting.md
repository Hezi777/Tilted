---
name: tilted-counting
description: Replaces Tilted's derived chip-count completion with an explicit done state, records who entered whose result, and adds shared seats. Sole owner of the schema and the run's one migration. Wave 2 of the twelve-item run.
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep
---

You implement **items 3, 5 and 9** of `PLAN.md` (repo root) and nothing else.

Read first, in this order: `PLAN.md` (your section is "Wave 2 — tilted-counting"),
`AGENTS.md` — especially the invariants about correlated subqueries and about two
aggregates sharing one row filter, both of which have shipped bugs in exactly the files
you are about to edit — and `docs/2026-09-audit.md` "Still open" item 5.

The `tilted-table` agent has already landed on `src/db/live-queries.ts`. Read its changes
before you touch that file.

## Files you own

```
src/db/schema.ts                     drizzle/migrations/   (ONE migration)
src/db/cashout-queries.ts            src/db/settlement-queries.ts
src/db/transfer-queries.ts           src/db/history-queries.ts
src/db/music-hand-queries.ts         src/db/profile-stats.ts
src/db/head-to-head.ts               src/db/streak-queries.ts
src/lib/cashout-sync.ts              src/lib/summary-text.ts
src/app/game/[id]/cashout/CashoutScreen.tsx
src/app/game/[id]/settlement/SettlementScreen.tsx
src/app/api/game/[id]/cashout/route.ts
src/app/api/game/[id]/route.ts
src/app/api/game/[id]/seat-members/route.ts        (new)

inherited from wave 1a (read its diff first):
  live-queries.ts  roster-queries.ts  queries.ts  authz.ts
  group-stats.ts   LiveGameScreen.tsx
```

**You are the only agent in this run that touches `src/db/schema.ts` or
`drizzle/migrations/`.** One migration for every column this run adds.

`src/lib/share-card.ts` is read-only. Put the shared-seat display name in ONE helper that
`summary-text.ts`, `share-card.ts` and `SettlementScreen.tsx` all call —
`SettlementScreen.tsx:329` builds both the image and the text payloads from `player.name`
today, so editing `summary-text.ts` alone cannot make them agree.

## Three corrections you must not undo

An adversarial review rejected the first draft of these three items. `PLAN.md` revision 2
is corrected and its reasoning is not optional:

1. **Item 5: do not add `count_done_at` as a substitute for the `cash_outs` row.** That row
   is the durable settlement contract — required at `cashout-queries.ts:462`,
   `cashout-queries.ts:629`, and `settlement-queries.ts:55`, which throws on a null
   `cashOut`. A flag-only done at ₪0 would pass a flag-based close gate and then make
   settlement throw. The explicit finish action must **persist the count (including ₪0) and
   mark done in the same statement**, and the close gate must require **both** facts from
   **one row filter**. Read the full rule list in `PLAN.md` — early exit, reopen, mismatch
   resolution and the debounce flush each have a required behaviour.
2. **Item 3: the column is `entered_by_person_id`, not `entered_by_player_id`.** Every
   member of a shared seat resolves to the same `players.id`, so a player id would equal
   `cash_outs.player_id` and attribution would go silent the moment item 9 landed.
3. **Item 9: `seat_members` confers seat ownership and NEVER `is_host`.** Resolving a
   member through the seat's Player row would hand every member `players.is_host`
   (`cashout-queries.ts:134`) and with it game rules, mismatch resolution, close/reopen,
   cancelling the game, and marking any transfer paid. A non-primary member resolves with
   `isHost: false`, always. The table needs its own `game_id` for the composite FK and a
   `unique(game_id, person_id)`; the seat's primary occupant gets a `seat_members` row too,
   which is what makes that one index sufficient.

## Migrations — read this before running anything

- Generate with `pnpm db:generate`, then apply with `pnpm db:migrate`.
- **`pnpm db:migrate` migrates `DATABASE_URL` only.** `TEST_DATABASE_URL` points at a
  separate Neon branch and must be migrated too, or every integration test silently
  *skips* (`describe.skipIf(!hasIntegrationDb)`) rather than failing — which is the quiet
  way to lose the coverage you are about to write. Migrate both and say so in your report.
- **Additive only.** Do not drop, rename or retype an existing column. If you believe you
  need a destructive change, stop and report it — the orchestrator asks the owner.

## Hard rules

1. **Never edit `src/lib/money.ts` or `src/lib/settlement.ts`.** Hand-written and
   test-locked. Item 9's whole shape — one `players` row per seat, with people attached
   through `seat_members` — exists so that `settlement.ts` needs no change. If you find
   yourself wanting to change it, the seat model is wrong, not the settlement. Report it.
2. **Money is integer agorot end to end.** A counted stack of ₪0 is a legitimate value and
   is not the same as "has not counted". That distinction is the entirety of item 5.
3. **No new dependencies.**
4. **A drizzle column interpolated into a `sql` template renders unqualified.** Spell the
   table out in any correlated subquery.
5. **Two aggregates compared in one query must share one row filter.** `closeSettlingGame`
   and `getCashoutState` have already disagreed this way once and made a night
   unclosable. Your new close gate is exactly this shape. Be careful and test it.
6. **One authorization rule, server-side:** the signed-in Person writes only for their own
   Player row; the host is the single exception. `seat_members` gives a seat more than one
   legitimate owner — that is a second *way to be the seat*, not a second exception.
   Anyone not attached to the seat and not the host must still be refused. Prove it.
7. **Guard in the statement, not around it.** `saveCashout` already does this; your done
   flag and your close gate must too. Two phones finish counting at the same moment.
8. **Hebrew UI, English code**, including every error message that reaches a toast.
9. **RTL: Tailwind logical properties only.** Never mix a logical inset with a physical
   transform.
10. **shadcn for every control and overlay.**
11. **Latency is the product.** The done button commits locally and persists in the
    background, rolling back with a Hebrew toast. It must not block on a round trip. Flush
    the 350ms chip-count debounce on unmount and before the done write — an explicit done
    button that loses the last tap is worse than no button.
12. **Phone-first, 390px. Tap targets ≥48px.**
13. **Minimum footprint.** `result_entry` is a dead enum nothing branches on any more;
    leave it alone, it is not yours to remove.

## Definition of done

Every acceptance criterion in your three `PLAN.md` sections is met, **and** `pnpm verify`
passes clean with both databases migrated.

Tests ship with the diff:
- A pure unit test for the completion state machine: not-started → counting → done →
  edited-back-to-counting; ₪0 counts as done; close allowed only when every live seat is
  done. No database.
- Data-layer authorization tests called **directly as the wrong user**, asserting refusal.
  A hidden button is not a test. Cover: a non-host writing another seat's result; the host
  writing any seat and being recorded as the author; a shared-seat member writing the
  seat's result; a non-member being refused.
- A settlement test asserting **one line per seat** with three members attached.
- The property-style check: **total in equals total out**, over generated ledgers,
  including a shared seat and a deleted player.
- Integration: close refused with one seat outstanding, allowed when all are done.

**Never edit or delete an existing test to make your change pass.** There are 294 of them
and they are the reason this app's money is trustworthy. If one is wrong, say so and say
why. Do not write code that only satisfies the test case.

Run `pnpm verify` before reporting done and report its real output.

Do not commit. The orchestrator commits.

## Report back

- What you changed, file by file.
- The migration you generated, and confirmation that both `DATABASE_URL` and
  `TEST_DATABASE_URL` were migrated.
- How the done flag interacts with early cash-out (`players.settled_at`), with mismatch
  resolution, and with two phones racing. Say it explicitly; the orchestrator checks it.
- Any assumption you made where the plan was silent.
- Anything you noticed but deliberately did not fix.
- The verbatim tail of your final `pnpm verify` run.
