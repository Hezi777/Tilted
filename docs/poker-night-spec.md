# Poker Night - Product & Technical Spec

A phone-first web app for tracking a home poker game between friends: who bought in, who re-bought, who cashed out with what, and who owes whom at the end. Not a gambling product - it is a shared expense ledger for a friendly game, with no odds, no betting engine, and no real-money movement inside the app.

---

## 1. Goals

1. Log buy-ins and rebuys during the game in under 3 seconds per action, on a phone, one-handed.
2. At the end, each player's final chip value is entered once, and the app computes the minimum set of transfers.
3. Produce a WhatsApp-ready Hebrew summary that can be copied with one tap.
4. Look good. Cute generated chip characters, not a spreadsheet.

## 2. Non-goals (V1)

- No card dealing, hand tracking, odds, or any game logic.
- No payments, Bit/PayBox integration, or bank links. The app only says who pays whom.
- No accounts or login. Joining a room is a 4-character code, nothing more.

## 3. UI language & conventions

- UI in Hebrew, RTL. Code, comments, commits, table and column names in English.
- Currency: ILS, displayed as `₪`. All internal amounts stored as **integer agorot** (100 = ₪1) to avoid float errors. Format at display time only.
- Phone-first: design at 390px width, everything reachable with a thumb, big tap targets (min 48px).

---

## 4. Data model

```
Game
  id            uuid
  code          text          -- 4-char room code, e.g. "K7QM", also used for the share link
  name          text          -- optional, e.g. "חמישי אצל דין"
  buy_in        integer       -- default buy-in in agorot, e.g. 5000 = ₪50
  rebuy_amount  integer       -- default rebuy, usually == buy_in
  status        enum          -- 'active' | 'settling' | 'closed'
  created_at    timestamptz
  closed_at     timestamptz

Person                         -- exists only to make streaks possible
  id            uuid
  name          text

Player
  id            uuid
  game_id       uuid
  person_id     uuid           -- nullable, links this seat to a Person across games
  name          text
  avatar_key    text          -- which generated chip character is theirs
  seat_order    integer
  device_id     text          -- random id generated once per phone and kept in that
                              -- phone's localStorage permanently, not cleared when a
                              -- game ends. Null until the seat is claimed. This is the
                              -- whole identity model - no accounts, no recovery.
  is_host       boolean

BuyIn                          -- one row per buy-in AND per rebuy
  id            uuid
  game_id       uuid
  player_id     uuid
  amount        integer        -- agorot
  kind          enum           -- 'initial' | 'rebuy'
  created_at    timestamptz    -- gives a free timeline of the night

CashOut
  id            uuid
  game_id       uuid
  player_id     uuid           -- unique per (game, player)
  amount        integer        -- final chip value in agorot
```

Notes:

- Rebuys are **rows, not counters**. Never mutate a total. This gives an undo, an audit trail, and a timeline chart for free.
- Deleting a mistaken rebuy = soft delete (`deleted_at`) so the log stays honest.
- A player's total in = `SUM(BuyIn.amount)`. Their net = `CashOut.amount - total_in`.

---

## 5. Screens & flows

### 5.1 Home
- Big primary button: **משחק חדש**.
- Below it, list of past games (date, players count, pot size, winner). Tap to open a read-only summary.

### 5.2 New game setup
| Field | Default | Notes |
|---|---|---|
| שם המשחק | auto: date | optional |
| כניסה (buy-in) | ₪50 | quick chips: 20 / 50 / 100 / custom |
| ריביי | same as buy-in | toggle "ריביי בסכום אחר" reveals a field |
| שחקנים | the regulars, all checked | the group is mostly the same people every time, so this is a checklist of known `Person` rows, pre-checked. Uncheck whoever could not make it. **הוסף אורח** creates a new `Person`. Nobody re-types an existing name, which is what makes duplicate people impossible. |

Adding a player during setup creates their `initial` BuyIn immediately. Players can also be added mid-game.

