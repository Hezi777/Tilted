/** Queries for the v2 music shelf and memorable-hand journal (plan items 11/12). */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { games, handPlayers, hands, players, playlists } from "@/db/schema";
import {
  parseHandBoard,
  serializeHandBoard,
  type HandBoard,
} from "@/lib/memorable-hand";

export type { HandBoard } from "@/lib/memorable-hand";

type GameStatus = "active" | "settling" | "closed" | "cancelled";

export class MusicHandAccessError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "MusicHandAccessError";
    this.status = status;
  }
}

export interface PlaylistRecord {
  id: string;
  name: string;
  url: string;
  sortOrder: number;
}

export interface HandPlayerInput {
  playerId: string;
  holeCards: string | null;
  delta: number;
}

export interface HandPlayerRecord extends HandPlayerInput {
  name: string;
  avatarKey: string | null;
}

export interface MemorableHandRecord {
  id: string;
  gameId: string;
  title: string;
  note: string | null;
  board: HandBoard;
  potAmount: number | null;
  winnerPlayerId: string;
  winnerName: string;
  createdAt: string;
  players: HandPlayerRecord[];
}

interface GameAccess {
  playerId: string;
  isHost: boolean;
  status: GameStatus;
}

async function requireGameAccess(
  gameId: string,
  personId: string,
): Promise<GameAccess> {
  const [row] = await db
    .select({
      playerId: players.id,
      isHost: players.isHost,
      status: games.status,
    })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(
      and(
        eq(players.gameId, gameId),
        eq(players.personId, personId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw new MusicHandAccessError("אינך משתתף במשחק הזה");
  return row;
}

async function requireActiveHost(
  gameId: string,
  personId: string,
): Promise<void> {
  const access = await requireGameAccess(gameId, personId);
  if (!access.isHost) throw new MusicHandAccessError("רק המארח יכול לבצע את הפעולה");
  if (access.status !== "active") {
    throw new MusicHandAccessError("המשחק כבר לא פעיל", 409);
  }
}

/** The global poker-playlist shelf, readable from a game the viewer participates in. */
export async function listPlaylistsForParticipant(
  gameId: string,
  personId: string,
): Promise<PlaylistRecord[]> {
  await requireGameAccess(gameId, personId);
  return db
    .select({
      id: playlists.id,
      name: playlists.name,
      url: playlists.url,
      sortOrder: playlists.sortOrder,
    })
    .from(playlists)
    .orderBy(asc(playlists.sortOrder), asc(playlists.name));
}

export async function createPlaylist(
  gameId: string,
  personId: string,
  input: { name: string; url: string },
): Promise<PlaylistRecord> {
  await requireActiveHost(gameId, personId);
  const existing = await db
    .select({ sortOrder: playlists.sortOrder })
    .from(playlists)
    .orderBy(desc(playlists.sortOrder))
    .limit(1);
  const [created] = await db
    .insert(playlists)
    .values({
      name: input.name,
      url: input.url,
      sortOrder: (existing[0]?.sortOrder ?? -1) + 1,
    })
    .returning({
      id: playlists.id,
      name: playlists.name,
      url: playlists.url,
      sortOrder: playlists.sortOrder,
    });
  return created;
}

export async function deletePlaylist(
  gameId: string,
  personId: string,
  playlistId: string,
): Promise<void> {
  await requireActiveHost(gameId, personId);
  const removed = await db
    .delete(playlists)
    .where(eq(playlists.id, playlistId))
    .returning({ id: playlists.id });
  if (removed.length === 0) {
    throw new MusicHandAccessError("הפלייליסט לא נמצא", 404);
  }
}

export async function listHandsForParticipant(
  gameId: string,
  personId: string,
): Promise<MemorableHandRecord[]> {
  await requireGameAccess(gameId, personId);
  const handRows = await db
    .select({
      id: hands.id,
      title: hands.title,
      note: hands.note,
      board: hands.board,
      potAmount: hands.potAmount,
      winnerPlayerId: hands.winnerPlayerId,
      winnerName: players.name,
      createdAt: hands.createdAt,
    })
    .from(hands)
    .innerJoin(players, eq(players.id, hands.winnerPlayerId))
    .where(eq(hands.gameId, gameId))
    .orderBy(desc(hands.createdAt), desc(hands.id));

  if (handRows.length === 0) return [];
  const participantRows = await db
    .select({
      handId: handPlayers.handId,
      playerId: handPlayers.playerId,
      name: players.name,
      avatarKey: players.avatarKey,
      holeCards: handPlayers.holeCards,
      delta: handPlayers.delta,
    })
    .from(handPlayers)
    .innerJoin(players, eq(players.id, handPlayers.playerId))
    .where(inArray(handPlayers.handId, handRows.map((hand) => hand.id)))
    .orderBy(asc(players.seatOrder));
  const participantsByHand = new Map<string, HandPlayerRecord[]>();
  for (const participant of participantRows) {
    const records = participantsByHand.get(participant.handId) ?? [];
    records.push({
      playerId: participant.playerId,
      name: participant.name,
      avatarKey: participant.avatarKey,
      holeCards: participant.holeCards,
      delta: Number(participant.delta ?? 0),
    });
    participantsByHand.set(participant.handId, records);
  }

  return handRows.map((hand) => ({
    id: hand.id,
    gameId,
    title: hand.title ?? "יד בלתי נשכחת",
    note: hand.note,
    board: parseHandBoard(hand.board),
    potAmount: hand.potAmount === null ? null : Number(hand.potAmount),
    // The inner join above excludes legacy rows without a recorded winner.
    winnerPlayerId: hand.winnerPlayerId!,
    winnerName: hand.winnerName,
    createdAt: hand.createdAt.toISOString(),
    players: participantsByHand.get(hand.id) ?? [],
  }));
}

export async function createMemorableHand(
  gameId: string,
  personId: string,
  input: {
    title: string;
    note: string | null;
    board: HandBoard;
    potAmount: number | null;
    winnerPlayerId: string;
    players: HandPlayerInput[];
  },
): Promise<MemorableHandRecord> {
  await requireActiveHost(gameId, personId);
  const playerIds = input.players.map((player) => player.playerId);
  const validPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.gameId, gameId),
        inArray(players.id, playerIds),
        isNull(players.deletedAt),
      ),
    );
  if (validPlayers.length !== playerIds.length) {
    throw new MusicHandAccessError("אחד השחקנים לא שייך למשחק", 400);
  }

  const handId = randomUUID();
  await db.batch([
    db.insert(hands).values({
      id: handId,
      gameId,
      title: input.title,
      note: input.note,
      board: serializeHandBoard(input.board),
      potAmount: input.potAmount,
      winnerPlayerId: input.winnerPlayerId,
    }),
    db.insert(handPlayers).values(
      input.players.map((player) => ({
        handId,
        playerId: player.playerId,
        holeCards: player.holeCards,
        delta: player.delta,
      })),
    ),
  ]);

  const records = await listHandsForParticipant(gameId, personId);
  const created = records.find((record) => record.id === handId);
  if (!created) throw new Error("היד נשמרה אך לא נטענה");
  return created;
}

export async function deleteMemorableHand(
  gameId: string,
  personId: string,
  handId: string,
): Promise<void> {
  await requireActiveHost(gameId, personId);
  const removed = await db
    .delete(hands)
    .where(and(eq(hands.id, handId), eq(hands.gameId, gameId)))
    .returning({ id: hands.id });
  if (removed.length === 0) {
    throw new MusicHandAccessError("היד לא נמצאה", 404);
  }
}
