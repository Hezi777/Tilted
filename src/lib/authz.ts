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

/** Undo window for your own rebuy, after which only the host can remove it (5.4). */
export const UNDO_WINDOW_MS = 60_000;

export type GameStatus = "active" | "settling" | "closed" | "cancelled";

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
  | "undo_window_closed"
  | "already_deleted";

const STATUS: Record<AuthzCode, number> = {
  no_device: 401,
  not_in_game: 403,
  not_host: 403,
  not_your_seat: 403,
  game_not_active: 409,
  player_settled: 409,
  player_deleted: 409,
  undo_window_closed: 403,
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
  undo_window_closed: "עברו יותר מדקה, רק המארח יכול למחוק",
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

/**
 * Removing a buy-in: the host at any time, or the device that actually wrote the row,
 * within 60 seconds of the server's timestamp.
 *
 * Authorship is checked against created_by_device rather than the seat, so a host
 * correction filed on a guest's card is not undoable by that guest.
 */
export function assertCanDeleteBuyIn(
  status: GameStatus,
  actor: ActorPlayer,
  row: BuyInRow,
  now: Date = new Date(),
): void {
  requireActiveGame(status);
  assert(row.deletedAt === null, "already_deleted");
  if (actor.isHost) return;
  assert(
    row.createdByDevice !== null && row.createdByDevice === actor.deviceId,
    "not_your_seat",
  );
  assert(
    now.getTime() - row.createdAt.getTime() <= UNDO_WINDOW_MS,
    "undo_window_closed",
  );
}

/** Cash-outs, mismatch resolution, closing and cancelling are all host-only. */
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
