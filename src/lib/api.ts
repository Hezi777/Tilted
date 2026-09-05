/**
 * Client-side fetch wrapper + the JSON shapes shared with the API routes.
 *
 * Every request carries `x-device-id`: mutating routes need it for the ownership
 * check (section 10 — "a phone writes only for its own player"), and read routes need
 * it to scope results to this device (the plan's "Scoping without auth"). Sending it
 * unconditionally is simpler than distinguishing the two per call site.
 *
 * Types here are imported by both client components and `src/db/queries.ts` on the
 * server, so a response shape only needs to be defined once.
 */

import { getDeviceId } from "@/lib/device";

export type GameStatus = "active" | "settling" | "closed" | "cancelled";

/** The typed error body every mutating route returns on failure. */
export interface ApiErrorBody {
  error: string;
  /** Present on Zod validation failures: field name -> messages. */
  issues?: Record<string, string[]>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly issues?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    this.issues = body.issues;
  }
}

/** One row of the home screen's past-games list. Spec section 5.1. */
export interface GameSummary {
  id: string;
  code: string;
  name: string | null;
  location: string | null;
  status: GameStatus;
  createdAt: string;
  closedAt: string | null;
  playerCount: number;
  /** Sum of live buy-ins, in agorot. */
  pot: number;
}

/** A regular from the roster. Spec section 5.2 / 5.7. */
export interface PersonSummary {
  id: string;
  name: string;
  nickname: string | null;
  /** Chosen chip character, or null to fall back to the deterministic one. */
  avatarKey: string | null;
}

/** Public roster payload used by the code-based join screen. */
export interface JoinRosterPlayer {
  id: string;
  name: string;
  nickname: string | null;
  avatarKey: string | null;
  seatOrder: number;
  isHost: boolean;
  claimed: boolean;
  claimedByCurrentDevice: boolean;
}

export interface JoinGameDetail {
  id: string;
  code: string;
  name: string | null;
  status: GameStatus;
  players: JoinRosterPlayer[];
  currentPlayerId: string | null;
  currentPlayerIsHost: boolean;
}

/**
 * Ownership + identity fields layered onto the live-game GET response
 * (plan item 7): where the evening is, any notes, and who may delete it.
 */
export interface GameOwnershipInfo {
  name: string | null;
  createdByPersonId: string | null;
  location: string | null;
  notes: string | null;
}

/** Host-only mid-evening rules edit body — PATCH /api/game/[id] (plan item 7). */
export interface UpdateGameRulesBody {
  name?: string;
  location?: string | null;
  notes?: string | null;
  /** Agorot. */
  buyIn?: number;
  /** Agorot. */
  rebuyAmount?: number;
  plannedEndAt?: string;
}

/** One side of a transfer: who they are and how to reach them for Bit. */
export interface TransferParty {
  playerId: string;
  name: string;
  avatarKey: string | null;
  phone: string | null;
}

/** A transfer computed by settlement and persisted so its paid state survives a refresh. */
export interface TransferRecord {
  id: string;
  gameId: string;
  from: TransferParty;
  to: TransferParty;
  amount: number;
  paidAt: string | null;
  markedByDevice: string | null;
}

/** Response of `PATCH /api/game/[id]/players/[playerId]` (plan item 10, seating). */
export interface SetTableSeatResponse {
  tableSeat: number | null;
}

/**
 * Fetches `input`, attaching this device's id and a JSON content type, and returns
 * the parsed body. Throws `ApiError` on a non-2xx response.
 */
export async function apiFetch<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-device-id", getDeviceId());
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, { ...init, headers });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (body as ApiErrorBody | null) ?? { error: "בקשה נכשלה" },
    );
  }

  return body as T;
}
