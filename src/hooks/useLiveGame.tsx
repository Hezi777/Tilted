"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot, sumAgorot } from "@/lib/money";
import { haptic } from "@/lib/motion";
import type { LiveFeedItem, LiveGame } from "@/db/live-queries";

export interface PendingRebuy {
  opId: string;
  playerId: string;
  amount: number;
  playerName: string;
  createdAt: string;
}

export function shouldApplyPoll(sequence: number, newestAppliedSequence: number): boolean {
  return sequence >= newestAppliedSequence;
}

/**
 * How close two taps on one seat have to be before the second is read as an echo of
 * the first rather than a second rebuy. Long enough to catch a bouncing thumb, short
 * enough that somebody deliberately buying in twice is never blocked.
 */
export const DOUBLE_TAP_WINDOW_MS = 400;

/**
 * How often to ask whether anything moved, and how that stretches when nothing has.
 *
 * A poker table is busy in bursts and still in between. Asking twice a second all
 * evening kept the database awake for hours to be told nothing had happened -- and an
 * always-awake database is what actually spends the free tier, not the queries.
 *
 * So the interval walks outward while the table is quiet and snaps back to `min` the
 * moment something changes. Ten seconds is the ceiling because that is about how long
 * someone will stare at a stale pot before distrusting it.
 */
export const POLL_MIN_MS = 1_200;
export const POLL_MAX_MS = 10_000;
const POLL_GROWTH = 1.6;

/**
 * A full read runs at least this often regardless of the fingerprint.
 *
 * The fingerprint is a hash of the fields the live screen draws, and a hash can only
 * cover the fields somebody remembered to put in it. This is the safety net: if one is
 * ever missed, the screen is stale for up to half a minute rather than until reload.
 */
export const FULL_REFRESH_MS = 30_000;

/** The next interval after a poll that found nothing, capped. */
export function nextPollDelay(current: number): number {
  return Math.min(POLL_MAX_MS, Math.round(current * POLL_GROWTH));
}

function addMoney(...values: number[]): number {
  return Number(sumAgorot(values.map((value) => agorot(value))));
}

function subtractMoney(value: number, amount: number): number {
  return addMoney(value, -amount);
}

export async function afterCreateSettles<T>(
  createPromise: Promise<unknown> | undefined,
  deleteAction: () => Promise<T>,
): Promise<T> {
  if (createPromise) await createPromise.catch(() => undefined);
  return deleteAction();
}

/** Pure optimistic merge, exported so stale/pending ordering can be unit tested. */
export function mergePendingGame(
  serverGame: LiveGame,
  pending: readonly PendingRebuy[],
): { game: LiveGame; pending: PendingRebuy[] } {
  const seen = new Set(serverGame.feed.map((item) => item.opId));
  const stillPending = pending.filter((item) => !seen.has(item.opId));
  if (stillPending.length === 0) return { game: serverGame, pending: [] };

  const byPlayer = new Map(serverGame.players.map((player) => [player.id, player]));
  for (const item of stillPending) {
    const player = byPlayer.get(item.playerId);
    if (player) {
      byPlayer.set(item.playerId, {
        ...player,
        totalIn: addMoney(player.totalIn, item.amount),
        buyInCount: player.buyInCount + 1,
      });
    }
  }
  const optimisticFeed: LiveFeedItem[] = stillPending.map((item) => ({
    id: `pending:${item.opId}`,
    opId: item.opId,
    playerId: item.playerId,
    playerName: item.playerName,
    amount: item.amount,
    kind: "rebuy",
    createdAt: item.createdAt,
  }));
  return {
    game: {
      ...serverGame,
      pot: addMoney(serverGame.pot, Number(sumAgorot(stillPending.map((item) => agorot(item.amount))))),
      players: Array.from(byPlayer.values()).sort((a, b) => a.seatOrder - b.seatOrder),
      feed: [...optimisticFeed, ...serverGame.feed].slice(0, 12),
    },
    pending: stillPending,
  };
}

export function removePendingGame(game: LiveGame, opId: string): LiveGame {
  const item = game.feed.find((feedItem) => feedItem.opId === opId);
  if (!item || !item.id.startsWith("pending:")) return game;
  return {
    ...game,
    pot: subtractMoney(game.pot, item.amount),
    players: game.players.map((player) => player.id === item.playerId
      ? { ...player, totalIn: subtractMoney(player.totalIn, item.amount), buyInCount: Math.max(0, player.buyInCount - 1) }
      : player),
    feed: game.feed.filter((feedItem) => feedItem.opId !== opId),
  };
}

