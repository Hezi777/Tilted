/**
 * The entire authorization model. Spec sections 5.4 and 10.
 *
 * "A phone may insert a buy-in only for the player whose device_id matches its own.
 * The host is the single exception." There is no other rule anywhere in the app, and
 * none should be added — the room code is explicitly not a security boundary, because
 * everyone in the living room is trusted.
 *
 * These are pure predicates over rows already loaded. Route handlers do the loading
 * and turn an AuthzError into a status code, so the rules stay testable without a
 * database.
 */

export type GameStatus = "active" | "settling" | "closed" | "cancelled";

/** Who may type a player's final number. Mirrors the `result_entry` enum. */
export type ResultEntry = "host_only" | "players";

export interface ActorPlayer {
  id: string;
  isHost: boolean;
  deviceId: string | null;
  settledAt: Date | null;
  deletedAt: Date | null;
}

export interface TargetPlayer {
  id: string;
  settledAt: Date | null;
  deletedAt: Date | null;
}

export interface BuyInRow {
  id: string;
  playerId: string;
  kind: "initial" | "rebuy";
  createdByDevice: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export type AuthzCode =
  | "no_device"
  | "not_in_game"
  | "not_host"
  | "not_your_seat"
  | "game_not_active"
  | "player_settled"
  | "player_deleted"
  | "initial_buy_in"
  | "already_deleted";

const STATUS: Record<AuthzCode, number> = {
  no_device: 401,
  not_in_game: 403,
  not_host: 403,
  not_your_seat: 403,
  game_not_active: 409,
  player_settled: 409,
  player_deleted: 409,
  initial_buy_in: 409,
  already_deleted: 409,
};

/** Hebrew because these surface directly in a toast. */
const MESSAGE: Record<AuthzCode, string> = {
  no_device: "לא זוהה מכשיר",
  not_in_game: "אינך משתתף במשחק הזה",
  not_host: "רק המארח יכול לעשות את זה",
  not_your_seat: "אפשר לעדכן רק את הכרטיס שלך",
  game_not_active: "המשחק כבר לא פעיל",
  player_settled: "השחקן כבר סגר חשבון",
  player_deleted: "השחקן הוסר מהמשחק",
  initial_buy_in: "אי אפשר להסיר את הכניסה הראשונה",
  already_deleted: "השורה כבר נמחקה",
};

export class AuthzError extends Error {
  readonly code: AuthzCode;
  readonly status: number;

  constructor(code: AuthzCode) {
    super(MESSAGE[code]);
    this.name = "AuthzError";
    this.code = code;
    this.status = STATUS[code];
  }
}

function assert(condition: boolean, code: AuthzCode): asserts condition {
  if (!condition) throw new AuthzError(code);
}

/** The device must hold a live seat in this game to do anything at all. */
export function requireActor(actor: ActorPlayer | null): ActorPlayer {
  assert(actor !== null, "not_in_game");
  assert(actor.deletedAt === null, "not_in_game");
  return actor;
}

export function requireHost(actor: ActorPlayer): void {
  assert(actor.isHost, "not_host");
}

export function requireActiveGame(status: GameStatus): void {
  assert(status === "active", "game_not_active");
}

/**
 * Inserting a buy-in: your own seat, or anyone's if you are the host.
 *
 * The status and settled checks are here as a second line of defence and for a clean
 * error message, but they are NOT the real guard — a rebuy racing the host's "end
 * game" can pass this check and still commit afterwards. The insert itself must be
 * conditional on the game still being active in the same statement. Otherwise the
 * pot grows after the chips were counted and the ledger stops summing to zero.
 */
export function assertCanInsertBuyIn(
  status: GameStatus,
  actor: ActorPlayer,
  target: TargetPlayer,
): void {
  requireActiveGame(status);
  assert(target.deletedAt === null, "player_deleted");
  assert(target.settledAt === null, "player_settled");
  if (actor.isHost) return;
  assert(actor.id === target.id, "not_your_seat");
}

/** An active player may freeze their own result; the host may do it for any seat. */
export function assertCanCashOutEarly(
  status: GameStatus,
  actor: ActorPlayer,
  target: TargetPlayer,
): void {
  requireActiveGame(status);
  assert(target.deletedAt === null, "player_deleted");
  assert(target.settledAt === null, "player_settled");
  if (actor.isHost) return;
  assert(actor.id === target.id, "not_your_seat");
}

/**
 * Removing a rebuy: the host at any seat, or a player at their own, for as long as the
 * game is open.
 *
 * This used to close sixty seconds after the row was written, which read as a rule
 * about honesty and worked as a rule about reflexes -- an accidental tap noticed two
 * hands later could only be fixed by the host, and the table agreeing to a smaller
 * rebuy mid-evening could not be recorded at all. The product owner retired the window
 * on 2026-09-13. The single authorization rule is untouched: your own row, and the
 * host's exception.
 *
 * Ownership is the seat, not the device that wrote the row, so a rebuy the host filed
 * on your card is still yours to correct.
 *
 * The initial buy-in is not a rebuy and nobody removes it -- a seat without one is a
 * player who never bought in, which the settlement has no way to read.
 */
export function assertCanDeleteBuyIn(
  status: GameStatus,
  actor: ActorPlayer,
  row: BuyInRow,
): void {
  requireActiveGame(status);
  assert(row.deletedAt === null, "already_deleted");
  assert(row.kind === "rebuy", "initial_buy_in");
  if (actor.isHost) return;
  assert(row.playerId === actor.id, "not_your_seat");
}

/**
 * Entering a player's result. The host may always write anyone's row; whether a player
 * may write their own is the table's own policy, chosen when the game was opened
 * (requirements item 4). This is not a second permission system — it is the same single
 * rule, with the host exception, narrowed by a setting.
 */
export function assertCanEnterResult(
  status: GameStatus,
  actor: ActorPlayer,
  targetPlayerId: string,
  resultEntry: ResultEntry,
): void {
  assert(status === "active" || status === "settling", "game_not_active");
  if (actor.isHost) return;
  assert(resultEntry === "players", "not_host");
  assert(actor.id === targetPlayerId, "not_your_seat");
}

/** Final counting, mismatch resolution, closing and cancelling are host-only. */
export function assertCanSettle(status: GameStatus, actor: ActorPlayer): void {
  assert(status === "active" || status === "settling", "game_not_active");
  requireHost(actor);
}

/** Adding, removing or releasing a seat is host-only, and only while active. */
export function assertCanManageRoster(
  status: GameStatus,
  actor: ActorPlayer,
): void {
  requireActiveGame(status);
  requireHost(actor);
}
