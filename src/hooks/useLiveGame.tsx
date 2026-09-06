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

  // `initial` bypasses the visibility guard: section 5.4 pauses *polling* while the
  // tab is hidden, but a first load that is skipped never clears `loading`, and the
  // screen sits on skeletons until something happens to make the tab visible.
  const poll = useCallback(async (initial = false) => {
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
      const response = await apiFetch<LiveGame>(`/api/game/${gameId}`, { signal: controller.signal });
      if (controller.signal.aborted || !shouldApplyPoll(sequence, appliedSequence.current)) return;
      appliedSequence.current = sequence;
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
    void poll(true);
    const interval = window.setInterval(() => void poll(), 3_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
      else controllerRef.current?.abort();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
    };
  }, [poll]);

  const undo = useCallback(async (opId: string) => {
    const details = rebuyDetailsRef.current.get(opId);
    pendingRef.current = pendingRef.current.filter((item) => item.opId !== opId);
    setGame((current) => {
      if (!current) return current;
      const found = current.feed.find((item) => item.opId === opId);
      if (!found) return current;
      return mergePendingGame({
        ...current,
        feed: current.feed.filter((item) => item.opId !== opId),
        players: current.players.map((player) => player.id === found.playerId
          ? { ...player, totalIn: subtractMoney(player.totalIn, found.amount), buyInCount: Math.max(0, player.buyInCount - 1) }
          : player),
        pot: subtractMoney(current.pot, found.amount),
      }, pendingRef.current).game;
    });
    const createPromise = createPromisesRef.current.get(opId);
    const rowDetails = details ?? (() => {
      const current = game;
      const found = current?.feed.find((item) => item.opId === opId);
      return found ? { playerId: found.playerId, amount: found.amount } : undefined;
    })();
    try {
      if (!rowDetails) return;
      const result = await afterCreateSettles(createPromise, () => apiFetch<{ deleted: boolean }>(`/api/game/${gameId}/buy-ins/${opId}`, {
        method: "DELETE",
        body: JSON.stringify(rowDetails),
      }));
      if (!result.deleted) return;
      toast.success("הריביי בוטל");
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "ביטול הריביי נכשל");
      void poll();
    } finally {
      createPromisesRef.current.delete(opId);
      rebuyDetailsRef.current.delete(opId);
    }
  }, [game, gameId, poll]);

  const addRebuy = useCallback((playerId: string, amount: number) => {
    if (!Number.isInteger(amount) || amount <= 0) return;
    const player = game?.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
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
      };
    });
    // The single buzz for a rebuy. Every path into one -- the button, the custom
    // amount dialog, the host acting from a player card -- funnels through here, so
    // this is the only place it belongs.
    haptic();
    toast.success(`${player.name} הוסיף ריביי`, {
      duration: 5_000,
      // Section 8.2: the rebuy burst is the one place this asset appears.
      action: { label: "בטל", onClick: () => void undo(opId) },
    });
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

  return { game, loading, error, addRebuy, undo, refresh: poll };
}
