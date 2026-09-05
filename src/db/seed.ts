/**
 * Inserts one fake, already-closed 4-player game with realistic buy-ins, rebuys and
 * cash-outs — enough to exercise the live and settlement screens.
 *
 * Not run as part of `pnpm verify` (no DATABASE_URL in CI). Run by hand once Neon is
 * wired up: `pnpm db:seed`.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  buyIns,
  cashOuts,
  games,
  people,
  players,
  playlists,
} from "@/db/schema";

const BUY_IN = 5000; // ₪50
const REBUY = 5000; // ₪50

/** Starter playlists behind the music button (plan item 11). */
async function seedPlaylists() {
  const existing = await db.select({ id: playlists.id }).from(playlists).limit(1);
  if (existing.length > 0) return;

  await db.insert(playlists).values([
    {
      name: "פוקר עד מאוחר",
      url: "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe",
      sortOrder: 0,
    },
    {
      name: "ג׳אז לשולחן",
      url: "https://open.spotify.com/playlist/37i9dQZF1DXbITWG1ZJKYt",
      sortOrder: 1,
    },
    {
      name: "בלוז מעושן",
      url: "https://open.spotify.com/playlist/37i9dQZF1DXd9rSDyQguIk",
      sortOrder: 2,
    },
  ]);
}

async function seed() {
  await seedPlaylists();

  // The fake game below predates accounts: it inserts People with no `user_id`, which
  // the roster now filters out. Skip it unless explicitly asked for.
  if (!process.env.SEED_DEMO_GAME) {
    console.log("Seeded playlists. Chip-set presets install themselves on first use.");
    return;
  }

  const [game] = await db
    .insert(games)
    .values({
      code: "K7QM",
      name: "חמישי אצל דין",
      buyIn: BUY_IN,
      rebuyAmount: REBUY,
      status: "closed",
      closedAt: new Date(),
    })
    .returning();

  const seedPeople = await db
    .insert(people)
    .values([
      { name: "אלון" },
      { name: "דין" },
      { name: "יובל" },
      { name: "שי" },
    ])
    .returning();

  const seedPlayers = await db
    .insert(players)
    .values(
      seedPeople.map((person, seatOrder) => ({
        gameId: game.id,
        personId: person.id,
        name: person.name,
        avatarKey: `chip-0${seatOrder + 1}`,
        seatOrder,
        deviceId: `seed-device-${seatOrder + 1}`,
        isHost: seatOrder === 0,
        settledAt: new Date(),
      })),
    )
    .returning();

  const [alon, dan, yuval, shai] = seedPlayers;

  // Rows, not counters: initial buy-in for everyone, plus a couple of rebuys.
  await db.insert(buyIns).values([
    {
      gameId: game.id,
      playerId: alon.id,
      amount: BUY_IN,
      kind: "initial",
      opId: randomUUID(),
      createdByDevice: alon.deviceId,
    },
    {
      gameId: game.id,
      playerId: alon.id,
      amount: REBUY,
      kind: "rebuy",
      opId: randomUUID(),
      createdByDevice: alon.deviceId,
    },
    {
      gameId: game.id,
      playerId: dan.id,
      amount: BUY_IN,
      kind: "initial",
      opId: randomUUID(),
      createdByDevice: dan.deviceId,
    },
    {
      gameId: game.id,
      playerId: yuval.id,
      amount: BUY_IN,
      kind: "initial",
      opId: randomUUID(),
      createdByDevice: yuval.deviceId,
    },
    {
      gameId: game.id,
      playerId: shai.id,
      amount: BUY_IN,
      kind: "initial",
      opId: randomUUID(),
      createdByDevice: shai.deviceId,
    },
    {
      gameId: game.id,
      playerId: shai.id,
      amount: REBUY,
      kind: "rebuy",
      opId: randomUUID(),
      createdByDevice: shai.deviceId,
    },
    {
      gameId: game.id,
      playerId: shai.id,
      amount: REBUY,
      kind: "rebuy",
      opId: randomUUID(),
      createdByDevice: shai.deviceId,
    },
  ]);

  // Totals in: אלון 10000, דין 5000, יובל 5000, שי 15000 -> pot 35000.
  // Cash-outs sum to the same pot and nets sum to zero: +8000 +4000 0 -12000.
  await db.insert(cashOuts).values([
    { gameId: game.id, playerId: alon.id, amount: 18000 },
    { gameId: game.id, playerId: dan.id, amount: 9000 },
    { gameId: game.id, playerId: yuval.id, amount: 5000 },
    { gameId: game.id, playerId: shai.id, amount: 3000 },
  ]);

  console.log(`Seeded game ${game.code} (${game.id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
