<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tilted

A phone-first web app for tracking a home poker game between friends: who bought in, who
rebought, who cashed out with what, and who owes whom at the end. A shared expense ledger,
not a gambling product — no odds, no betting engine, no money moves inside the app.

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
src/lib/export.ts   the WhatsApp summary string (spec section 7)
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

## Invariants

These are the ones that are expensive to get wrong and cannot be inferred from the code.

- **Money is integer agorot end to end.** 100 = ₪1. No floats, no `toFixed` arithmetic, no
  money maths outside `src/lib/money.ts`. Format only at display time.
- **`money.ts` and `settlement.ts` are hand-written and test-locked.** Do not edit them and
  do not reimplement net or transfer logic anywhere else. If they lack something, say so.
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
- **Latency is the product.** A tap updates local state immediately and persists in the
  background, rolling back with an error toast on failure. Never block a tap on a round trip.
