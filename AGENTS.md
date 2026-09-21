<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tilted

A phone-first web app for tracking a home poker game between friends: who bought in, who
rebought, who cashed out with what, and who owes whom at the end. A shared expense ledger,
not a gambling product — no betting engine, no money moves inside the app.

This line used to read "no odds" as well. The product owner retired that on 2026-09-19 and
the app now ships a hand-rankings sheet and an odds calculator (`src/lib/hand-ranking.ts`,
`src/lib/hand-eval.ts`, `src/lib/equity.ts`). The boundary that actually matters survived
and is the one to keep: **those tools are private, per-player, and read-only.** They take
no game data, write nothing to shared state, and never touch money. A feature that would
put an odds number into the ledger, or into anything another player sees, is still out.

## Seats may be shared

A seat is one `players` row, one stack, one settlement line. `seat_members` attaches more
than one Person to it (two friends playing as one). Two rules make it safe, and both have
already been broken once each in review:

- **`seat_members` confers seat ownership and never `players.is_host`.** Resolve a member
  through the seat's Player row and they inherit the seat's real host flag, and with it
  game rules, mismatch resolution, close/reopen/cancel and marking any transfer paid.
  `resolveSeatActor` returns `isHost: false` for a non-primary member, always.
- **Every member resolves to the same `players.id`**, so a player id can never identify
  *which* member did something, and `actor.id === playerId` is not a test for "this is the
  seat's owner". Attribution uses a Person (`cash_outs.entered_by_person_id`), and any rule
  meant for the primary occupant must compare against `players.person_id`.

A shared seat is also excluded from both members' personal money statistics — profile net,
wins, win rate, best and worst night, streak and head-to-head. It is how two people play a
night without it landing on either record. The ledger is unaffected: the seat still pays.

## Which document wins

Four documents describe this project and they do not agree. Read the section you need before
writing code, in this order — **later entries override earlier ones**:

1. `docs/poker-night-spec.md` — the original product spec. Behaviour and data. It is the
   oldest file here and parts of it are superseded; section 2 still says "no accounts or
   login", which stopped being true in v2.
2. `~/.claude/plans/read-docs-spec-md-it-is-tingly-kazoo.md` — the approved build plan, which
   settles the spec's internal contradictions. **It lives outside the repo**, so CI, a
   teammate, and any agent on another machine cannot read it. Treat anything load-bearing in
   it as needing to move into `docs/`.
