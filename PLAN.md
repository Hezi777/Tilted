# Plan — twelve items, one run

Branch `ux-pass-2026-09`. Baseline before any change: `pnpm test` → 37 files, 294 tests,
all passing (integration included; `TEST_DATABASE_URL` is set in `.env.local`).

**Revision 2.** The first draft was reviewed adversarially by Codex against the code and
came back "not safe to execute as written". Three of its five root causes pointed at dead
or wrong code, and four workstream boundaries were unachievable. What follows is the
corrected plan; a section at the end records where the review was accepted, where it was
argued down, and why.

## What the brief assumed, and what the code actually says

The brief was written against an older picture of this app. Corrections, all verified
against the code:

1. **Item 3 is already enforced server-side.** `assertCanEnterResult` (`src/lib/authz.ts`)
   restricts a result write to the actor's own seat with the host as the single exception,
   and `saveCashout` (`src/db/cashout-queries.ts`) calls it and repeats the guard inside a
   status-conditional SQL statement so a race cannot slip past it. `src/lib/authz.test.ts`
   covers it. What is **not** done is the second half of the ask: "any edit to someone
   else's number should be visible as such, not silent." `cash_outs` records no author.
   That is what ships.

2. **Item 4 is already scoped at the query level.** `/api/group` → `loadGroupStats` and
   `/api/people` → `getPeopleWhoPlayedWith` both restrict to games the viewer sat at. The
   residual leak is one missing predicate — `loadGroupStats` omits
   `people.user_id IS NOT NULL` (`src/db/group-stats.ts:76`), so legacy accountless rows
   surface as crew. That is what ships.

3. **Item 6's cap is not ten.** `createGame` caps at `AVATAR_KEYS.length`
   (`src/db/queries.ts:225`, `src/app/api/games/route.ts:17`), and `AVATAR_KEYS` is 10
   reserved + 6 open + 12 legacy = **28**. So the cap exists and is roughly three times the
   number of seats the table can draw.

Two conflicts were put to the product owner and answered:

- **Item 8 vs `AGENTS.md`'s "no odds, no betting engine".** Owner's call: **build the
  calculator and amend `AGENTS.md`**. It stays private and per-player and writes nothing
  to shared game state, which is what keeps the rest of that sentence true.
- **Item 9 vs the identity model.** Owner's call: **one `players` row with N people
  attached through a new `seat_members` table.** One seat, one stack, one settlement line.

## Grouping, and why it is not the brief's grouping

The brief's split puts items 1–4 in one agent and 5, 6, 9 in another. That cannot run:
both halves need `src/db/live-queries.ts`, `src/lib/authz.ts`,
`src/app/game/[id]/LiveGameScreen.tsx`, `src/db/schema.ts` and `drizzle/migrations/`.

Regrouped by file ownership. **Ownership is exclusive within a wave, and inherited across
waves** — waves are sequential, so a file owned by wave 1a and needed by wave 2 is handed
over, not contested. The only parallel pair is 1a ‖ 1b, and 1b shares nothing with anything.

Exactly one agent owns `src/db/schema.ts` and `drizzle/migrations/`, and it writes one
migration containing every column this run adds.

Off limits to every agent: **`src/lib/money.ts` and `src/lib/settlement.ts`** —
hand-written, test-locked, and no net or transfer logic may be reimplemented elsewhere.

---

## Wave 1a — `tilted-table` (items 1, 2, 4, 6)

**Files owned**

```
src/db/live-queries.ts
src/db/roster-queries.ts
src/db/queries.ts
src/db/join-request-queries.ts
src/db/group-stats.ts
src/lib/authz.ts
src/lib/seat-layout.ts
src/components/ChipAvatar.tsx
src/components/PokerTableArc.tsx
src/components/PokerTableArcSkeleton.tsx
src/app/game/[id]/LiveGameScreen.tsx
src/app/api/games/route.ts
src/app/api/group/route.ts
src/app/api/game/[id]/players/route.ts
src/app/api/game/[id]/players/[playerId]/route.ts
src/db/test-support/**            (the two-client harness)
```

### Item 1 — avatar visibility. The first draft's cause was wrong

The draft blamed `addLivePlayer` (`live-queries.ts:654`) for assigning
`firstAvailableAvatarKey` and minting accountless `people` rows. **`addLivePlayer` has no
callers.** It is dead. Every reachable seating path already calls `avatarKeyForPlayer`:
`createGame` (`queries.ts:277`), `joinGameByCode` (`roster-queries.ts:194`),
`addPlayerToGame` (`roster-queries.ts:441`). The draft also misread `schema.ts:195` — the
documented fallback is for the four chip columns, not `avatar_key`; `players.avatar_key`
is a deliberate per-table snapshot (`schema.ts:127`).

What is actually true, and is enough to produce the reported symptom:

- **`claimPlayer` writes the seat and never the person.** `roster-queries.ts:118` sets
  `players.avatar_key` to the character the claimer picked, but never updates
  `people.avatar_key`. The choice is per-table and evaporates; the next game seats them
  from the stale profile key again.
- **The live fingerprint does not hash `people`.** `getLiveGameVersion`
  (`live-queries.ts:191`) covers games, buy-ins and players only, so any avatar change
  that lives on `people` is invisible to other phones until the 30s safety refresh
  (`useLiveGame.tsx:51`). Across two devices that reads exactly as "they don't see it".
