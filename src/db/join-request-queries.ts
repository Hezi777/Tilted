/**
 * Knocking at a table, and the host answering.
 *
 * The room link is no longer the whole entitlement: having it gets you a knock, and the
 * host decides. That closes the gap the security review raised -- a four-character code
 * is brute-forceable, and a seat now reads phone numbers and can move the pot -- without
 * making the host type everybody's name at setup.
 *
 * Approval is what creates the seat, so everything downstream (`getLiveGame`, the pot,
 * settlement, history) is unchanged: it never sees a request, only the player row that
 * one turned into.
 */

import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, joinRequests, people, players } from "@/db/schema";
import {
  addPlayerToGame,
  getRosterContext,
  RosterConflictError,
} from "@/db/roster-queries";
import {
  assertCanManageRoster,
  requireActor,
  type ActorPlayer,
  type GameStatus,
} from "@/lib/authz";

/**
 * The host of a live table, or a refusal.
 *
 * Deliberately the same context and the same assert `addPlayerToGame` uses, so the rule
 * that decides who may answer the door is the rule that decides who may seat someone.
 */
async function requireActiveHost(
  gameId: string,
  actorPersonId: string,
): Promise<void> {
  const context = await getRosterContext(gameId, actorPersonId);
  if (!context) throw new RosterConflictError("המשחק לא נמצא");
  const actor = requireActor(context.actor as ActorPlayer | null);
  assertCanManageRoster(context.game.status as GameStatus, actor);
}

export interface JoinRequestRecord {
  id: string;
  personId: string;
  name: string;
  avatarKey: string | null;
  createdAt: string;
}

/** Where a person stands with a table they have the link to. */
export type JoinStanding =
  | { state: "seated"; gameId: string }
  | { state: "pending"; gameId: string }
  | { state: "none"; gameId: string };

async function activeGameByCode(code: string) {
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.code, code), eq(games.status, "active")))
    .limit(1);
  return game ?? null;
}

/**
 * Knocks, or reports that you are already in.
 *
 * Idempotent on both counts: a second knock is the same knock (the unique index), and
 * someone who already has a seat is told so rather than being queued behind the host.
 */
export async function requestToJoin(
  code: string,
  personId: string,
): Promise<JoinStanding> {
  const game = await activeGameByCode(code);
  if (!game) throw new RosterConflictError("המשחק לא נמצא או שכבר נסגר");

  const [seat] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.gameId, game.id),
        eq(players.personId, personId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);
  if (seat) return { state: "seated", gameId: game.id };

  await db
    .insert(joinRequests)
    .values({ gameId: game.id, personId })
    .onConflictDoNothing();
  return { state: "pending", gameId: game.id };
}

/** Where this person stands, for the join screen to poll while it waits. */
export async function getJoinStanding(
  code: string,
  personId: string,
): Promise<JoinStanding | null> {
  const game = await activeGameByCode(code);
  if (!game) return null;

  const [seat] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.gameId, game.id),
        eq(players.personId, personId),
        isNull(players.deletedAt),
      ),
    )
    .limit(1);
  if (seat) return { state: "seated", gameId: game.id };

  const [pending] = await db
    .select({ id: joinRequests.id })
    .from(joinRequests)
    .where(
      and(eq(joinRequests.gameId, game.id), eq(joinRequests.personId, personId)),
    )
    .limit(1);
  return pending
    ? { state: "pending", gameId: game.id }
    : { state: "none", gameId: game.id };
}

/** Who is waiting at the door. Host only -- the live screen polls this. */
export async function listJoinRequests(
  gameId: string,
  actorPersonId: string,
): Promise<JoinRequestRecord[]> {
  await requireActiveHost(gameId, actorPersonId);
  const rows = await db
    .select({
      id: joinRequests.id,
      personId: joinRequests.personId,
      name: people.name,
      avatarKey: people.avatarKey,
      createdAt: joinRequests.createdAt,
    })
    .from(joinRequests)
    .innerJoin(people, eq(people.id, joinRequests.personId))
    .where(eq(joinRequests.gameId, gameId))
    .orderBy(asc(joinRequests.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Lets someone in.
 *
 * The seat and its initial buy-in are `addPlayerToGame`'s job, so a seat created this
 * way is identical to one the host made -- claimed, because its owner is standing there
 * with the app open, which is the whole point of them having knocked.
 */
export async function approveJoinRequest(
  gameId: string,
  actorPersonId: string,
  personId: string,
): Promise<{ playerId: string }> {
  await requireActiveHost(gameId, actorPersonId);

  const [request] = await db
    .select({ id: joinRequests.id })
    .from(joinRequests)
    .where(
      and(eq(joinRequests.gameId, gameId), eq(joinRequests.personId, personId)),
    )
    .limit(1);
  if (!request) throw new RosterConflictError("הבקשה לא נמצאה");

  const player = await addPlayerToGame(gameId, actorPersonId, { personId });

  // Claimed on arrival, and charged its buy-in now rather than waiting for an accept
  // the person has already given by knocking. `addPlayerToGame` defers both because it
  // is written for a seat the host creates without asking.
  await db.execute(sql`
    WITH claimed AS (
      UPDATE ${players} p
      SET device_id = ${personId}
      WHERE p.id = ${player.id}::uuid AND p.device_id IS NULL
      RETURNING p.id
    )
    INSERT INTO buy_ins (id, game_id, player_id, amount, kind, op_id, created_by_device)
    SELECT gen_random_uuid(), ${gameId}::uuid, c.id, g.buy_in, 'initial',
      gen_random_uuid(), ${personId}
    FROM claimed c
    CROSS JOIN ${games} g
    WHERE g.id = ${gameId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM buy_ins existing
        WHERE existing.player_id = c.id
          AND existing.kind = 'initial'
          AND existing.deleted_at IS NULL
      )
  `);

  await db.delete(joinRequests).where(eq(joinRequests.id, request.id));
  return { playerId: player.id };
}

/** Turns someone away. They can knock again; this is "not now", not a ban. */
export async function rejectJoinRequest(
  gameId: string,
  actorPersonId: string,
  personId: string,
): Promise<void> {
  await requireActiveHost(gameId, actorPersonId);
  const removed = await db
    .delete(joinRequests)
    .where(
      and(eq(joinRequests.gameId, gameId), eq(joinRequests.personId, personId)),
    )
    .returning({ id: joinRequests.id });
  if (removed.length === 0) throw new RosterConflictError("הבקשה לא נמצאה");
}
