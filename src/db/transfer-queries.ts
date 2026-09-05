/**
 * Persists the transfers `src/lib/settlement.ts` computes so "who has paid" survives a
 * refresh, and lets one be toggled paid/unpaid. Spec section 5.5/6 + plan item 5.
 *
 * The amounts and pairings always come from `getSettlementState`, which itself only
 * calls the locked `computeNets`/`settle` helpers. This file never recomputes a net or
 * a transfer; it only stores and reads the result, keyed on (game, from, to) so a
 * `paid_at` survives a re-sync after a mismatch resolution changes the numbers.
 */

import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { people, players, transfers } from "@/db/schema";
import { getActorForGame } from "@/db/cashout-queries";
import { getSettlementState, type SettlementTransfer } from "@/db/settlement-queries";
import { AuthzError } from "@/lib/authz";

export interface TransferParty {
  playerId: string;
  name: string;
  avatarKey: string | null;
  phone: string | null;
}

export interface TransferRecord {
  id: string;
  gameId: string;
  from: TransferParty;
  to: TransferParty;
  amount: number;
  paidAt: string | null;
  markedByDevice: string | null;
}

/**
 * Replaces the stored transfer rows for a game with the freshly computed set,
 * carrying `paid_at`/`marked_by_device` over for a pair whose amount is unchanged
 * or was merely recomputed. A pair that no longer owes anything is dropped, since
 * the debt it recorded does not exist anymore.
 */
async function syncTransfers(
  gameId: string,
  computed: readonly SettlementTransfer[],
): Promise<void> {
  const existing = await db
    .select({
      fromPlayerId: transfers.fromPlayerId,
      toPlayerId: transfers.toPlayerId,
      paidAt: transfers.paidAt,
      markedByDevice: transfers.markedByDevice,
    })
    .from(transfers)
    .where(eq(transfers.gameId, gameId));
  const carried = new Map(
    existing.map((row) => [`${row.fromPlayerId}:${row.toPlayerId}`, row]),
  );

  const writes = [
    db.delete(transfers).where(eq(transfers.gameId, gameId)),
    ...computed.map((transfer) => {
      const previous = carried.get(`${transfer.fromPlayerId}:${transfer.toPlayerId}`);
      return db.insert(transfers).values({
        gameId,
        fromPlayerId: transfer.fromPlayerId,
        toPlayerId: transfer.toPlayerId,
        amount: transfer.amount,
        paidAt: previous?.paidAt ?? null,
        markedByDevice: previous?.markedByDevice ?? null,
      });
    }),
  ];
  await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
}

/** Re-syncs and returns every transfer for a game, with each side's name/avatar/phone. */
export async function listTransfers(gameId: string): Promise<TransferRecord[] | null> {
  const state = await getSettlementState(gameId);
  if (!state) return null;

  await syncTransfers(gameId, state.transfers);

  const fromPerson = alias(people, "from_person");
  const toPerson = alias(people, "to_person");
  const fromPlayer = alias(players, "from_player");
  const toPlayer = alias(players, "to_player");

  const rows = await db
    .select({
      id: transfers.id,
      amount: transfers.amount,
      paidAt: transfers.paidAt,
      markedByDevice: transfers.markedByDevice,
      fromPlayerId: transfers.fromPlayerId,
      toPlayerId: transfers.toPlayerId,
      fromName: fromPlayer.name,
      fromAvatarKey: fromPlayer.avatarKey,
      fromPhone: fromPerson.phone,
      toName: toPlayer.name,
      toAvatarKey: toPlayer.avatarKey,
      toPhone: toPerson.phone,
    })
    .from(transfers)
    .innerJoin(fromPlayer, eq(fromPlayer.id, transfers.fromPlayerId))
    .innerJoin(toPlayer, eq(toPlayer.id, transfers.toPlayerId))
    .leftJoin(fromPerson, eq(fromPerson.id, fromPlayer.personId))
    .leftJoin(toPerson, eq(toPerson.id, toPlayer.personId))
    .where(eq(transfers.gameId, gameId));

  return rows.map((row) => ({
    id: row.id,
    gameId,
    from: {
      playerId: row.fromPlayerId,
      name: row.fromName,
      avatarKey: row.fromAvatarKey,
      phone: row.fromPhone,
    },
    to: {
      playerId: row.toPlayerId,
      name: row.toName,
      avatarKey: row.toAvatarKey,
      phone: row.toPhone,
    },
    amount: row.amount,
    paidAt: row.paidAt?.toISOString() ?? null,
    markedByDevice: row.markedByDevice,
  }));
}

/**
 * Toggles one transfer's paid state. Authorization reuses the single existing rule
 * (src/lib/authz.ts): the signed-in payer may mark their own transfer, and the host may
 * mark any transfer in the game. `getActorForGame` already applies
 * `requireActor`, so `access.actor` is guaranteed to be a live, undeleted seat.
 */
export async function setTransferPaid(
  gameId: string,
  actorPersonId: string,
  transferId: string,
  paid: boolean,
): Promise<TransferRecord[]> {
  const access = await getActorForGame(gameId, actorPersonId);
  if (!access) throw new Error("המשחק לא נמצא");
  const actor = access.actor;

  const [row] = await db
    .select({ fromPlayerId: transfers.fromPlayerId })
    .from(transfers)
    .where(and(eq(transfers.id, transferId), eq(transfers.gameId, gameId)));
  if (!row) throw new Error("ההעברה לא נמצאה");
  if (!actor.isHost && row.fromPlayerId !== actor.id) {
    throw new AuthzError("not_your_seat");
  }

  await db
    .update(transfers)
    .set({
      paidAt: paid ? new Date() : null,
      // Legacy column name; this value is now the authenticated Person id.
      markedByDevice: paid ? actorPersonId : null,
    })
    .where(and(eq(transfers.id, transferId), eq(transfers.gameId, gameId)));

  const state = await listTransfers(gameId);
  if (!state) throw new Error("המשחק לא נמצא");
  return state;
}