- **The custom chip is dead schema.** `people.chip_body`/`chip_edge`/`chip_spots`/
  `chip_initials` and their `players` twins are **written nowhere and read nowhere** —
  only a type declaration at `ProfileScreen.tsx:69` mentions them. `ChipAvatar`
  (`ChipAvatar.tsx:20`) takes an avatar key and cannot render a chip. If "set a character"
  means the chip editor, nothing downstream could ever show it.

**Approach.** Because three mechanisms can produce one symptom, **reproduction comes
first**: build the two-client harness (below) and drive two sessions against one room
until the reported failure is observed. Report which mechanism it was *before* fixing.
Then fix that one, plus the two that are defects regardless: propagate a claim's character
choice to `people.avatar_key`, and extend the fingerprint so a seat's rendered identity
cannot go stale on another phone.

The dead chip columns are **reported, not built on**. Wiring a chip renderer is a feature,
not this item, unless reproduction proves it is the cause.

**DoD.** The reproduced failure no longer reproduces, proven with two clients. A character
chosen at a table is the person's character afterwards. A change to a seat's rendered
identity reaches the other phone through the fingerprint, not the 30s fallback.

**Tests.** Two-client integration: client A changes the avatar, client B observes it
without waiting for the safety refresh. A unit test that the fingerprint changes when the
rendered identity changes.

### Item 2 — delete player. Three gates, not one

The draft found one. There are three, and fixing only the first changes nothing:

1. `assertCanManageRoster` is active-only (`authz.ts:234`).
2. The mutation independently requires `g.status = 'active'` (`live-queries.ts:714`).
3. **The UI cannot reach it at all**: `LiveGameScreen` redirects to cash-out the moment
   status becomes settling (`LiveGameScreen.tsx:89`), and `CashoutScreen` has no
   roster-removal control.

The genuine, already-correct behaviour: the delete soft-deletes the seat and its buy-ins
in one statement and refuses a seat that already has a `cash_outs` row — the "money in the
game" decision the brief asks for is made, and made correctly. The one clear defect is
`live-queries.ts:757` throwing `new Error("game_not_active")`, whose English identifier
the route pipes straight into a Hebrew toast.

**Approach.** Fix the message: throw `AuthzError("game_not_active")`, which already carries
the Hebrew string and the 409. Widen all three gates together — the assertion, the SQL
predicate, and a roster-removal path reachable while settling — or widen none of them. A
DoD that the UI cannot reach is not done.

**DoD.** Every delete failure surfaces a Hebrew sentence naming the reason. A host can
remove a seat that has not counted out, in `active` **and** `settling`, **from the screen
they are actually on**. A seat that has counted out cannot be removed in either.

**Tests.** Data layer, called directly as the wrong user: non-host → `not_host`; seat with
a cash-out → `player_settled`; seat with buy-ins and no cash-out → soft-deleted, buy-ins
soft-deleted, settlement still balances. Plus a settling-status delete test, which is the
one the current code would fail.

### Item 4 — crew leak

The missing predicate at `group-stats.ts:76` is real and the fix is a query-level
`isNotNull(people.userId)`, matching `getPeopleWhoPlayedWith`. The draft's stated *source*
was wrong: these ghosts are legacy rows, not rows the running app creates — account-backed
creation already requires a non-null user (`roster-queries.ts:431`) and first-login
identity supplies one (`identity-queries.ts:155`). So this is a filter, not a leak being
actively fed. Existing ghost rows stay in the database; a backfill is destructive and
needs the owner.

**DoD.** The crew list contains only people with an account who shared a closed night with
the viewer. **Tests.** Integration: two viewers, disjoint games, neither sees the other's
people; a ghost row is excluded.

### Item 6 — seat count

Two separate things, and the draft got the cap wrong.

**The cap.** It exists, at `AVATAR_KEYS.length` = 28, in `queries.ts:225` and
`api/games/route.ts:17` — creation only. Growth after creation funnels through
**`addPlayerToGame`** (`roster-queries.ts:437`), which both join approval
(`join-request-queries.ts:255`) and direct host addition (`api/game/[id]/players/route.ts:21`)
call. `addLivePlayer` is dead and capping it would do nothing.

**The layout.** `docs/2026-09-audit.md` open item 7, confirmed: seats no longer overlap,
but past seven players the arc's per-seat button falls under the 48px floor, and no width
fixes it — ten 44px targets need more span than a 390px screen has.

**Approach.** Export `MAX_SEATS = 10` from `src/lib/seat-layout.ts`; enforce it at
creation (both sites) and in `addPlayerToGame`, in the statement rather than around it,
with a Hebrew refusal. The arc holds to seven seats; at eight and above the same seats
render as a two-column list on the same felt — same avatars, same amounts, targets back
over 48px. This is the product decision the audit said was needed. `addLivePlayer` is
reported as dead code, not deleted.

**DoD.** At `MAX_SEATS` on 390px every seat is visible and every target ≥48px. An eleventh
player is refused at creation, at the door, and by hand, in Hebrew.

**Tests.** `seat-layout.test.ts`: for every count 2..MAX_SEATS, the derived target never
drops below 48px in whichever mode that count selects. Integration: an eleventh player
refused through `addPlayerToGame`, through join approval, and at creation.

### The two-client harness (wave 1a builds it; every later wave uses it)

The brief requires proving cross-device behaviour, and item 1 cannot be diagnosed without
it. Build it as **two direct clients at the data layer** against `TEST_DATABASE_URL` —
not a browser — because every claim to be proven is a data-layer claim and a browser
harness would add a dependency and a flake source for nothing.

