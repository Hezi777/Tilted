/**
 * Server-side queries for milestone 3: the regulars roster and new-game creation.
 *
 * Scoping without auth (see the build plan): with no login, the home history is scoped
 * by `device_id` — games this device has a seat in. The People roster is deliberately
 * not scoped: a device has to be able to pick its own name before it has ever played,
 * which a device-scoped roster makes impossible.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  buyIns,
  cashOuts,
  cashOutChips,
  games,
  handPlayers,
  hands,
  people,
  players,
  transfers,
} from "@/db/schema";
import { generateRoomCode } from "@/lib/codes";
import { AVATAR_KEYS, avatarKeyForPlayer } from "@/lib/avatar";
import { getActorForGame } from "@/db/cashout-queries";
import { AuthzError, requireHost } from "@/lib/authz";
import type { GameSummary, GameStatus, PersonSummary } from "@/lib/api";

/** The whole roster, for the identity screen and the setup checklist. Spec 5.2 / 5.7. */
export async function getPeople(): Promise<PersonSummary[]> {
  return db
    .select({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    })
    .from(people)
    .orderBy(people.name);
}

/** Creates a new Person, "הוסף אורח" (spec 5.2). */
export async function createPerson(
  name: string,
  nickname?: string | null,
): Promise<PersonSummary> {
  const [row] = await db
    .insert(people)
    .values({ name, nickname: nickname ?? null })
    .returning({
      id: people.id,
      name: people.name,
      nickname: people.nickname,
      avatarKey: people.avatarKey,
    });
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
      location: games.location,
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
    location: row.location,
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
  /** v2: where the evening is, e.g. "הבית של עידו" (plan item 7). */
  location?: string;
  /** Who may enter results at the end (requirements item 4). */
  resultEntry?: "host_only" | "players";
  notes?: string;
  chipSetId?: string | null;
  /** Agorot. Converted from shekels on the client via src/lib/money.ts. */
  buyIn: number;
  /** Agorot. */
  rebuyAmount: number;
  plannedEndAt: Date;
  /** The selected roster, in the order shown in the setup checklist. */
  personIds: string[];
  /** The Person the creating device declared itself to be. Must be in `personIds`. */
  hostPersonId: string;
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
  if (input.personIds.length > AVATAR_KEYS.length) {
    throw new Error("A table cannot have more character slots than available avatars");
  }
  const selectedPeople = await db
    .select({ id: people.id, name: people.name, avatarKey: people.avatarKey })
    .from(people)
    .where(inArray(people.id, input.personIds));

  const byId = new Map(selectedPeople.map((person) => [person.id, person]));
  if (byId.size !== input.personIds.length) {
    throw new Error("One or more selected players do not exist");
  }

  if (!input.personIds.includes(input.hostPersonId)) {
    throw new Error("The host must be one of the selected players");
  }
  // The host always holds seat 0: they declared themselves before the table existed,
  // and the live screen reads seat order as the seating around the felt.
  const seatedPersonIds = [
    input.hostPersonId,
    ...input.personIds.filter((personId) => personId !== input.hostPersonId),
  ];
  // A blank name persists as NULL, not a date-shaped placeholder -- the date already
  // lives in `created_at` and every display surface reads it from there instead.
  const name = input.name?.trim() || null;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const gameId = randomUUID();
    const code = generateRoomCode();

    // Everyone sits as themselves. The host is seated first, so on the rare collision
    // -- two people whose profiles show the same open character -- it is the later seat
    // that takes an open one instead.
    const takenAvatars = new Set<string>();
    const playerRows = seatedPersonIds.map((personId, seatOrder) => {
      const person = byId.get(personId);
      if (!person) throw new Error(`Unknown person id: ${personId}`);
      const isHost = personId === input.hostPersonId;
      const avatarKey = avatarKeyForPlayer(person.avatarKey, takenAvatars);
      if (avatarKey) takenAvatars.add(avatarKey);
      return {
        id: randomUUID(),
        gameId,
        personId,
        name: person.name,
        avatarKey,
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
          location: input.location?.trim() || null,
          resultEntry: input.resultEntry ?? "host_only",
          notes: input.notes?.trim() || null,
          chipSetId: input.chipSetId ?? null,
          buyIn: input.buyIn,
          rebuyAmount: input.rebuyAmount,
          plannedEndAt: input.plannedEndAt,
          status: "active",
          // v2: only this person may delete the game from history (plan item 3).
          createdByPersonId: input.hostPersonId,
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

  throw new Error("Could not allocate a unique room code, please retry");
}

/**
 * Fields the live-game GET route layers onto its response so a viewer can tell
 * who created the game and where it is (plan item 7). Kept separate from
 * `getLiveGame` (src/db/live-queries.ts), which this milestone does not touch.
 */
export interface GameOwnership {
  createdByPersonId: string | null;
  location: string | null;
  notes: string | null;
}

/**
 * May this Person read this game at all: do they hold a seat at it, removed seats
 * aside. The same test `buildHistoryListQuery` already uses to decide which games
 * appear in someone's history, so a game they can see in the list is a game they can
 * open.
 *
 * Keyed on `person_id`, not on the `device_id` actor key `getActorForGame` uses. That
 * one answers "who may write here" and deliberately needs a *claimed* seat; a seat the
 * host made and the invitee has not opened yet has `device_id` NULL, and the invite
 * notification links them straight to the game screen. Reading is not writing.
 */
export async function isSeatedInGame(
  gameId: string,
  personId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.gameId, gameId),
        eq(players.personId, personId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function getGameOwnership(
  gameId: string,
): Promise<GameOwnership | null> {
  const [row] = await db
    .select({
      createdByPersonId: games.createdByPersonId,
      location: games.location,
      notes: games.notes,
    })
    .from(games)
    .where(eq(games.id, gameId));
  return row ?? null;
}

export interface UpdateGameRulesInput {
  name?: string;
  location?: string | null;
  notes?: string | null;
  /** Agorot. */
  buyIn?: number;
  /** Agorot. */
  rebuyAmount?: number;
  plannedEndAt?: Date;
}

export interface GameRulesDetail {
  id: string;
  name: string | null;
  location: string | null;
  notes: string | null;
  buyIn: number;
  rebuyAmount: number;
  plannedEndAt: string | null;
  status: GameStatus;
  createdByPersonId: string | null;
}

/**
 * Host-only mid-evening rules edit (plan item 7). Reuses the same authorization
 * predicates as every other write (src/lib/authz.ts) — there is no second
 * permission model here.
 */
export async function updateGameRules(
  gameId: string,
  deviceId: string,
  patch: UpdateGameRulesInput,
): Promise<GameRulesDetail> {
  const access = await getActorForGame(gameId, deviceId);
  if (!access) throw new AuthzError("not_in_game");
  requireHost(access.actor);
  if (access.game.status === "closed" || access.game.status === "cancelled") {
    throw new AuthzError("game_not_active");
  }

  const [row] = await db
    .update(games)
    .set(patch)
    .where(eq(games.id, gameId))
    .returning({
      id: games.id,
      name: games.name,
      location: games.location,
      notes: games.notes,
      buyIn: games.buyIn,
      rebuyAmount: games.rebuyAmount,
      plannedEndAt: games.plannedEndAt,
      status: games.status,
      createdByPersonId: games.createdByPersonId,
    });

  return {
    ...row,
    status: row.status as GameStatus,
    plannedEndAt: row.plannedEndAt ? row.plannedEndAt.toISOString() : null,
  };
}

export class GameDeleteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GameDeleteError";
    this.status = status;
  }
}

/**
 * Permanently removes a closed/cancelled game from history — the creator only
 * (plan item 3). Dependent rows go first, in the same `db.batch(...)` pattern as
 * `createGame` above: the neon-http driver has no interactive transactions, so a
 * single atomic batch is the only way to keep this all-or-nothing.
 *
 * `games.mismatch_player_id` points at one of this game's own players, so it is
 * nulled out before the players are deleted — otherwise deleting a still-referenced
 * player inside the same transaction would violate that foreign key.
 */
export async function deleteGame(gameId: string, deviceId: string): Promise<void> {
  const [game] = await db
    .select({
      id: games.id,
      status: games.status,
      createdByPersonId: games.createdByPersonId,
    })
    .from(games)
    .where(eq(games.id, gameId));
  if (!game) throw new GameDeleteError("המשחק לא נמצא", 404);
  if (game.status !== "closed" && game.status !== "cancelled") {
    throw new GameDeleteError("אפשר למחוק רק משחק שהסתיים", 409);
  }

  const [requester] = await db
    .select({ personId: players.personId })
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.deviceId, deviceId)))
    .limit(1);
  if (
    !game.createdByPersonId ||
    !requester?.personId ||
    requester.personId !== game.createdByPersonId
  ) {
    throw new GameDeleteError("רק מי שיצר את המשחק יכול למחוק אותו", 403);
  }

  const cashOutRows = await db
    .select({ id: cashOuts.id })
    .from(cashOuts)
    .where(eq(cashOuts.gameId, gameId));
  const cashOutIds = cashOutRows.map((row) => row.id);

  const handRows = await db.select({ id: hands.id }).from(hands).where(eq(hands.gameId, gameId));
  const handIds = handRows.map((row) => row.id);

  await db.batch([
    db.delete(cashOutChips).where(inArray(cashOutChips.cashOutId, cashOutIds)),
    db.delete(buyIns).where(eq(buyIns.gameId, gameId)),
    db.delete(cashOuts).where(eq(cashOuts.gameId, gameId)),
    db.delete(transfers).where(eq(transfers.gameId, gameId)),
    db.delete(handPlayers).where(inArray(handPlayers.handId, handIds)),
    db.delete(hands).where(eq(hands.gameId, gameId)),
    db.update(games).set({ mismatchPlayerId: null }).where(eq(games.id, gameId)),
    db.delete(players).where(eq(players.gameId, gameId)),
    db.delete(games).where(eq(games.id, gameId)),
  ]);
}
