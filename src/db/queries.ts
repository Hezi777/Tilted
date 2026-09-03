/**
 * Server-side queries for milestone 3: the regulars roster and new-game creation.
 *
 * Scoping without auth (see the build plan): with no login, the home history and the
 * regulars roster are scoped by `device_id` — games this device has a seat in, and the
 * People who played in one of those games. Otherwise one public deployment would show
 * every group's friends and games to everyone.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, games, people, players } from "@/db/schema";
import { generateRoomCode } from "@/lib/codes";
import type { GameSummary, GameStatus, PersonSummary } from "@/lib/api";

/** People who have played, on this device, in at least one game. Spec 5.2 / 5.7. */
export async function getPeopleForDevice(
  deviceId: string,
): Promise<PersonSummary[]> {
  const rows = await db
    .selectDistinct({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
    })
    .from(people)
    .innerJoin(players, eq(players.personId, people.id))
    .where(
      and(
        isNull(players.deletedAt),
        inArray(
          players.gameId,
          db
            .select({ gameId: players.gameId })
            .from(players)
            .where(
              and(eq(players.deviceId, deviceId), isNull(players.deletedAt)),
            ),
        ),
      ),
    )
    .orderBy(people.name);

  return rows;
}

/** Creates a new Person — "הוסף אורח" (spec 5.2). */
export async function createPerson(
  name: string,
  nickname?: string | null,
): Promise<PersonSummary> {
  const [row] = await db
    .insert(people)
    .values({ name, nickname: nickname ?? null })
    .returning({ id: people.id, name: people.name, nickname: people.nickname });
  return row;
}

/** Every past/current game this device has a seat in, newest first. Spec 5.1. */
export async function getGamesForDevice(
  deviceId: string,
): Promise<GameSummary[]> {
  const seatedGameIds = await db
    .selectDistinct({ gameId: players.gameId })
    .from(players)
    .where(and(eq(players.deviceId, deviceId), isNull(players.deletedAt)));

  if (seatedGameIds.length === 0) return [];

  const rows = await db
    .select({
      id: games.id,
      code: games.code,
      name: games.name,
      status: games.status,
      createdAt: games.createdAt,
      closedAt: games.closedAt,
      playerCount: sql<number>`count(distinct ${players.id})`,
      pot: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
    })
    .from(games)
    .leftJoin(
      players,
      and(eq(players.gameId, games.id), isNull(players.deletedAt)),
    )
    .leftJoin(
      buyIns,
      and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)),
    )
    .where(
      inArray(
        games.id,
        seatedGameIds.map((row) => row.gameId),
      ),
    )
    .groupBy(games.id)
    .orderBy(desc(games.createdAt));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status as GameStatus,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    playerCount: Number(row.playerCount),
    pot: Number(row.pot),
  }));
}

export interface GamePlayerDetail {
  id: string;
  name: string;
  avatarKey: string | null;
  seatOrder: number;
  isHost: boolean;
  /** Sum of this player's live buy-ins, in agorot. */
  totalIn: number;
}

export interface GameDetail {
  id: string;
  code: string;
  name: string | null;
  status: GameStatus;
  buyIn: number;
  rebuyAmount: number;
  /** Sum of every player's `totalIn`, in agorot. */
  pot: number;
  players: GamePlayerDetail[];
}

/** A single game by its UUID (plan resolution #11 — never look one up by code here). */
export async function getGameById(gameId: string): Promise<GameDetail | null> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return null;

  const playerRows = await db
    .select({
      id: players.id,
      name: players.name,
      avatarKey: players.avatarKey,
      seatOrder: players.seatOrder,
      isHost: players.isHost,
      totalIn: sql<number>`coalesce(sum(${buyIns.amount}), 0)`,
    })
    .from(players)
    .leftJoin(
      buyIns,
      and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)),
    )
    .where(and(eq(players.gameId, gameId), isNull(players.deletedAt)))
    .groupBy(players.id)
    .orderBy(players.seatOrder);

  const detailPlayers: GamePlayerDetail[] = playerRows.map((row) => ({
    ...row,
    totalIn: Number(row.totalIn),
  }));
  const pot = detailPlayers.reduce((total, p) => total + p.totalIn, 0);

  return {
    id: game.id,
    code: game.code,
    name: game.name,
    status: game.status,
    buyIn: game.buyIn,
    rebuyAmount: game.rebuyAmount,
    pot,
    players: detailPlayers,
  };
}

