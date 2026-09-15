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

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
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
import { buildKnockNotificationPayload } from "@/lib/push-payload";

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
  | { state: "rejected"; gameId: string }
  | { state: "none"; gameId: string }
  // The table moved on while this person was still waiting outside it. Distinct from
  // `none`, which is "you may knock": there is nothing left to knock at.
  | { state: "gone"; gameId: string; status: GameStatus };

/**
 * The game behind a code, whatever state it is in.
 *
 * Deliberately not filtered to `active`: a person waiting for the host to answer needs
 * to be told when the night moved to settling or closed without them, and a query that
 * only matches active games answers that with silence.
 */
async function gameByCode(code: string) {
  const [game] = await db
    .select({ id: games.id, status: games.status })
    .from(games)
    .where(eq(games.code, code))
    .orderBy(desc(games.createdAt))
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
  const game = await gameByCode(code);
  if (!game) {
    throw new RosterConflictError(
      "לא מצאנו שולחן עם הקוד הזה. בדקו את הקוד ונסו שוב",
    );
  }
  if (game.status !== "active") {
    throw new RosterConflictError("השולחן הזה כבר נסגר");
  }

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

  // Knocking again after a refusal clears the refusal -- that is what makes this "not
  // now" rather than a ban, and it puts the row back in front of the host.
  await db
    .insert(joinRequests)
    .values({ gameId: game.id, personId })
    .onConflictDoUpdate({
      target: [joinRequests.gameId, joinRequests.personId],
      set: { rejectedAt: null },
    });

  await notifyHostOfKnock(game.id, personId);
  return { state: "pending", gameId: game.id };
}

/**
 * Taps the host on the shoulder. Never throws and never blocks the knock: a guest who
 * has asked to join has asked, whether or not the notification lands.
 */
async function notifyHostOfKnock(gameId: string, personId: string): Promise<void> {
  try {
    const [[host], [guest]] = await Promise.all([
      db
        .select({ personId: players.personId })
        .from(players)
        .where(
          and(
            eq(players.gameId, gameId),
            eq(players.isHost, true),
            isNull(players.deletedAt),
          ),
        )
        .limit(1),
      db
        .select({ name: people.name })
        .from(people)
        .where(eq(people.id, personId))
        .limit(1),
    ]);
    if (!host?.personId) return;
    const { sendPushToPerson } = await import("@/lib/push");
    await sendPushToPerson(
      host.personId,
      buildKnockNotificationPayload({
        guestName: guest?.name ?? "מישהו",
        gameId,
      }),
    );
  } catch (error) {
    console.error("knock notification failed", error);
  }
}

/** Where this person stands, for the join screen to poll while it waits. */
export async function getJoinStanding(
  code: string,
  personId: string,
): Promise<JoinStanding | null> {
  const game = await gameByCode(code);
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

  // The seat check runs first on purpose: someone already seated stays seated even
  // after the night moves to settling, and should be let through to the table rather
  // than told it is gone.
  if (game.status !== "active") {
    return { state: "gone", gameId: game.id, status: game.status };
  }

  const [pending] = await db
    .select({ id: joinRequests.id, rejectedAt: joinRequests.rejectedAt })
    .from(joinRequests)
    .where(
      and(eq(joinRequests.gameId, game.id), eq(joinRequests.personId, personId)),
    )
    .limit(1);
  if (!pending) return { state: "none", gameId: game.id };
  return pending.rejectedAt
    ? { state: "rejected", gameId: game.id }
    : { state: "pending", gameId: game.id };
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
    // A refused knock stays on the table as a record, but it is not someone standing
    // at the door any more -- the host already answered it.
    .where(and(eq(joinRequests.gameId, gameId), isNull(joinRequests.rejectedAt)))
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
  // Marked, not deleted: the person outside polls for their standing, and a deleted
  // row reads back as "you have not knocked yet", which sent them straight back to
  // knocking at a host who had just said no.
  const refused = await db
    .update(joinRequests)
    .set({ rejectedAt: new Date() })
    .where(
      and(
        eq(joinRequests.gameId, gameId),
        eq(joinRequests.personId, personId),
        isNull(joinRequests.rejectedAt),
      ),
    )
    .returning({ id: joinRequests.id });
  if (refused.length === 0) throw new RosterConflictError("הבקשה לא נמצאה");
}
