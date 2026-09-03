<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tilted

A phone-first web app for tracking a home poker game between friends: who bought in, who
rebought, who cashed out with what, and who owes whom at the end. A shared expense ledger,
not a gambling product — no odds, no betting engine, no money moves inside the app.

**`docs/poker-night-spec.md` is the source of truth.** Read the section you are working on
before writing code. It contradicts itself in a few places; every conflict and its agreed
resolution is recorded in the approved build plan at
`~/.claude/plans/read-docs-spec-md-it-is-tingly-kazoo.md`. Where the two disagree, the plan
wins — it is the spec with its conflicts already settled. Do not silently resolve a new one.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui (Radix primitives,
RTL preset) · Drizzle ORM on Neon serverless Postgres · Zod · Vitest · pnpm. Deployed on
Vercel Hobby.

The whole thing must cost nothing to run. No paid API is allowed in the runtime path.

## Layout

```
src/app/            routes; game/[code] is the live screen, /api/* the route handlers
src/lib/money.ts    integer-agorot helpers and display formatting   -- hand-written
src/lib/settlement.ts  nets, greedy transfers, mismatch resolution  -- hand-written
src/lib/export.ts   the WhatsApp summary string (spec section 7)
src/db/             Drizzle schema, client, seed
src/components/ui/  vendored shadcn primitives; style them, do not police them
public/art/         hand-generated PNGs + manifest.json of the prompts that made them
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
- **One authorization rule, enforced server-side:** a phone writes only for the player whose
  `device_id` matches the `x-device-id` header. The host is the single exception. There is no
  other permission check anywhere, and no more should be added.
- **No authentication, ever.** No Clerk, NextAuth, Supabase Auth, passwords, emails or
  sessions. Identity is a `device_id` in localStorage and a name picked off a roster.
- **RTL: Tailwind logical properties only** — `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/
  `text-start`/`text-end`. ESLint fails the build on `ml-`, `pr-`, `text-left` and friends.
- **Hebrew UI, English code.** Every user-facing string is Hebrew; every identifier,
  comment and commit message is English.
- **shadcn for every component**, and animation comes from Radix `data-state`, which those
  primitives already wire up. Never add an animation library — `framer-motion` in
  particular is prohibited.
- **Latency is the product.** A tap updates local state immediately and persists in the
  background, rolling back with an error toast on failure. Never block a tap on a round trip.