export interface CreateGameInput {
  name?: string;
  /** Agorot. Converted from shekels on the client via src/lib/money.ts. */
  buyIn: number;
  /** Agorot. */
  rebuyAmount: number;
  /** The selected roster, in the order shown in the setup checklist. */
  personIds: string[];
}

/**
 * Whichever selected person this device has previously played as becomes host —
 * that is the one sane default with no explicit "who am I" field in the setup
 * screen (spec 5.2 lists no such field). A brand-new device, or one seated as none
 * of the selected people, defaults to the first person in the submitted roster.
 * A wrong guess is recoverable: any seat, host included, can be force-claimed later
 * (join flow, milestone 4).
 */
async function resolveHostPersonId(
  deviceId: string,
  personIds: readonly string[],
): Promise<string> {
  const [existing] = await db
    .select({ personId: players.personId })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(
      and(
        eq(players.deviceId, deviceId),
        isNull(players.deletedAt),
        inArray(players.personId, personIds as string[]),
      ),
    )
    .orderBy(desc(games.createdAt))
    .limit(1);

  return existing?.personId ?? personIds[0];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

const MAX_CODE_ATTEMPTS = 5;

/**
 * Creates a game, one Player per selected Person, and each player's `initial` BuyIn
 * — spec 5.2 — and bootstraps the host: the creating device's id and `is_host` land
 * on the host's Player row in the same write.
 *
 * The neon-http driver has no interactive transactions (`db.transaction()` throws at
 * runtime), so the insert is one `db.batch(...)` call instead — Neon runs a batch as
 * a single atomic Postgres transaction over HTTP. All row ids are generated
 * client-side up front so every statement in the batch can be built without reading
 * back a prior statement's result. A room-code collision fails the whole batch (the
 * players insert's `game_id` foreign key can't resolve), so a fresh code and a full
 * retry are safe and never leave partial rows behind.
 */
export async function createGame(
  input: CreateGameInput,
  deviceId: string,
): Promise<string> {
  const selectedPeople = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(inArray(people.id, input.personIds));

  const byId = new Map(selectedPeople.map((person) => [person.id, person]));
  if (byId.size !== input.personIds.length) {
    throw new Error("One or more selected players do not exist");
  }

  const hostPersonId = await resolveHostPersonId(deviceId, input.personIds);
  const name = input.name?.trim() || new Date().toLocaleDateString("he-IL");

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const gameId = randomUUID();
    const code = generateRoomCode();

    const playerRows = input.personIds.map((personId, seatOrder) => {
      const person = byId.get(personId);
      if (!person) throw new Error(`Unknown person id: ${personId}`);
      const isHost = personId === hostPersonId;
      return {
        id: randomUUID(),
        gameId,
        personId,
        name: person.name,
        seatOrder,
        deviceId: isHost ? deviceId : null,
        isHost,
      };
    });

    const buyInRows = playerRows.map((player) => ({
      id: randomUUID(),
      gameId,
      playerId: player.id,
      amount: input.buyIn,
      kind: "initial" as const,
      opId: randomUUID(),
      createdByDevice: player.deviceId,
    }));

    try {
      await db.batch([
        db.insert(games).values({
          id: gameId,
          code,
          name,
          buyIn: input.buyIn,
          rebuyAmount: input.rebuyAmount,
          status: "active",
        }),
        db.insert(players).values(playerRows),
        db.insert(buyIns).values(buyInRows),
      ]);
      return gameId;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new Error("Could not allocate a unique room code — please retry");
}