export function useLiveGame(gameId: string) {
  const [game, setGame] = useState<LiveGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingRebuy[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const createPromisesRef = useRef(new Map<string, Promise<unknown>>());
  const rebuyDetailsRef = useRef(new Map<string, { playerId: string; amount: number }>());
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);
  const lastRebuyAtRef = useRef(new Map<string, number>());
  const versionRef = useRef<string | null>(null);
  const delayRef = useRef(POLL_MIN_MS);
  const lastFullReadRef = useRef(0);

  // `initial` bypasses the visibility guard: section 5.4 pauses *polling* while the
  // tab is hidden, but a first load that is skipped never clears `loading`, and the
  // screen sits on skeletons until something happens to make the tab visible.
  //
  // `force` is how a write says "do not ask, just read": after a rebuy the local state
  // is already ahead of the server, and waiting for the fingerprint to disagree would
  // put a round trip between the tap and the truth.
  const poll = useCallback(async (initial = false, force = false) => {
    if (
      !initial &&
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      // Ask the cheap question first. Only a first load, an explicit refresh, or the
      // slow safety net skips it and pays for the whole game.
      const staleByClock = Date.now() - lastFullReadRef.current >= FULL_REFRESH_MS;
      if (!initial && !force && !staleByClock && versionRef.current !== null) {
        const { version } = await apiFetch<{ version: string }>(
          `/api/game/${gameId}/version`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setError(null);
        if (version === versionRef.current) {
          // Nothing moved. Wait a little longer before asking again.
          delayRef.current = nextPollDelay(delayRef.current);
          return;
        }
      }

      const response = await apiFetch<LiveGame & { version?: string }>(
        `/api/game/${gameId}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !shouldApplyPoll(sequence, appliedSequence.current)) return;
      appliedSequence.current = sequence;
      lastFullReadRef.current = Date.now();
      // The full read carries the fingerprint it was taken at, so the cheap poll has
      // something to compare against without a second request. It must come from the
      // server response and not from local state: the optimistic merge below changes
      // what is on screen without the server having moved.
      versionRef.current = response.version ?? null;
      // Something happened, so the table is awake again: back to the short interval.
      delayRef.current = POLL_MIN_MS;
      setGame(() => {
        const merged = mergePendingGame(response, pendingRef.current);
        pendingRef.current = merged.pending;
        return merged.game;
      });
      setError(null);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof ApiError ? reason.message : "שגיאה בטעינת המשחק");
    } finally {
      setLoading(false);
    }
  }, [gameId]);


  useEffect(() => {
    // A self-rescheduling timeout rather than a fixed interval, because the gap is no
    // longer a constant -- it stretches while the table is quiet and resets the moment
    // something moves.
    let timer = 0;
    let stopped = false;
    // The first pass through is the initial load, which reads in full and bypasses
    // the visibility guard; every pass after it is an ordinary poll. Folding both into
    // one chain keeps the reschedule in a single place.
    let first = true;
    const tick = async () => {
      const initial = first;
      first = false;
      await poll(initial);
      if (stopped) return;
      timer = window.setTimeout(() => void tick(), delayRef.current);
    };

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Coming back to the screen is the one moment staleness is most visible, so
        // it reads in full and starts the walk out again from the short interval.
        delayRef.current = POLL_MIN_MS;
        void poll(false, true);
      } else {
        controllerRef.current?.abort();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
    };
  }, [poll]);

  const undo = useCallback(async (opId: string, options?: { silent?: boolean }): Promise<boolean> => {
    const details = rebuyDetailsRef.current.get(opId);
    pendingRef.current = pendingRef.current.filter((item) => item.opId !== opId);
    setGame((current) => {
      if (!current) return current;
      // The row may be older than the twelve the shared feed keeps, in which case the
      // player's own list is the only place it still appears.
      const found =
        current.feed.find((item) => item.opId === opId) ??
        current.yourBuyIns.find((item) => item.opId === opId);
      if (!found) return current;
      return mergePendingGame({
        ...current,
        feed: current.feed.filter((item) => item.opId !== opId),
        yourBuyIns: current.yourBuyIns.filter((item) => item.opId !== opId),
        players: current.players.map((player) => player.id === found.playerId
          ? { ...player, totalIn: subtractMoney(player.totalIn, found.amount), buyInCount: Math.max(0, player.buyInCount - 1) }
          : player),
        pot: subtractMoney(current.pot, found.amount),
      }, pendingRef.current).game;
    });
    const createPromise = createPromisesRef.current.get(opId);
    const rowDetails = details ?? (() => {
      const current = game;
      const found =
        current?.feed.find((item) => item.opId === opId) ??
        current?.yourBuyIns.find((item) => item.opId === opId);
      return found ? { playerId: found.playerId, amount: found.amount } : undefined;
    })();
    try {
      if (!rowDetails) return false;
      const result = await afterCreateSettles(createPromise, () => apiFetch<{ deleted: boolean }>(`/api/game/${gameId}/buy-ins/${opId}`, {
        method: "DELETE",
        body: JSON.stringify(rowDetails),
      }));
      if (!result.deleted) return false;
      if (!options?.silent) toast.success("הריביי בוטל");
      return true;
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "ביטול הריביי נכשל");
      void poll();
      return false;
    } finally {
      createPromisesRef.current.delete(opId);
      rebuyDetailsRef.current.delete(opId);
    }
  }, [game, gameId, poll]);

  const addRebuy = useCallback((playerId: string, amount: number, options?: { silent?: boolean }) => {
    if (!Number.isInteger(amount) || amount <= 0) return;
    const player = game?.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    // A thumb that lands twice on one press is not two rebuys. Swallowing the echo
    // here rather than disabling the button keeps the tap instant, which the latency
    // rule requires, and keeps a deliberate second rebuy a moment later working.
    // Per player, because a host entering rebuys for two people in a row is normal.
    const now = Date.now();
    const previous = lastRebuyAtRef.current.get(playerId);
    if (previous !== undefined && now - previous < DOUBLE_TAP_WINDOW_MS) return;
    lastRebuyAtRef.current.set(playerId, now);
    const opId = crypto.randomUUID();
    const item: PendingRebuy = { opId, playerId, amount, playerName: player.name, createdAt: new Date().toISOString() };
    rebuyDetailsRef.current.set(opId, { playerId, amount });
    pendingRef.current = [...pendingRef.current, item];
    setGame((current) => {
      if (!current) return current;
      const player = current.players.find((candidate) => candidate.id === playerId);
      return {
        ...current,
        pot: addMoney(current.pot, amount),
        players: current.players.map((candidate) => candidate.id === playerId
          ? { ...candidate, totalIn: addMoney(candidate.totalIn, amount), buyInCount: candidate.buyInCount + 1 }
          : candidate),
        feed: [{ id: `pending:${opId}`, opId, playerId, playerName: player?.name ?? item.playerName, amount, kind: "rebuy" as const, createdAt: item.createdAt }, ...current.feed].slice(0, 12),
        yourBuyIns: playerId === current.youId
          ? [{ id: `pending:${opId}`, opId, playerId, playerName: player?.name ?? item.playerName, amount, kind: "rebuy" as const, createdAt: item.createdAt }, ...current.yourBuyIns]
          : current.yourBuyIns,
      };
    });
    // The single buzz for a rebuy. Every path into one -- the button, the custom
    // amount dialog, the host acting from a player card -- funnels through here, so
    // this is the only place it belongs.
    haptic();
    if (!options?.silent) {
      toast.success(`${player.name} הוסיף ריביי`, {
        duration: 5_000,
        // Section 8.2: the rebuy burst is the one place this asset appears.
        action: { label: "בטל", onClick: () => void undo(opId) },
      });
    }
    const createPromise = apiFetch(`/api/game/${gameId}/buy-ins`, {
      method: "POST",
      body: JSON.stringify({ playerId, amount, opId }),
    });
    createPromisesRef.current.set(opId, createPromise);
    void createPromise.catch((reason: unknown) => {
      pendingRef.current = pendingRef.current.filter((pending) => pending.opId !== opId);
      setGame((current) => current ? removePendingGame(current, opId) : current);
      toast.error(reason instanceof ApiError ? reason.message : "שמירת הריביי נכשלה");
    });
  }, [game, gameId, undo]);

  /**
   * A rebuy the table agreed to change after the fact -- half a rebuy, or the wrong
   * amount typed in a hurry. The ledger is append-only, so a correction is the old row
   * soft-deleted and a new one written, and the second half only runs if the first
   * succeeded: a failed removal must never leave the pot counting both.
   */
  const editRebuy = useCallback(async (opId: string, playerId: string, amount: number) => {
    if (!Number.isInteger(amount) || amount <= 0) return;
    if (!(await undo(opId, { silent: true }))) return;
    addRebuy(playerId, amount, { silent: true });
    toast.success("הריביי עודכן");
  }, [addRebuy, undo]);

  return { game, loading, error, addRebuy, undo, editRebuy, refresh: poll };
}