3. `docs/v2-plan.md` — the settled reading of the twelve-point v2 requirements. It retires
   invariants listed below where it says so explicitly (it is what replaced "no
   authentication, ever" with the auth invariant).
4. `docs/design-system.md` — presentation and motion, and the last word on both. The spec
   and the plans still own behaviour and data unless it says otherwise.

`docs/2026-09-audit.md` is not a fifth authority — it is the record of a whole-app review:
what was found and fixed, what was deliberately not done and why, and what is still open.
Read it before proposing something that sounds obviously missing; it is probably in there
with a reason.

Do not silently resolve a new conflict between them. Say which two disagree, and ask.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui (Radix primitives,
RTL preset) · Drizzle ORM on Neon serverless Postgres · Zod · Vitest · pnpm. Deployed on
Vercel Hobby.

The whole thing must cost nothing to run. No paid API is allowed in the runtime path.

## Layout

```
src/app/            routes; game/[id] is the live screen, /api/* the route handlers
src/lib/money.ts    integer-agorot helpers and display formatting   -- hand-written
src/lib/settlement.ts  nets, greedy transfers, mismatch resolution  -- hand-written
src/lib/share-card.ts  the WhatsApp summary image; summary-text.ts is its text twin
src/db/             Drizzle schema, client, seed
src/components/ui/  vendored shadcn primitives; style them, do not police them
public/art/         committed .webp art; the prompts that made it are docs/art-prompts.md
```

## Commands

```
pnpm dev        pnpm test        pnpm db:generate   pnpm db:migrate
pnpm verify     typecheck -> lint -> test -> build. This is the done signal.
```

`pnpm verify` must pass before any commit. `DATABASE_URL` lives in `.env.local`; see
`.env.example`.

`TEST_DATABASE_URL` points at a separate Neon branch that the integration tests truncate.
**`pnpm db:migrate` only migrates `DATABASE_URL`** — run it against the test branch too
after a schema change, or those tests skip (`describe.skipIf(!hasIntegrationDb)`) rather
than fail, which is the quiet way to lose them.

## Invariants

These are the ones that are expensive to get wrong and cannot be inferred from the code.

- **Money is integer agorot end to end.** 100 = ₪1. No floats, no `toFixed` arithmetic, no
  money maths outside `src/lib/money.ts`. Format only at display time.
- **`money.ts` and `settlement.ts` are hand-written and test-locked.** Do not edit them and
  do not reimplement net or transfer logic anywhere else. If they lack something, say so.
- **A drizzle column interpolated into a `sql` template renders unqualified.**
  `` sql`... where ${buyIns.playerId} = ${players.id}` `` emits `where "player_id" = "id"`,
  and inside a subquery over `buy_ins` -- which has an `id` of its own -- Postgres binds
  both to `buy_ins` and compares a row against itself. It does not error: `sum()` returns
  NULL, `coalesce` turns it into 0, and every statistic reads zero. This shipped, and
  profile net, wins, win rate, best and worst night were all 0 because of it. Spell the
  table out (`b.player_id = players.id`) in any correlated subquery, and cover it with an
  integration test -- a `.toSQL()` assertion passes on the broken version.
- **Two aggregates compared in one query must be derived from the same row filter.** A sum
  over every row, set equal to a sum over live rows, is not the comparison it reads as.
  This is what made a night unclosable once a player who had cashed out was removed from
  the table: `closeSettlingGame` summed `cash_outs` for the whole game against buy-ins for
  live seats only, so the two sides disagreed by exactly that player's count, while
  `getCashoutState` filtered both sides and went on reporting a difference of zero.
- **One authorization rule, enforced server-side:** the signed-in Person writes only for
  their own Player row. The host is the single exception. Derive the Person from the Neon
  Auth session on every route and action; never trust a person id or device id supplied by
  the client as identity.
- **Authentication is required.** Neon Managed Better Auth with email and password is the
  only identity system. Every playable Person is bound to one auth user; do not create
  accountless guests or restore the old localStorage identity picker.
- **Rose is money, not emphasis.** `brand-*` aliases `--red-400`, which is also `--loss`
  and `--destructive`. It shipped as the app's general accent -- the winner's crown, the
  "you" badge, the live-table strip, the focus border on every amount field -- so red meant
  both "you lost" and "this matters". Violet is the accent (`--violet-300` is the only
  violet step that may carry text) and `--amber-400` is the winner, which its own comment
  in `globals.css` already reserved. Reach for one of those, never for `brand-*`.
- **RTL: Tailwind logical properties only** — `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/
  `text-start`/`text-end`. ESLint fails the build on `ml-`, `pr-`, `text-left` and friends.
- **Hebrew UI, English code.** Every user-facing string is Hebrew; every identifier,
  comment and commit message is English.
- **shadcn for every control and overlay.** Use Motion for purposeful interaction and staged
  sequences; keep Radix `data-state` animation for the primitives that already expose it.
  Every motion path must respect `prefers-reduced-motion`.
- **Check contrast against the surface, not the page.** Almost no text sits on the page, so
  a ratio measured there flatters every step by about a stop. `--text-3` is disabled-only;
  using it for meta ships text at 1.8:1 on a card. See `docs/design-system.md`.
- **Never mix a logical inset with a physical transform.** `start-1/2` flips under
  `dir="rtl"` and `-translate-x-1/2` does not, so together they land an element a full
  offset from where the maths put it. This shipped seats outside their container, and later
  a winner's crown beside the winner's head. `left: 50%` + `-translate-x-1/2` is the safe
  pair. ESLint matches the pair, not either name — neither utility is wrong alone.
- **A logical property resolves against the nearest `dir`, so an LTR island flips it.**
  A password field is `dir="ltr"` inside an RTL page: `end-*` on a button beside it
  resolves against the *page* and lands on the left, exactly where the typed text starts.
  Put the wrapper in the same direction as its input so both resolve on one axis. ESLint
  cannot see this one — the utilities are individually correct.
- **Latency is the product, and so is the database being asleep.** A tap updates local
  state immediately and persists in the background, rolling back with an error toast on
  failure; never block a tap on a round trip. But the live screen polls a one-statement
  fingerprint (`getLiveGameVersion`) and reads the full game only when it changes, backing
  off to 10s while the table is quiet. A fixed short interval keeps Neon's compute awake
  for a whole evening, and on the free plan awake time is the meter that runs out — when
  it does the database suspends and the app goes down. With no card on file nothing can
  bill; it can only stop.