### 5.3 Joining a room (every player except the host)

The host reads out a 4-character code. Each guest opens the app, enters the code, and picks their name from the roster (or adds it if the host has not). That claim writes their phone's `device_id` onto the Player row and is remembered in localStorage, so reopening the link puts them straight back into the game as themselves.

- A name that is already claimed by a different `device_id` shows as taken. The host can release a claim if someone's phone dies.
- No password, no login. Whoever has the code is in. This is a group of friends in one room; the code is spoken out loud, not a security boundary.
- Codes are only unique among `active` games, so they can be short. Reuse freely once a game closes.

### 5.4 Live game (the main screen)
- Header: total pot (`SUM(buy_ins)`), number of players, elapsed time.
- One card per player, sorted by seat order:
  - Chip character avatar + name.
  - Total in so far (`₪150`) and a small `x3` badge for number of buy-ins.
  - Your own card is pinned to the top and visually distinct.
- **The write rule, and the whole permissions model:** a phone may insert a buy-in only for the player whose `device_id` matches its own. The host is the single exception - the host can add a rebuy for anyone and can delete any row. That is it. There is no other authorization anywhere in the app.
  - Your own card: a big **+ ריביי** button. One tap, one rebuy at the default amount.
  - Everyone else's card: read-only. The host additionally sees a small `···` menu on every card.
  - `···` menu (own card, or any card if host): ריביי בסכום אחר / ביטול ריביי אחרון / (host only) מחיקת שחקן.
- The screen polls `GET /api/game/[code]` every 3 seconds while the tab is visible, and pauses polling on `visibilitychange`. No websockets, no realtime service.
- Every rebuy triggers a short haptic + a toast with an **בטל** action for 5 seconds. You can undo your own rebuy for 60 seconds; after that only the host can remove it.
- A small live feed at the bottom shows the last few actions (`רועי הוסיף ריביי · לפני 2 דק'`) so the table can see what got logged without opening anything.
- Host bottom bar: **הוסף שחקן**, **קוד החדר**, **סיום משחק**. Guests see only **קוד החדר**.

### 5.5 End game / cash-out entry
- One row per player with a numeric input for the final chip value. Numeric keypad, no keyboard.
- Live running footer: `נספר: ₪480 מתוך ₪500 · חסר ₪20`.
- **Cannot proceed while the difference is not zero.** When it is not zero, offer three explicit resolutions:
  1. **ספירה מחדש** (default, just go fix the numbers).
  2. **פיצול ההפרש** - distribute the diff proportionally across winners.
  3. **שיוך ההפרש לשחקן** - pick who eats it (usually the guy who pocketed a chip).
  Whichever is chosen gets recorded so the summary can say it.

### 5.6 Settlement
- Sorted list: winners in green with `+₪120`, losers in red with `-₪50`.
- Below it: the transfer list, e.g. `דין ➜ אלון · ₪70`.
- **העתק לווצאפ** button (primary) and **שתף** (native Web Share API).

### 5.7 Streaks

The only cross-game feature. Deliberately not a leaderboard: no lifetime totals, no cumulative winnings, no all-time table. Those turn a friendly game into a debt ledger and permanently disadvantage whoever joined last. A streak is always about right now, it resets, and nobody carries a label.

- A **win streak** is consecutive closed games **that the person played in**, where they finished with a positive net. Net of zero or below breaks it. A night they sat out does not break it and does not extend it - they did not lose, they were not there. This matters: in a group where someone different is missing each week, a streak that breaks on absence would almost never reach 3.
- It shows from 2 up: a Lucide `flame` icon plus the number, next to the person's name. One win is not a streak.
- It appears in three places: on the home screen as a small strip of whoever currently has one, next to the player's name on the live game screen (this is the point of the feature - you see it while playing against them), and on the settlement screen when a streak is extended or broken.
- Optional, ask the group first: a `snowflake` on 3 consecutive losses. Funny among friends, and also the one thing here that can land badly. Ship without it, add it if they want it.
- Nothing else is tracked across games. No averages, no win rates, no biggest pot ever.