It must prove, as tests: an avatar set by one client is visible to the other; a player
cannot edit another player's chips; a non-host cannot delete; and (after wave 2) both
members of a shared seat see the same stack.

---

## Wave 1b — `tilted-tools` (items 7, 8)

Unchanged from the first draft; Codex raised nothing against it, and it shares no file
with anything. Runs in parallel with 1a from the start. Every file is new.

```
src/lib/hand-ranking.ts   + test      src/components/HandRankingsSheet.tsx
src/lib/hand-eval.ts      + test      src/components/OddsCalculator.tsx
src/lib/equity.ts         + test
```

Reads but never edits `src/lib/cards.ts`, `src/components/CardPicker.tsx`,
`src/components/PlayingCard.tsx` — the deck, the tap-only picker and the card face already
exist and `HandRecorder` already uses them.

**It mounts nothing.** `LiveGameScreen.tsx` belongs to waves 1a and 2 first; `tilted-feel`
mounts both sheets in wave 3.

- **Item 7** — ten rankings, Hebrew names, five-card example each drawn with the existing
  `PlayingCard`, in a shadcn `Drawer`. All ten on one sheet at 390px, no paging. **DoD:**
  one tap to open, one tap or swipe to close, readable at arm's length, no new dependency.
  **Tests:** ten entries, strictly descending, and every example hand evaluating to its own
  ranking through `hand-eval.ts` — the cross-check that stops the chart and the calculator
  drifting.
- **Item 8** — `hand-eval.ts` is a 7-card evaluator returning a comparable score;
  `equity.ts` is seeded Monte Carlo over hole cards + 0–5 board + 1–9 unknown opponents.
  Iteration count chosen for ~150ms on a phone; the tolerance that follows is asserted
  explicitly. Input by tap only. **DoD:** correct for what it claims, writes nothing
  shared, no network, no new dependency. **Tests:** known published equities within
  tolerance, plus the anchor — pocket aces heads-up preflop ≈ 85%. `hand-eval.ts` gets
  exhaustive unit tests including the wheel straight and best-five-of-seven.

---

## Wave 2 — `tilted-counting` (items 3, 5, 9)

Runs after wave 1a and inherits every file 1a touched that it needs. **Sole owner of
`src/db/schema.ts` and `drizzle/migrations/`; writes one migration for the whole run.**

**Files owned**

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
inherited from 1a: live-queries.ts, roster-queries.ts, queries.ts, authz.ts,
                   group-stats.ts, LiveGameScreen.tsx
