/**
 * Persists the transfers `src/lib/settlement.ts` computes so "who has paid" survives a
 * refresh, and lets one be toggled paid/unpaid. Spec section 5.5/6 + plan item 5.
 *
 * The amounts and pairings always come from `getSettlementState`, which itself only
 * calls the locked `computeNets`/`settle` helpers. This file never recomputes a net or
 * a transfer; it only stores and reads the result, keyed on (game, from, to) so a
 * `paid_at` survives a re-sync after a mismatch resolution changes the numbers.
 */

import { and, eq, inArray } from "drizzle-orm";
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

function pairKey(row: { fromPlayerId: string; toPlayerId: string }): string {
  return `${row.fromPlayerId}:${row.toPlayerId}`;
}

/**
 * Brings the stored transfer rows in line with the freshly computed set: a pair that
 * still owes is updated in place, and one that no longer owes anything is dropped,
 * since the debt it recorded does not exist anymore.
 *
 * Updating in place rather than replacing the table is the point. This runs on every
 * read, so a delete-then-insert minted a new primary key each time the settlement
 * screen was opened -- and a second phone loading the page invalidated the id the
 * first phone was still holding, so its "mark as paid" hit a row that no longer
 * existed. The upsert rides `transfers_game_from_to_unique`, which makes (game, from,
 * to) the stable identity it always was in practice, and leaves `id`, `paid_at` and
 * `marked_by_device` untouched on a row that persists.
 */
async function syncTransfers(
  gameId: string,
  computed: readonly SettlementTransfer[],
): Promise<void> {
  const existing = await db
    .select({
      id: transfers.id,
      fromPlayerId: transfers.fromPlayerId,
      toPlayerId: transfers.toPlayerId,
    })
    .from(transfers)
    .where(eq(transfers.gameId, gameId));

  const wanted = new Set(computed.map(pairKey));
  const staleIds = existing
    .filter((row) => !wanted.has(pairKey(row)))
    .map((row) => row.id);

  const writes = [
    ...(staleIds.length > 0
      ? [db.delete(transfers).where(inArray(transfers.id, staleIds))]
      : []),
    ...computed.map((transfer) =>
      db
        .insert(transfers)
        .values({
          gameId,
          fromPlayerId: transfer.fromPlayerId,
          toPlayerId: transfer.toPlayerId,
          amount: transfer.amount,
        })
        .onConflictDoUpdate({
          target: [
            transfers.gameId,
            transfers.fromPlayerId,
            transfers.toPlayerId,
          ],
          // Only the amount. Touching paid_at here would un-tick a transfer every
          // time somebody opened the screen.
          set: { amount: transfer.amount },
        }),
    ),
  ];
  if (writes.length === 0) return;
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