This is the one feature that needs identity to persist between games, so `Player` carries a nullable `person_id` pointing at a small `Person` table (`id`, `name`). A person is created once, from **הוסף אורח**, and is reused on every later game through the regulars checklist. That is the entire cross-game data model.

**This does not require authentication and must not introduce it.** Do not install Clerk, NextAuth, Neon Auth, Supabase Auth or any other auth library, and do not add passwords, emails, magic links or sessions. `Person` holds a name and nothing else - there is no money, no debt and no personal history stored against it, so there is nothing to protect. Cross-game identity is the host picking an existing name from the roster, not a login.

Because the phone's `device_id` persists and the roster is a checklist rather than a text field, a returning player is recognised on open and nobody ever re-types an existing name - so duplicate people, and the silently reset streaks they cause, cannot happen through normal use. Add an optional nickname field for two friends with the same first name.

If a phone is wiped or someone opens the app in a private window, they claim their name from the roster once more. There is no recovery flow, no email, no "who am I" link, and none should be built - it costs five seconds a few times a year.

### 5.8 History
Read-only version of the settlement screen plus a small timeline of when rebuys happened.

---

## 6. Settlement algorithm

```
1. For each player: net = cash_out - total_buy_ins   (agorot, integers)
2. Assert SUM(net) == 0. If not, the mismatch resolution from 5.4 already fixed it.
3. debtors  = players with net < 0, sorted by |net| descending
   creditors = players with net > 0, sorted by net descending
4. While both lists are non-empty:
     d = debtors[0], c = creditors[0]
     amount = min(|d.net|, c.net)
     emit transfer d -> c of `amount`
     d.net += amount ; c.net -= amount
     drop whichever hit zero
5. Result: at most n-1 transfers.
```

Rounding: keep everything in agorot end to end. If the group prefers whole shekels, add a game-level setting `round_to` (100 agorot) applied at step 1, with the leftover assigned to the biggest winner. Do not round per transfer.

Unit tests to write for this:
- 2 players, one wins everything.
- 3 players, one winner two losers.
- 4 players, two winners two losers, uneven amounts.
- A player who broke exactly even (must appear in no transfer).
- A player who rebought 5 times and still lost.
- Sum-mismatch input must throw.

---

## 7. WhatsApp export format

Plain text, no markdown (WhatsApp mangles it), emoji as visual separators, RTL-safe. Amounts always with `₪` prefixed to the number.

```
🃏 פוקר - חמישי 12.9

הקופה: ₪500
5 שחקנים

תוצאות:
🟢 אלון +₪180
🟢 דין +₪40
⚪ יובל 0
🔴 שי -₪90
🔴 רועי -₪130

העברות:
רועי ➜ אלון · ₪130
שי ➜ אלון · ₪50
שי ➜ דין · ₪40
```

Implementation: build the string in a pure function `formatWhatsAppSummary(game): string` so it is unit-testable, then `navigator.clipboard.writeText`. Also expose `navigator.share({ text })` where available.

---

## 8. The generated art (ChatGPT image model)

### 8.1 Strategy - important
The art is generated **once, by hand, in the ChatGPT app**, and the PNGs are committed as static assets under `public/art/`. No image API, no API key, no per-call cost, no runtime dependency. The V1 set contains 19 images; keep the good ones, commit them as static assets, and stop there unless a new UI moment clearly needs art.

Do **not** call an image API at runtime. Beyond cost, it is 5-15s of latency and the app must work when the host has bad reception at someone's apartment.

Optional later: if regenerating by hand becomes annoying, add a `scripts/generate-art.ts` that reads a prompt manifest and calls OpenAI's image endpoint (`gpt-image` family - check the current model name in the docs, it moves). This costs money per image, so it is explicitly out of scope for V1.