```

`src/lib/share-card.ts` is read-only. The shared-seat display name comes from one helper
that `summary-text.ts`, `share-card.ts` and `SettlementScreen.tsx` all call, so the image
and the text cannot disagree — `SettlementScreen.tsx:329` builds both payloads from
`player.name` today, which is why editing `summary-text.ts` alone would not be enough.

### Item 5 — chip-count completion. Corrected approach

**Direct cause** (Codex's framing, and it is one level truer than the draft's): an
untouched `ChipCounter` never invokes `onChange` — it emits only from `setCount`
(`ChipCounter.tsx:102`) — so a player who counts ₪0, or opens the screen and changes
nothing, never reaches `saveCashout`, never gets a `cash_outs` row, and
`CashoutScreen.tsx:396` (`missing = players.some(p => p.cashOut === null)`) blocks the
close forever. Adding a chip and removing it fires two changes. The flag is derived from a
change event instead of from an intent, exactly as the brief says.

**The draft's fix was dangerous and is withdrawn.** A `count_done_at` flag *alongside* the
row would create two competing truths, because the `cash_outs` row is not an accidental
completion marker — it is the durable settlement contract, required at three places:
mismatch resolution (`cashout-queries.ts:462`), closing (`cashout-queries.ts:629`) and
settlement itself, which throws on a null `cashOut` (`settlement-queries.ts:55`). A
flag-only "done" at ₪0 could pass a flag-based close gate and then make settlement throw.

**Corrected approach.** Keep the row invariant. An explicit "סיימתי לספור" button
**persists the count — including ₪0 — and marks completion in the same statement**, through
the existing `saveCashout` path. `players.count_done_at` is added as the *intent* record,
never as a substitute for the row, and the close gate requires **both**: every live seat
has a `cash_outs` row **and** every live seat is marked done. Both predicates read from
one row filter, inside the same game-row serialization `saveCashout` already uses.

Required rules, each of which Codex showed the draft had left undefined:

- **Clearing on edit is in the same statement as the edit.** A separate
  `UPDATE players SET count_done_at = NULL` leaves a window where close sees the new
  amount with done still set.
- **Early cash-out marks done.** It writes result and `settled_at` atomically
  (`cashout-queries.ts:357`); if it does not also complete, a departed player blocks the
  close forever. A host override of a frozen result must not clear it — the departed
  player cannot come back to reconfirm.
- **Reopening resets done.** `reopenSettlingGame` preserves counts
  (`cashout-queries.ts:567`); if play resumes and new buy-ins land, stale done flags must
  not survive into the next pass. Early-settled seats are the exception.
- **Mismatch resolution checks completion, not row existence** (`cashout-queries.ts:462`),
  or the host allocates a gap over unconfirmed drafts. It also reads the ledger before
  taking its game lock (`cashout-queries.ts:498`) — that ordering is in scope here.
- **The debounce must become flushable.** `chipSaveTimers` (`CashoutScreen.tsx:99`) stores
  timeout handles only, not the payload, and cleanup merely cancels
  (`CashoutScreen.tsx:137`); an async request started during unmount cannot be awaited. The
  done action must cancel the timer, persist the exact current value, and mark *that*
  persisted value done atomically. This closes `docs/2026-09-audit.md` open item 5.

**DoD.** A player who counts ₪0 can finish. The table sees who it is waiting on, by name.
An edit after done re-opens that player. No path closes a night that settlement would then
refuse to render.

**Tests.** A pure state-machine unit test (not-started → counting → done →
edited-back-to-counting; ₪0 is done). Integration: close refused with one seat outstanding;
allowed when all are done; **a close never succeeds in a state where `loadSettlement` would
throw** — that is the regression this item could otherwise introduce. Early-exit, reopen
and mismatch cases each get a test. A debounce-flush test.

### Item 3 — attribution

The rule is enforced; the authorship is not recorded.

**Corrected column: `cash_outs.entered_by_person_id`, not `entered_by_player_id`.** Codex
is right that a player id cannot distinguish members of a shared seat — every member
resolves to the same `players.id`, so `entered_by_player_id` would equal
`cash_outs.player_id` and item 3 would go silent again the moment item 9 landed. The
Person comes from the session, which is the only identity this app trusts anyway.

**DoD.** Every result row records who wrote it. A number entered by anyone other than the
seat's own occupant is labelled in Hebrew wherever it is shown — cash-out screen and
settlement. The authorization rule itself is unchanged.

**Tests.** Data layer, as the wrong user: a non-host writing another seat's result is
refused (`not_your_seat`); the host writing any seat succeeds and is recorded as the host's
Person; a player writing their own is recorded as themselves; a shared-seat member is
recorded as *that member*, not as the seat.

### Item 9 — shared seat. Corrected shape

**Table.** `seat_members(id, game_id, player_id, person_id)`, with:
- a composite foreign key on `(player_id, game_id)` → `(players.id, players.game_id)`,
  which is why `game_id` must be on the row — the draft omitted it and the stated FK was
  not constructible;
- **`unique(game_id, person_id)`**, which is what stops one Person holding two seats at one
  table and the actor lookup returning two rows and picking one arbitrarily.

To make that one index sufficient, **`seat_members` is the single source of seat
membership**: the seat's primary occupant (`players.person_id`) also has a row. Without
that, uniqueness would have to span `players.person_id` and `seat_members` at once, which
independent indexes cannot express.

**Authorization — the escalation Codex found, and the rule that prevents it.** Resolving a
member through the seat's Player row would hand every member `players.is_host`
(`cashout-queries.ts:134`), and with it game rules (`queries.ts:418`), mismatch
resolution, opening/closing/reopening settlement, cancelling the game
(`history-queries.ts:207`), marking any transfer paid (`transfer-queries.ts:176`) and
overriding frozen early-exit results (`cashout-queries.ts:412`).

**Rule: `seat_members` confers seat ownership and never `is_host`.** An actor resolved as a
non-primary member gets `isHost: false`, always. Host remains the seat's primary occupant
alone. The single authorization rule gains a second way to *be the seat*, not a second
exception.

`getRosterContext` (`roster-queries.ts:391`) resolves separately and still matches
`players.device_id`; it must be brought to the same resolution or shared members would be
seat-owners for settlement and strangers for roster actions. Same for the live rebuy actor
(`live-queries.ts:148`), the "you" marker (`live-queries.ts:295`), and read access, which
rejects non-primary members in `isSeatedInGame` (`queries.ts:353`) before anything else
runs.

**Membership route authorization**, which the draft left undefined: the host or the seat's
primary occupant may attach a Person; an attached Person may detach themselves; nobody
else may do either. Enforced in the insert and delete statements, not in the UI.

**Read model.** History (`history-queries.ts:58`), group stats (`group-stats.ts:48`),
hand/music access (`music-hand-queries.ts:64`), profile, streak and head-to-head all
attribute a whole seat to `players.person_id`. Leaving them hides the night from attached
members; joining naively duplicates the full seat result across several people. **Decision:
a shared seat's money is attributed to its primary occupant only; attached members see the
night in their history but carry none of its money.** One seat, one line, one person's
ledger — which is the only reading that keeps totals summing.

**Payment hand-off.** `transfer-queries.ts` derives one phone from `players.person_id`; a
shared creditor is paid through the primary occupant. Stated so nobody has to guess.

**DoD.** Two or more names on one seat. Every member sees and can act on the same stack, at
the live table and at cash-out. No member gains host powers. One settlement line per seat
regardless of member count. The WhatsApp text and the share image name it identically.

**Tests.** Codex is right that passing a shared seat to `settlement.ts` would be a vacuous
test — that function never sees `seat_members`. The real tests are on the read model:
- integration, proving the read model yields **exactly one ledger and one transfer
  identity** from three members;
- the property-style check the brief asks for — **total in equals total out** — over
  generated ledgers, including a shared seat and a deleted player;
- a member may write the seat's result; a non-member may not;
- **a member of the host's seat is refused every host action** — the escalation test.

---

## Wave 3 — `tilted-feel` (items 10, 11, 12)

Last: it touches almost every component and mounts wave 1b's sheets.

```
src/app/layout.tsx                   src/app/globals.css
src/components/AppHeader.tsx         src/components/shell/TabBar.tsx
src/components/shell/LiveSessionBar.tsx   src/components/NotificationsBell.tsx
src/app/history/HistoryFilters.tsx   src/app/history/HistoryScreen.tsx
src/app/group/GroupScreen.tsx        src/lib/motion.ts
inherited from wave 2: LiveGameScreen.tsx, CashoutScreen.tsx, SettlementScreen.tsx
```

`docs/design-system.md` is binding. Art direction does not drift: violet is the accent,
`--amber-400` is the winner, rose/`brand-*` is money and destructive only.

- **Item 10** — method is measurement, not guesswork: `pnpm dev`, Playwright at 390×844,
  signed in, walk join code → live table → rebuy → count → settle → WhatsApp summary, and
  record findings with file and line **before** changing anything. Already ruled out, do
  not re-walk: the tab bar is `fixed` and every screen clears it with
  `pb-[calc(5.5rem+env(safe-area-inset-bottom))]`; and all fourteen `safe-area-inset` call
  sites are additive `calc()`, already measured and closed in the audit. One live candidate
  to measure first: `LiveSessionBar` renders above `{children}` in document flow gated on
  `usePathname()` — the shape that produces a first-paint jump.
  **DoD:** no layout shift on first paint, measured; nothing overlapping or unreachable at
  390px; targets ≥48px; keyboard does not cover its own field; scroll containers do not trap.
- **Item 11** — `HistoryFilters.tsx` and `GroupScreen.tsx`'s search. Layout, active state,
  narrow-screen behaviour, clearing. Active state needs a **second channel besides colour**
  (WCAG 1.4.11) — the tab bar already does this with a pill. One-handed at 390px is the bar.
- **Item 12** — `src/lib/motion.ts` already holds the vocabulary (`EASE_OUT`, `DUR`,
  `SPRING`, `rise`, `stagger`, `bump`, `motionSafe`), with `bump` sitting unused and
  commented as "the answer when they stop [snapping]". Apply it; do not invent a second
  system. Three moments only: **chips changing** (`bump` on the amount that moved), **a
  player finishing their count** (wave 2's flag is the trigger), **the settlement reveal**
  (staged `stagger` down the transfer list). Everything through `motionSafe()`. Nothing
  delays a tap.
  **Tests:** `motionSafe` collapses every new variant; no new path bypasses it.

Wave 3 also writes **`TESTING.md`**: a five-minute phone checklist covering no layout shift
or navbar jump on first paint, nothing overlapping or unreachable at 390px, filters and
search one-handed, animations not delaying taps, and the full happy path from join code to
WhatsApp summary. Concrete steps, pass/fail each.

---

## Dependency order, and the reason

```
wave 1:  tilted-table  ‖  tilted-tools      (parallel — 1b shares no file with anything)
wave 2:  tilted-counting                     (inherits 1a's files; sole schema owner)
wave 3:  tilted-feel                         (inherits wave 2's screens; mounts 1b)
```

- **1a ‖ 1b** is the only real parallelism the file graph allows. 1b writes only new files.
- **2 after 1a** because it inherits `live-queries.ts`, `roster-queries.ts`, `queries.ts`,
  `authz.ts` and `LiveGameScreen.tsx`, and because item 9's seat model has to sit on top of
  item 1's corrected identity and item 2's corrected gates.
- **3 last** because it inherits three screens waves 1 and 2 rewrite, and because mounting
  1b's sheets requires 1b to have landed.
- **`src/db/schema.ts` and `drizzle/migrations/` are wave 2's alone.** Two agents numbering
  migrations into one directory in parallel is the collision that is expensive to unpick.

## Wave 1 outcome (recorded as built, not as intended)

Both wave-1 agents landed. Suite verified by the orchestrator, alone, after both:
**44 files, 328 tests, all passing** (baseline 294). The 7 failures wave 1b reported were
two concurrent `pnpm verify` runs truncating one shared `TEST_DATABASE_URL` branch — an
orchestration error, not a defect. Waves 2 and 3 are sequential, so it cannot recur.

**Item 1's mechanism, established by reproduction, not by reading.** Of the three
candidates, it was **the fingerprint gap**. `getLiveGameVersion` hashed `count`,
`deleted_at`, `settled_at` and `count(device_id)` — never `avatar_key`. A *first* claim
happens to move `count(device_id)` 0→1 and is caught; **re-picking a character on a seat
that is already claimed moves nothing in the hash**, so the other phone stayed on the old
face until the 30s safety refresh. Fixed by folding
`string_agg(avatar_key, ',' ORDER BY id)` into the players CTE. `claimPlayer` never
writing `people.avatar_key` was confirmed as a real but *separate* defect — it costs the
next game, not this one — and was fixed too.

**Deviation accepted:** rather than widening the shared `assertCanManageRoster`, wave 1a
split out `assertCanRemoveRoster` (host-only, `active` **and** `settling`) and left adding
and releasing at `active`-only. Widening the shared predicate would also have let
`addPlayerToGame` seat new players during settling, which nothing asked for. Better than
the literal instruction.

**Item 6's cap moved 28 → 10** at both creation sites and is now enforced in-statement in
`addPlayerToGame`, which is the funnel both the door and the host's own hand pass through.

## Carried into later waves

1. **Item 2, gate 3, is not done.** Wave 1a completed the two backend gates and tested
   them; the UI gate is unreachable from its file list. `LiveGameScreen` redirects to
   cash-out the moment status becomes `settling` (`LiveGameScreen.tsx:89`), and
   `CashoutScreen.tsx` — where the host actually lands — has no roster-removal control and
   belongs to wave 2. **Wave 2 must add a delete-seat affordance to `CashoutScreen.tsx`**
   calling the existing `DELETE /api/game/[id]/players/[playerId]`, which now works
   correctly during `settling`. Item 2 is not done until it does.
2. **`focus-visible:ring-brand-300` in `PokerTableArc.tsx`**, at lines 213 and 329. Line
   329 is pre-existing; line 213 is a copy of it into wave 1a's new list branch. `brand-*`
   aliases `--red-400` and the invariant is that rose is money and destructive only, never
   emphasis — a focus ring is emphasis. **Wave 3 fixes both**, to violet, as part of item
   10. Recorded rather than patched mid-wave so one agent owns the colour pass.

## Wave 2 outcome

Landed after a mid-run session rate limit killed the agent and it was resumed. Suite
verified by the orchestrator, alone: **46 files, 360 tests, all passing**. Both
`DATABASE_URL` and `TEST_DATABASE_URL` migrated with `0016_daily_blackheart.sql`;
confirmed the new integration file actually runs its 16 tests rather than skipping.

**One repair by the orchestrator.** The agent died mid-edit leaving a SQL comment inside
a `sql` template literal that contained backticks, terminating the literal and breaking
typecheck. Backticks removed; nothing else touched.

**An escalation bug the agent found and fixed in its own work**, worth recording because
it is the exact hazard the plan was written against: `getLiveGame` derived `viewerIsHost`
from `isYou && seat.isHost`, which is true for *any* member attached to the host's seat.
Now derived from `resolveSeatActor`, whose member branch does not even select `is_host`
and returns `isHost: false` unconditionally.

All three item-5 interaction rules are implemented and stated: early cash-out always marks
done in the same statement as the frozen result; `reopenSettlingGame` clears `count_done_at`
for live non-frozen seats atomically with the status flip; `applyMismatchResolution` checks
`countDoneAt` rather than row existence; and the close gate is one `NOT EXISTS` requiring
both a `cash_outs` row and `count_done_at` per live seat, under the same row lock.

## Carried into wave 3 (second round)

3. **Item 9 has no way to create a shared seat.** `POST /api/game/[id]/seat-members` exists
   and is authorized correctly, but no screen calls it, so a user cannot attach anyone. This
   is precisely the failure `docs/2026-09-audit.md` calls out — "a completely unreachable
   feature (seating) could ship". **Wave 3 adds the attach affordance** to the live table,
   which it owns. Item 9 is not done until a person can be attached from the app.

## Item 9, corrected by the product owner (supersedes the earlier reading)

The plan had a shared seat's money attributed to a **primary occupant**, who carried the
whole night in their personal record. The owner's actual intent is the opposite, and it is
the better rule: **a shared seat is how two people play together without the night landing
on either of their records.**

Settled:

- **The ledger is unchanged.** The seat still buys in, still counts out, still produces one
  settlement line and one transfer identity, and still appears in the WhatsApp summary and
  the share image. Somebody actually pays; that cannot be hidden.
- **Personal money stats exclude the seat entirely.** Neither member's profile net, wins,
  win rate, best night, worst night, streak or head-to-head counts it. Not split, not
  halved, not assigned to one of them — excluded. This removes the "who is the primary"
  question from every statistic, which is what made the earlier reading awkward.
- **Both members see the night in their own history**, openable, marked as a shared seat.

Scope: `src/db/profile-stats.ts`, `src/db/streak-queries.ts`, `src/db/head-to-head.ts`,
`src/db/history-queries.ts`, and a shared-seat marker in `src/app/history/HistoryScreen.tsx`.

This is a data-layer change, so it cannot go to wave 3, which is forbidden from touching
queries. It runs as **wave 4**, after wave 3 lands, by resuming the wave 2 agent that owns
those files. Sequentially rather than in parallel: two agents running the integration suite
at once truncate one shared `TEST_DATABASE_URL` branch, which is what produced the phantom
failures in wave 1.

**Tests.** The exclusion is exactly the shape of bug this codebase has shipped twice — two
aggregates that must share one row filter. Required: a shared night is absent from both
members' profile net, win count and streak; present in both members' history; and the
existing property check (total in equals total out) still holds with a shared seat, which
it must, because the ledger is untouched.

## Wave 4 scope (owner direction, after wave 3)

### A. Shared-seat stats exclusion
As settled in "Item 9, corrected by the product owner" above.

### B. The group view shows everyone with an account — item 4 partially retired

**This reverses part of brief item 4**, which said in as many words: "A player should only
see people they have actually played a game with." The owner has since looked at the built
result and called that scoping wrong for the group view. Recorded rather than silently
flipped, because it is delivered, reviewed work being undone on purpose.

`loadGroupStats` currently stacks **three** narrowings on the member list
(`src/db/group-stats.ts:78-88`):

1. `players.game_id in viewerGames` — only games the viewer sat in;
2. `games.status = 'closed'` — only finished nights;
3. `people.user_id IS NOT NULL` — only account holders.

Only (3) survives. A friend who has signed up but not yet finished a night with the viewer
is currently invisible, and so is someone the viewer is mid-game with right now. Neither is
what "the group" means in an app for one group of friends.

**Required shape.** The member list must be driven **from `people`** where
`user_id IS NOT NULL`, with the play history LEFT-joined for each person's figures — not
from `players` inner-joined to `people`, which is what makes membership a side effect of
having played. Someone with no nights appears with `nightsPlayed: 0` and
`lastPlayedAt: null`; `GroupScreen`'s `lastSeen()` already renders that case as
"עוד לא שיחקו", so the UI needs nothing new.

**This is the single most dangerous change left in the run.** It is exactly the shape
`AGENTS.md` warns about twice and that has shipped twice here: membership and the
statistics beside it now come from *different* row filters. Everyone with an account is a
member; `nightsPlayed`, `lastPlayedAt` and the head-to-head beside them are still counted
over closed shared nights only. Get the join wrong in the obvious direction and either
every member reads zero nights, or the people with no nights vanish again and the change
appears to have done nothing. **It will not error either way.**

**Tests.** A person with an account and no shared night appears, with zero nights. A person
with three shared closed nights appears with exactly three — proving the statistic did not
widen along with the membership. A person with no account still does not appear. An
in-progress (non-closed) shared game does not inflate anyone's night count.

**Out of scope, flagged not changed:** `/api/people` → `getPeopleWhoPlayedWith`, which
scopes the roster picker when starting a game. The owner named the group view specifically.
The same argument may well apply to the picker, but reversing it was not asked for and it
is the list that decides who can be seated, so it is a separate decision.

## Delight budget

1. **The waiting-on list names people, not a count** (wave 2). At the table this means the
   host stops asking "who hasn't counted?" out loud and just reads it.
2. **`bump` on the pot when someone rebuys** (wave 3). At the table this means you see the
   money land without hunting for the number and comparing it to the one you remember.
3. **The hand-rankings sheet opens from the live table's existing action bar** (wave 3).
   At the table this means settling an argument mid-hand costs one tap and does not lose
   your place in the game.

## Where the Codex review was accepted, and where it was not

**Accepted, and the plan changed:** item 1's cause (dead `addLivePlayer`, and the schema
comment misread); item 2's three gates and the unreachable UI; item 4's stated source;
item 5's competing-truths risk and every undefined interaction it listed; item 6's real cap
value and the `addPlayerToGame` funnel; `entered_by_person_id` over `entered_by_player_id`;
`seat_members` needing `game_id` and `unique(game_id, person_id)`; the shared-seat host
escalation; the membership route having no stated rule; the read-model files item 9 needs;
the vacuous `settlement.ts` shared-seat test; and every ownership collision it named.

**Argued down:**

- *"Replacing accountless People with `person_id = NULL` does not use the existing claim
  path."* Correct, and moot — that change is withdrawn entirely. `addLivePlayer` is dead,
  so there is nothing to replace. No new seating flow is invented.
- *"Item 4's fix addresses rows the app does not produce."* Agreed on the facts, kept
  anyway. The predicate is one line, it is the correct data-layer scoping regardless of
  provenance, and the legacy rows it filters are visible to the owner today.
- *"The plan does not specify how consent works"* for shared-seat membership. A consent
  flow is a new screen and the delight budget forbids one. The rule shipped instead — only
  the host or the seat's primary occupant may attach, and any attached person may detach
  themselves — is the smallest thing that is not silent. Noted as a deliberate limit.

## Deliberately not in scope

- `src/lib/money.ts`, `src/lib/settlement.ts` — hand-written, test-locked, untouched.
- Backfilling or deleting the legacy accountless `people` rows — destructive, needs the
  owner.
- Wiring the dead chip columns (`chip_body`/`chip_edge`/`chip_spots`/`chip_initials`) into
  a renderer, unless item 1's reproduction proves they are the cause. Reported either way.
- Deleting dead `addLivePlayer` — reported, not removed.
- `docs/2026-09-audit.md` open items 1, 2, 3, 4 and 9 (route-layer test coverage, the type
  scale, the mark-as-paid optimistic lock, mismatch resolution deleting transfer rows,
  `AmountInput` having no minus). Open item 5 (the debounce flush) *is* in scope, inside
  item 5.

## Docs this run must update

- **`AGENTS.md`** — the "no odds" line, per the owner's decision on item 8; the
  `seat_members` ownership rule, which is an invariant worth stating.
- **`README.md`** — only if setup or how it is run changes. It should not.
- **`TESTING.md`** — new, written by wave 3.

---

# Final Codex review on the full diff — outcome

Run read-only against the complete uncommitted diff. Final state after addressing it:
`pnpm verify` green — **53 test files, 383 tests, build clean** (baseline 294).

## Argued down, with evidence

**Its P0 was wrong.** It claimed `/group`, `/history` and the cash-out read would error in
production because interpolated drizzle columns render unqualified, citing the `AGENTS.md`
invariant. Printed the actual generated SQL instead of reasoning about it:

```
count("games"."id")
"seat_members"."person_id" IS DISTINCT FROM "players"."person_id"
```

Fully qualified. That is also why 383 tests pass against real Postgres rather than erroring.
The `AGENTS.md` hazard is real but narrower than the review read it — it bites on a
correlated subquery over a table that has a same-named column, not on every interpolation.

## Accepted and fixed

1. **Authorization hole in `attachSeatMember`.** Guarded with `actor.id !== playerId`, but
   an attached member resolves to the *same* `players.id` as the seat, so any member could
   attach arbitrary further people. The UI hid it; the data layer was open — the exact
   failure mode the brief names. Now compares the caller against `players.person_id`, and
   repeats the check inside the INSERT so a concurrently demoted host cannot slip through.
   `detachSeatMember` was checked and does not share the flaw.
2. **`purgeGame` was broken by this run.** It deletes `players` but not `seat_members`, and
   the new FK is `ON DELETE NO ACTION`, so the batch rolled back. Purging a game worked
   before this run and did not after it.
3. **`detachAndDeletePerson` was broken by this run**, same cause. `seat_members` rows are
   now deleted with the account; `cash_outs.entered_by_person_id` is nulled, so the recorded
   amount survives and only "who typed it" is forgotten — consistent with how that function
   already nulls `players.person_id` to avoid rewriting other people's settled evenings.
4. **No backfill for pre-existing seats.** Seats created after 0016 get a primary
   `seat_members` row; older ones had none, so "is this seat shared?" (`count(*) > 1`) read
   a shared pre-migration seat as unshared and every stats exclusion mislabelled it — across
   all real history. Fixed by additive, idempotent migration `0017_backfill_seat_members.sql`,
   applied to both `DATABASE_URL` and `TEST_DATABASE_URL`.

**A test that gave false confidence**, correctly caught: the "refused every host action"
assertion was `.rejects.toThrow()` alone, which passes even if the mutation succeeded and
only a follow-up read failed. Strengthened to assert the database was not mutated.

**One defect the orchestrator found in the fix itself.** The new backfill test ran the
migration's *unscoped* `INSERT … SELECT` over every live seat in the database. vitest runs
files in parallel against one shared Neon branch, so it inserted primary memberships into
other test files' half-seeded games, and their own inserts then died on
`seat_members_game_id_person_id_unique` — a failure that appeared in an unrelated file and
only in the full suite. The agent reported green; a solo run did not agree. Scoped to its
own game id, which keeps what the test proves and removes the blast radius.

## Accepted as real, deliberately not fixed

Each is recorded rather than rushed at the end of a long run:

- **A stale write can overwrite a confirmed count.** The client suppresses stale responses
  but does not cancel the stale request, and the server upsert has no revision predicate. A
  delayed autosave landing after a confirmation can overwrite the amount and its done flag.
  Needs an expected-value or revision column on the write — a real design change.
- **Mismatch resolution computes before taking its lock**, so a concurrent confirmation can
  make the computed correction stale and assign it to the wrong winners. Totals still
  balance, so nothing refuses. Pre-existing; named in the plan as in scope and not reached.
- **The debounce flushes on unmount, not on backgrounding.** Locking a phone inside the
  350ms window can still lose the last tap. This is `docs/2026-09-audit.md` open item 5,
  narrowed but not closed.
- **Attached members get 403 on playlist and memorable-hand reads** —
  `music-hand-queries.ts` still resolves participation through `players.person_id` alone.
  Read-only annoyance, no money or authorization consequence.
- **Group totals ignore games the viewer holds through membership** — `viewerGames` still
  keys on `players.person_id`, so an attached member's nights contribute nothing to group
  attendance.

---

# Pre-push verification round

Three read-only Sonnet reviewers (authorization, regression, functional) followed by a
Codex gate over the whole diff. Outcome below.

## What the reviewers found

- **Authorization: no blocking findings.** ~20 route handlers and every actor-resolution
  path. `resolveSeatActor` is the single delegate and hard-codes `isHost: false` for a
  member; `getRosterContext` was rewritten this run to use it. No route trusts
  client-supplied identity; no IDOR found.
- **Regression: no blocking regressions.** `money.ts`, `settlement.ts` and `share-card.ts`
  verified untouched. For a night with no shared seat the WhatsApp text is unchanged. An
  existing game above ten seats still reads, rebuys and closes, and now renders better.
- **Functional: items 7 and 8 were UNREACHABLE** — built, tested, imported nowhere. Fixed:
  the hand-rankings sheet is now a one-tap control in the live action bar and the odds
  calculator sits in the more-actions drawer. This was the third instance in this project
  of a finished feature that no screen reached, and code review did not catch any of the
  three — only driving the app did.

**A correction to this plan's own earlier record:** item 12 delivered one new motion moment,
not three. `bump` in `PokerTableArc` and the settlement reveal in `SettlementScreen` were
both already present at HEAD and are byte-identical now. Wave 3 added a single `motion.p`
on the count-done line in `CashoutScreen`.

## Accepted risk, decided by the product owner

**`/api/group` returns every account in the database to any signed-in user** — name,
nickname, avatar key and Person UUID. Public sign-up creates a Person, so any outsider who
registers can enumerate the whole roster, and will themselves appear in everyone's crew
screen.

This is the direct consequence of the owner's instruction to stop scoping the group view,
and he was shown the exposure and chose to keep it fully open on 2026-09-20. It is correct
for the app as it exists: one group of friends, all of whom know each other.

**The tripwire:** this stops being acceptable the moment anyone outside the group signs up.
The narrower fix is one predicate — scope membership to people who share any game with the
viewer, finished or not, which was the original complaint — and it is a ten-line change in
`loadGroupStats` if that day comes.

## Argued down

**Mismatch resolution computing before it takes its lock** (`cashout-queries.ts:606` vs
`:646`) was raised as blocking. It is real and it is already recorded above as known and
unfixed — but it is **pre-existing**, not introduced by this run, and the failure needs two
phones confirming counts in the same instant while the host resolves a mismatch. Shared
seats widen the field of racers marginally. Fixing it properly means making the whole
resolution read-compute-write sequence lock-first, which is a design change, not a pre-push
patch. Recorded, not rushed.
