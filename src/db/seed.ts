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
  chipDenominations,
  chipSets,
  games,
  people,
  players,
} from "@/db/schema";

const BUY_IN = 5000; // ₪50
const REBUY = 5000; // ₪50

/** Two shared presets every game can pick without owning a chip set (plan item 1/8). */
async function seedChipSetPresets() {
  const [standard] = await db
    .insert(chipSets)
    .values({ name: "חבילה סטנדרטית", isPreset: true })
    .returning();
  await db.insert(chipDenominations).values([
    { chipSetId: standard.id, color: "#F5EDE6", value: 100, sortOrder: 0 }, // ₪1
    { chipSetId: standard.id, color: "#C21E3A", value: 500, sortOrder: 1 }, // ₪5
    { chipSetId: standard.id, color: "#1A6B4E", value: 2000, sortOrder: 2 }, // ₪20
    { chipSetId: standard.id, color: "#141011", value: 10000, sortOrder: 3 }, // ₪100
  ]);

  const [highStakes] = await db
    .insert(chipSets)
    .values({ name: "חבילת סטייקים גבוהים", isPreset: true })
    .returning();
  await db.insert(chipDenominations).values([
    { chipSetId: highStakes.id, color: "#F5EDE6", value: 500, sortOrder: 0 }, // ₪5
    { chipSetId: highStakes.id, color: "#C21E3A", value: 2500, sortOrder: 1 }, // ₪25
    { chipSetId: highStakes.id, color: "#1A6B4E", value: 10000, sortOrder: 2 }, // ₪100
    { chipSetId: highStakes.id, color: "#4A0917", value: 50000, sortOrder: 3 }, // ₪500
    { chipSetId: highStakes.id, color: "#141011", value: 100000, sortOrder: 4 }, // ₪1,000
  ]);
}

async function seed() {
  await seedChipSetPresets();

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
