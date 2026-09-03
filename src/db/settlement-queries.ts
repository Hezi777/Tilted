/** Read model for the UUID-based settlement screen (spec sections 5.6 and 7). */

import { agorot } from "@/lib/money";
import { formatWhatsAppSummary } from "@/lib/export";
import {
  computeNets,
  settle,
  type MismatchResolution,
  type PlayerLedger,
} from "@/lib/settlement";
import { getCashoutState, type CashoutState } from "@/db/cashout-queries";

export type SettlementOutcome = "winner" | "loser" | "even";

export interface SettlementPlayer {
  id: string;
  name: string;
  seatOrder: number;
  totalIn: number;
  cashOut: number;
  adjustment: number;
  net: number;
  outcome: SettlementOutcome;
}

export interface SettlementTransfer {
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  amount: number;
}

export interface SettlementState {
  id: string;
  name: string | null;
  status: CashoutState["status"];
  pot: number;
  players: SettlementPlayer[];
  transfers: SettlementTransfer[];
  /** Only split/assign are exportable resolution lines; recount means the count was fixed. */
  resolution: MismatchResolution | null;
  exportText: string;
}

export class SettlementUnavailableError extends Error {
  constructor(message = "הסגירה טרם הושלמה") {
    super(message);
    this.name = "SettlementUnavailableError";
  }
}

function toLedger(state: CashoutState): PlayerLedger[] {
  return state.players.map((player) => {
    if (player.cashOut === null) {
      throw new SettlementUnavailableError();
    }
    return {
      playerId: player.id,
      seatOrder: player.seatOrder,
      totalIn: agorot(player.totalIn),
      cashOut: agorot(player.cashOut),
      adjustment: agorot(player.adjustment),
    };
  });
}

function resolutionFromState(state: CashoutState): MismatchResolution | null {
  if (state.mismatchKind === "split") return { kind: "split" };
  if (state.mismatchKind === "assigned" && state.mismatchPlayerId) {
    return { kind: "assign", playerId: state.mismatchPlayerId };
  }
  return null;
}

/** Builds the deterministic result and transfer rows using the locked pure helpers. */
export async function getSettlementState(
  gameId: string,
): Promise<SettlementState | null> {
  const state = await getCashoutState(gameId);
  if (!state) return null;
  if (state.status === "active") {
    throw new SettlementUnavailableError("המשחק עדיין פעיל");
  }
  if (state.status === "cancelled") {
    throw new SettlementUnavailableError("המשחק בוטל");
  }

  const ledgers = toLedger(state);
  const nets = computeNets(ledgers);
  const transfers = settle(nets);
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const players = [...nets]
    .sort((a, b) => b.net - a.net || a.seatOrder - b.seatOrder)
    .map((net) => ({
      id: net.playerId,
      name: playersById.get(net.playerId)?.name ?? "",
      seatOrder: net.seatOrder,
      totalIn: playersById.get(net.playerId)?.totalIn ?? 0,
      cashOut: playersById.get(net.playerId)?.cashOut ?? 0,
      adjustment: playersById.get(net.playerId)?.adjustment ?? 0,
      net: net.net,
      outcome: net.net > 0 ? "winner" : net.net < 0 ? "loser" : "even",
    } satisfies SettlementPlayer));
  const names = new Map(players.map((player) => [player.id, player.name]));
  const displayTransfers = transfers.map((transfer) => ({
    fromPlayerId: transfer.fromPlayerId,
    fromName: names.get(transfer.fromPlayerId) ?? "",
    toPlayerId: transfer.toPlayerId,
    toName: names.get(transfer.toPlayerId) ?? "",
    amount: Number(transfer.amount),
  }));
  const resolution = resolutionFromState(state);
  const exportPlayers = players.map((player) => ({
    playerId: player.id,
    name: player.name,
  }));

  return {
    id: state.id,
    name: state.name,
    status: state.status,
    pot: state.pot,
    players,
    transfers: displayTransfers,
    resolution,
    exportText: formatWhatsAppSummary({
      gameName: state.name ?? "משחק",
      players: exportPlayers,
      ledgers,
      resolution: resolution ?? undefined,
    }),
  };
}
