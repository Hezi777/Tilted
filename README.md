<div align="center">

<img src="public/art/icon.png" width="140" alt="" />

<br />

# Tilted

**A phone-first Hebrew web app for a home poker game — who bought in, who rebought, who cashed out with what, and who owes whom at the end.**

<br />

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Neon](https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

**[Live app](https://tilted-gray.vercel.app)** · [About](#about) · [Features](#features) · [Tech stack](#tech-stack) · [Getting started](#getting-started) · [Spec](docs/poker-night-spec.md)

</div>

---

## About

Five friends put ₪50 each into a kitty, chips come out, rebuys happen all night, and at 2am
somebody has to work out who pays whom. Tilted is the ledger for that evening. It is **not a
gambling product**: no odds, no betting engine, no money moves through the app. It only ever
says who owes what.

The design decision worth knowing before reading the code is the **permission model, which is
one rule**: a phone may write a buy-in only for the player whose `device_id` matches its own,
and the host is the single exception. That is the whole authorization story — no accounts, no
login, no roles, no permissions matrix. Joining a room is a spoken 4-character code, and
identity is a UUID that lives in `localStorage` forever. The room code is explicitly *not* a
security boundary, because everyone in the living room is already trusted.

The other decision that shapes everything: **money is integer agorot end to end** (100 = ₪1).
No floats ever touch a total. Shekel input is converted once at the edge and rejected if it is
finer than an agora, and the database carries `CHECK` constraints so a negative rebuy is
refused by Postgres rather than by hopeful application code.

## Features

| | |
|---|---|
| **Shared room** | Everyone logs their own rebuys from their own phone. The host is not a data-entry clerk during his own game. |
| **One-tap rebuy** | Updates instantly and saves in the background, rolling back with an error toast if the write fails. Latency is what makes an app like this feel cheap. |
| **Undo that actually works** | A 5-second toast action, a 60-second window, and idempotency keys so a double tap, a retry, or an undo racing its own request can never duplicate or resurrect a row. |
| **Cash-out that must balance** | The game cannot be settled while counted chips differ from the pot, with three explicit ways to reconcile a difference — and the choice is recorded. |
| **Minimal transfers** | Greedy settlement, at most n−1 transfers, computed in integers and covered by property tests. |
| **WhatsApp export** | One tap copies a plain-text Hebrew summary, bidi-safe so signed amounts don't reorder inside Hebrew text. |
| **Streaks** | A flame from two consecutive wins up. Deliberately not a leaderboard: no lifetime totals, and a night you sat out neither breaks nor extends it. |
| **Installs to the home screen** | PWA manifest and icon. Works on a bad apartment connection — no runtime image API, no realtime service, just 3-second polling that pauses when the tab is hidden. |

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server routes and screens in one deploy |
| Language | TypeScript (strict) | — |
| Styling | Tailwind v4 + shadcn/ui on Radix | RTL via logical properties only; animation comes from Radix `data-state` |
| Database | Neon serverless Postgres + Drizzle | Free tier wakes from idle in milliseconds, so a monthly game never hits a paused project |
| Validation | Zod at every route, `CHECK` constraints in the schema | |
| Tests | Vitest | Money, settlement, export and streaks are pure and unit-tested |
| Hosting | Vercel Hobby | The whole thing runs at zero cost |

Fonts are Assistant for Hebrew and Satoshi for Latin and all numerals, loaded from the
Fontshare CDN because its licence does not permit self-hosting the webfont files.

## Getting started

```bash
pnpm install
cp .env.example .env.local     # add your Neon connection string
pnpm db:migrate
pnpm db:seed                   # optional: one fake 4-player game
pnpm dev
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string (pooled) |
| `DATABASE_URL_DIRECT` | Non-pooled URL, used for migrations |

### Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm verify` | typecheck → lint → test → build. The done signal for any change. |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Generate a migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Insert a fake game |

## The art

The chip characters in `public/art/` are generated by hand, once, and committed as static
assets — no image API, no key, no per-call cost, nothing to pay for at runtime. Every prompt
that produced them lives in [`public/art/manifest.json`](public/art/manifest.json), so any
single asset can be regenerated later without reconstructing context.

## Status

Built to [`docs/poker-night-spec.md`](docs/poker-night-spec.md), which remains the source of
truth. Known gaps, deliberate:

- The generated art came back as soft 3D rather than the flat vector the spec's §8.3
  originally described. The spec text was updated to match what was actually made; revert
  that section if the original direction should hold.
- §6's greedy algorithm is balance-correct and bounded by n−1, but is **not always the
  minimum** number of transfers, which Goal 1.2 promises. Greedy ships because the spec
  specifies it and its own worked example depends on it.
- No losing-streak "snowflake". §5.7 says to ship without it and ask the group first.
- No whole-shekel rounding (`round_to`). Cut from V1; everything is agorot.