### 8.2 Asset list
| Asset | Count | Where used |
|---|---|---|
| Chip characters (avatars) | 10-12 variants | player avatars, assigned by `avatar_key` |
| Winner chip (crown, celebrating) | 1 | top of settlement screen |
| Sad/broke chip | 1 | biggest loser row |
| Empty-state chip | 1 | home screen with no games |
| Rebuy burst | 1 small | animation on the rebuy toast |
| Pot chip stack | 1 small | beside the pot total in the live-game header |
| Counting chip | 1 | cash-out header while entering and balancing chip counts |
| App icon / PWA icon | 1 | manifest |

### 8.3 Writing the prompts

Do not reuse generic prompt phrasing from memory. Look up current prompting guidance for the image model being used (GPT Image 2) first - subject, style, composition, background and negative constraints are handled differently across model generations, and the phrasing that worked a year ago produces mush now. Then write one prompt per asset and keep them in `public/art/manifest.json` alongside the filename they produced, so a single asset can be regenerated later without guesswork.

Constraints the prompts must enforce, whatever their final wording:

- One shared style across the whole set, so the artwork looks like a family: polished soft 3D character illustration, tactile felt-and-clay materials, gently rounded forms, subtle two-tone modelling and ambient occlusion, dark dimensional edging, and a limited palette of deep green felt, cream, warm red and antique gold.
- Square composition, centered subject, transparent or plain background, no text or lettering except the small `A` on chip-02's ace card.
- Each player avatar differs by chip color plus exactly one accessory. Chip-02's cap with its tucked ace card counts as one combined accessory. One variable at a time keeps the set coherent.
- Nothing resembling real casino brands, real people, or trademarked card designs. Chip-02's ace of spades is generic and deliberately non-branded.

### 8.4 Asset rules
- Deterministic filenames: `public/art/chip-01.png` ... `chip-12.png`, plus `winner.png`, `broke.png`, `empty.png`, `rebuy-burst.png`, `pot-stack.png`, `counting.png`, and `icon.png`.
- Request transparent background where the API supports it; otherwise post-process.
- Downscale to 512x512 and run through an optimizer - these ship to phones.
- Store the exact prompt used for each file in `public/art/manifest.json` so regenerating a single asset later is trivial.
- Do not generate anything resembling real casino brands, real people, or trademarked card designs.

---

## 9. Tech stack

- **Next.js (App Router) + TypeScript**, deployed on Vercel.
- **Tailwind + shadcn/ui** for every component. Do not hand-roll buttons, dialogs, inputs or toasts - install the shadcn primitives and style those. RTL enabled (`dir="rtl"` on `<html>`, Tailwind logical properties only, never `ml-`/`mr-`).
- **Typography**: Assistant (Google Fonts) for Hebrew, Satoshi (Fontshare) for Latin and all numerals. Set them as a single font stack with Satoshi first so digits and currency render in Satoshi and Hebrew falls through to Assistant. Load Satoshi from the Fontshare CSS API rather than self-hosting the files - Satoshi is free for commercial use under the ITF Free Font License, but that license does not permit self-hosting the webfont without written consent. Assistant loads normally through `next/font/google`.
- **Neon (serverless Postgres) + Drizzle ORM** from day one, even though V1 is single-device. See section 10 for why this matters.
- **PWA**: manifest + icon so it installs to the home screen. No offline requirement in V1 beyond React state surviving a refresh.

### Hard constraint: the whole thing must cost ₪0

- Vercel Hobby (free, personal non-commercial use) + a `*.vercel.app` subdomain. No custom domain.
- Neon free plan: compute suspends after 5 minutes idle and **wakes automatically on the next query in a few hundred milliseconds, with no manual restore**. This is the reason for Neon over Supabase here: Supabase's free tier pauses a project after 7 days of inactivity and needs a manual click in the dashboard to come back. A game played once a month would be paused every single time.
- No paid APIs anywhere in the runtime path. The art is generated by hand (section 8).
- Money helpers in `src/lib/money.ts`, settlement in `src/lib/settlement.ts`, WhatsApp formatting in `src/lib/export.ts`. All three pure and unit-tested with Vitest.

### Suggested structure
```
src/
  app/
    page.tsx                  # home + history
    game/new/page.tsx
    game/[code]/page.tsx      # live game
    game/[code]/cashout/page.tsx
    game/[code]/settle/page.tsx
  lib/
    money.ts  settlement.ts  export.ts  db.ts  schema.ts
  components/
    PlayerCard.tsx  RebuyButton.tsx  ChipAvatar.tsx  AmountInput.tsx
drizzle/
  migrations/
public/
  art/
```

---

## 10. The shared room

Everyone joins with the code and logs their own rebuys from their own phone. This is in V1, not a later phase.

It is cheap because of one deliberate narrowing: **a phone writes only for its own player.** Nobody edits anybody else's row. That removes the entire class of problems that makes multi-user state expensive - no permissions matrix, no merge conflicts, no "who deleted my rebuy" argument - and leaves a schema where the only rule to enforce is `buy_in.player_id` must match the `device_id` on the request. The host keeps override rights so a real dispute has an answer, and the host is the only one who has them.

What this buys over host-only: nobody has to shout across the table, and the host stops being a data entry clerk during his own game.

What it costs: one join screen, a `device_id` claim on the Player row, one server-side ownership check, and 3-second polling. Call it an evening.

**The failure mode is physical, not technical.** Someone takes chips and forgets to tap, or taps and never takes the chips. No amount of engineering fixes that. Three things keep it from mattering:

1. The live action feed on the main screen - the table sees each rebuy get logged as it happens, so a missing one gets caught in the moment.
2. The cash-out reconciliation in section 5.5 - the chips on the table must equal the pot, and the app refuses to settle until they do.
3. The host's override - one person can always fix the log.

**What is explicitly not built:** approval queues, roles beyond host/player, per-action audit UI, or any attempt to make the code a security boundary. Anyone with the code is trusted, because anyone in the living room is trusted.

## 11. Edge cases to handle explicitly

1. Player joins mid-game - their initial buy-in is timestamped, no special casing needed.
2. Player leaves early - cash them out individually, mark them `settled`, keep the game running. Their row is frozen on the live screen.
3. Rebuy at a non-default amount (someone throws in ₪20 more).
4. Accidental double-tap on rebuy - undo toast, plus ignore identical writes within 1 second.
5. Host's phone dies mid-game - state is in the database, reopening the link on any phone restores everything. This alone justifies not using localStorage.
6. Two players with the same first name - allow a nickname field.
7. Somebody ends with exactly 0 chips.
8. Chip count does not match the pot - section 5.5.
9. Game abandoned without cash-out - stays `active`, home screen shows it with a "המשך משחק" button and a "בטל משחק" option.

---

## 12. Build order

| # | Milestone | Done when |
|---|---|---|
| 1 | Neon project + Drizzle schema + migrations | tables exist, seed script inserts a fake 4-player game |
| 2 | `money.ts` + `settlement.ts` + tests | all cases in section 6 pass |
| 3 | New game flow | can create a game and land on the live screen |
| 4 | Join flow + device claim | a second phone joins by code and claims a name |
| 5 | Live game screen | own-card rebuys write, ownership check enforced, polling updates the pot, undo works |
| 6 | Cash-out + mismatch resolution | cannot proceed on a non-zero diff |
| 7 | Settlement screen + `export.ts` | WhatsApp text matches section 7 exactly |
| 8 | Hand-generated art dropped in + avatars wired | all PNGs committed to `public/art/`, avatars assigned |
| 9 | Streaks | flame shows on the live screen and home strip, resets correctly |
| 10 | History, PWA manifest, polish | installable, past games readable |

---

## 13. Copy & framing note

Anywhere the app names money, keep the language of a shared kitty between friends: `קופה`, `כניסה`, `ריביי`, `סגירת חשבון`. No odds, no "bet", no house. The app is a ledger.
