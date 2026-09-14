"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { AmountInput } from "@/components/AmountInput";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { ChipCounter } from "@/components/ChipCounter";
import { Money } from "@/components/Money";
import { ArcPill } from "@/components/ui/arc-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot } from "@/lib/money";
import { totalAgorotForCounts, type ChipCounts } from "@/lib/chips";
import { mergeCashoutPlayers } from "@/lib/cashout-sync";
import { computeNets, countedTotal, mismatchDelta, type PlayerLedger } from "@/lib/settlement";

interface CashoutPlayer {
  id: string;
  name: string;
  avatarKey: string | null;
  seatOrder: number;
  settledAt: string | null;
  totalIn: number;
  cashOut: number | null;
  adjustment: number;
  chipCounts: ChipCounts;
}

interface CashoutChipSet {
  id: string;
  name: string;
  denominations: Array<{
    id: string;
    color: string;
    edgeColor: string | null;
    value: number;
  }>;
}

interface CashoutState {
  id: string;
  name: string | null;
  status: "active" | "settling" | "closed" | "cancelled";
  pot: number;
  counted: number;
  difference: number;
  mismatchKind: "none" | "recount" | "split" | "assigned";
  mismatchAmount: number | null;
  mismatchPlayerId: string | null;
  chipSet: CashoutChipSet | null;
  players: CashoutPlayer[];
  /** Who is asking -- the host is the one seat allowed to override a frozen early exit. */
  viewerIsHost: boolean;
  viewerPlayerId: string;
}

function ledgers(state: CashoutState): PlayerLedger[] {
  return state.players.map((player) => ({
    playerId: player.id,
    seatOrder: player.seatOrder,
    totalIn: agorot(player.totalIn),
    cashOut: player.cashOut === null ? null : agorot(player.cashOut),
    adjustment: agorot(player.adjustment),
  }));
}

function errorText(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "משהו השתבש";
}

export default function CashoutScreen({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<CashoutState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savingIds, setSavingIds] = React.useState<Set<string>>(new Set());
  const reduceMotion = useReducedMotion();
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [overriddenIds, setOverriddenIds] = React.useState<Set<string>>(new Set());
  const [assigning, setAssigning] = React.useState(false);
  const chipSaveTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chipSaveVersions = React.useRef(new Map<string, number>());

  function addTo(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }
  function removeFrom(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setState(await apiFetch<CashoutState>(`/api/game/${gameId}/cashout`));
      setLoadError(null);
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  React.useEffect(() => {
    // Initial data must be loaded from the route when this client screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  React.useEffect(
    () => () => {
      for (const timer of chipSaveTimers.current.values()) clearTimeout(timer);
    },
    [],
  );

  // A player sitting in checkout has to follow the host to the settlement screen the
  // moment the game closes, and has to see other players' completed counts land --
  // without this poll ever overwriting the row this client is itself mid-edit on
  // (a chip tapped a moment ago, still inside its debounce window or its save).
  const poll = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    try {
      const next = await apiFetch<CashoutState>(`/api/game/${gameId}/cashout`);
      if (next.status === "closed") {
        router.push(`/game/${gameId}/settlement`);
        return;
      }
      if (next.status === "cancelled") {
        router.push("/");
        return;
      }
      setState((current) => {
        if (!current) return next;
        const editingIds = new Set(chipSaveTimers.current.keys());
        for (const id of savingIds) editingIds.add(id);
        return {
          ...next,
          players: mergeCashoutPlayers(next.players, current.players, editingIds),
        };
      });
    } catch {
      // A transient poll failure keeps the last-known state; only the initial load
      // surfaces an error banner.
    }
  }, [gameId, router, savingIds]);

  React.useEffect(() => {
    const interval = window.setInterval(() => void poll(), 3_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  function optimisticAmount(playerId: string, amount: number | null) {
    setState((current) => {
      if (!current) return current;
      const players = current.players.map((player) =>
        player.id === playerId ? { ...player, cashOut: amount } : player,
      );
      const next = { ...current, players };
      const nextLedgers = ledgers(next);
      return {
        ...next,
        counted: Number(countedTotal(nextLedgers)),
        difference: mismatchDelta(nextLedgers),
        mismatchKind: "none",
        mismatchAmount: null,
        mismatchPlayerId: null,
      };
    });
  }

  function optimisticChipCounts(playerId: string, chipCounts: ChipCounts) {
    setState((current) => {
      if (!current?.chipSet) return current;
      const amount = Number(
        totalAgorotForCounts(
          current.chipSet.denominations.map((denomination) => ({
            id: denomination.id,
            value: agorot(denomination.value),
          })),
          chipCounts,
        ),
      );
      const players = current.players.map((player) =>
        player.id === playerId
          ? { ...player, chipCounts, cashOut: amount }
          : player,
      );
      const next = { ...current, players };
      const nextLedgers = ledgers(next);
      return {
        ...next,
        counted: Number(countedTotal(nextLedgers)),
        difference: mismatchDelta(nextLedgers),
        mismatchKind: "none",
        mismatchAmount: null,
        mismatchPlayerId: null,
      };
    });
  }

  async function save(playerId: string, amount: number) {
    if (!state) return;
    const previous = state;
    addTo(setSavingIds, playerId);
    try {
      const next = await apiFetch<CashoutState>(
        `/api/game/${gameId}/cashout`,
        {
          method: "POST",
          body: JSON.stringify({ playerId, amount, early: state.status === "active" }),
        },
      );
      /* The response is authoritative for the player just saved and for the
         ledger, but it also carries every other player's counts as last persisted
         -- which would discard whatever they have tapped in and not yet committed.
         Only the saved player takes the server's counts. */
      setState((current) => {
        if (!current) return next;
        const local = new Map(current.players.map((entry) => [entry.id, entry.chipCounts]));
        return {
          ...next,
          players: next.players.map((entry) => {
            if (entry.id === playerId) return entry;
            const counts = local.get(entry.id);
            return counts ? { ...entry, chipCounts: counts } : entry;
          }),
        };
      });
    } catch (error) {
      setState(previous);
      toast.error(errorText(error));
    } finally {
      removeFrom(setSavingIds, playerId);
    }
  }

  async function persistChipCounts(
    playerId: string,
    chipCounts: ChipCounts,
    version: number,
  ) {
    if (!state) return;
    removeFrom(setPendingIds, playerId);
    addTo(setSavingIds, playerId);
    try {
      const next = await apiFetch<CashoutState>(`/api/game/${gameId}/cashout`, {
        method: "POST",
        body: JSON.stringify({
          playerId,
          chipCounts,
          early: state.status === "active",
        }),
      });
      if (chipSaveVersions.current.get(playerId) !== version) return;
      setState((current) => {
        if (!current) return next;
        const savedPlayer = next.players.find((player) => player.id === playerId);
        if (!savedPlayer) return current;
        const merged = {
          ...current,
          mismatchKind: next.mismatchKind,
          mismatchAmount: next.mismatchAmount,
          mismatchPlayerId: next.mismatchPlayerId,
          players: current.players.map((player) =>
            player.id === playerId ? savedPlayer : player,
          ),
        };
        const nextLedgers = ledgers(merged);
        return {
          ...merged,
          counted: Number(countedTotal(nextLedgers)),
          difference: mismatchDelta(nextLedgers),
        };
      });
    } catch (error) {
      if (chipSaveVersions.current.get(playerId) === version) {
        toast.error(errorText(error));
        void load();
      }
    } finally {
      if (chipSaveVersions.current.get(playerId) === version) {
        removeFrom(setSavingIds, playerId);
      }
    }
  }

  function updateChipCounts(playerId: string, chipCounts: ChipCounts) {
    if (!state) return;
    optimisticChipCounts(playerId, chipCounts);
    if (state.status !== "settling") return;
    addTo(setPendingIds, playerId);

    const currentTimer = chipSaveTimers.current.get(playerId);
    if (currentTimer) clearTimeout(currentTimer);
    const version = (chipSaveVersions.current.get(playerId) ?? 0) + 1;
    chipSaveVersions.current.set(playerId, version);
    chipSaveTimers.current.set(
      playerId,
      setTimeout(() => {
        chipSaveTimers.current.delete(playerId);
        void persistChipCounts(playerId, chipCounts, version);
      }, 350),
    );
  }

  function saveEarlyChipCounts(player: CashoutPlayer) {
    const version = (chipSaveVersions.current.get(player.id) ?? 0) + 1;
    chipSaveVersions.current.set(player.id, version);
    void persistChipCounts(player.id, player.chipCounts, version);
  }

  async function changeStatus(status: "settling" | "closed" | "active") {
    try {
      const next = await apiFetch<CashoutState>(`/api/game/${gameId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setState(next);
      // Closing the game has to reach the server layout too, or the open-table strip
      // keeps advertising a table that has just been settled.
      if (status === "closed") {
        router.refresh();
        router.push(`/game/${gameId}/settlement`);
      }
      // Back to the table. The live screen is where rebuys live, and it is what the
      // host tapped past by accident to get here.
      if (status === "active") {
        router.refresh();
        router.push(`/game/${gameId}`);
      }
    } catch (error) {
      toast.error(errorText(error));
      void load();
    }
  }

  async function resolve(
    kind: "recount" | "split" | "assign",
    playerId?: string,
  ) {
    const previous = state;
    if (!previous) return;
    setAssigning(false);
    try {
      const next = await apiFetch<CashoutState>(
        `/api/game/${gameId}/resolve-mismatch`,
        {
          method: "POST",
          body: JSON.stringify({ kind, ...(playerId ? { playerId } : {}) }),
        },
      );
      setState(next);
    } catch (error) {
      setState(previous);
      toast.error(errorText(error));
    }
  }

  const missing = state?.players.some((player) => player.cashOut === null) ?? false;
  const mismatch = (state?.difference ?? 0) !== 0;
  const resolved =
    state?.mismatchKind === "split" || state?.mismatchKind === "assigned";
  const liveNets = React.useMemo(
    () => new Map(state ? computeNets(ledgers(state)).map((net) => [net.playerId, net.net]) : []),
    [state],
  );
  // Mirrors resolveMismatch's own winner test (raw cash-out minus total-in, before
  // any stored adjustment) so the button disables exactly when the server would reject it.
  const hasWinner =
    state?.players.some(
      (player) => player.cashOut !== null && player.cashOut - player.totalIn > 0,
    ) ?? false;
  const blockReason = missing
    ? "יש להזין סכום לכל השחקנים כדי לסגור את המשחק."
    : mismatch && !resolved
    ? "אי אפשר לסגור כשיש הפרש בספירה. יש לבחור פתרון למעלה."
    : null;

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader
        title="סופרים את הקופה"
        subtitle={
          state
            ? state.name ?? "המשחק"
            : "מזינים כמה נשאר לכל שחקן"
        }
        backHref={`/game/${gameId}`}
        backLabel="חזרה למשחק"
      />
      <div dir="rtl" className="flex w-full flex-1 flex-col gap-5 p-5 pb-8">
        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loading && loadError && (
          <div className="surface-card flex flex-col items-center gap-3 rounded-3xl p-5 text-center">
            <p className="t-body text-loss">{loadError}</p>
            <Button variant="secondary" onClick={() => void load()}>
              נסה שוב
            </Button>
          </div>
        )}

        {!loading && state && (
          <>
            {state.status === "closed" && (
              <div className="surface-card flex flex-col gap-3 rounded-3xl p-4 text-center">
                <p className="t-body">המשחק כבר נסגר וסוכם. אפשר לצפות בסיכום ולשתף אותו.</p>
                <Button asChild className="w-full">
                  <Link href={`/game/${gameId}/settlement`}>למסך הסיכום</Link>
                </Button>
              </div>
            )}

            {state.status === "settling" && state.viewerIsHost && (
              /* The way back from a mis-tapped "סיום לכולם". Quiet and secondary --
                 counting is the expected path from here; this is the undo. Anyone
                 already counted keeps their frozen number, so it is safe mid-count. */
              <div className="surface-card flex flex-col gap-2 rounded-3xl p-4">
                <p className="t-caption ink-3">
                  עוד לא סיימתם לשחק? אפשר לחזור לשולחן. מי שכבר נספר נשאר סגור.
                </p>
                {/* Not "חזרה למשחק" -- the header's back arrow already says that and
                    only navigates. This one changes the game's state, so it has to be
                    unmistakably a different action. */}
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void changeStatus("active")}
                >
                  ממשיכים לשחק
                </Button>
              </div>
            )}

            {state.status === "active" && (
              <div className="surface-card flex flex-col gap-3 rounded-3xl p-4">
                <p className="t-body">ספירה מוקדמת מקפיאה שחקן ומאפשרת למשחק להמשיך.</p>
                <Button className="w-full" onClick={() => void changeStatus("settling")}>
                  סיימנו לשחק. מתחילים לספור
                </Button>
              </div>
            )}

            <div className="felt-panel flex items-center justify-between rounded-3xl p-5 text-felt-foreground">
              <div>
                <p className="t-label text-felt-foreground-muted">הקופה לספירה</p>
                <Money value={state.pot} className="money-display mt-1 text-felt-foreground" />
              </div>
              <span className="glass-pill t-caption rounded-full px-3 py-1 text-felt-foreground-muted">
                {state.players.length} שחקנים
              </span>
            </div>

            <section className="flex flex-col gap-3" aria-label="ספירת שחקנים">
              {state.players.map((player) => {
                const isPending = pendingIds.has(player.id);
                const isSaving = savingIds.has(player.id);
                const net = liveNets.get(player.id) ?? 0;
                // An early exit freezes this row (spec 5.4 / the settlement invariant):
                // once settled, only a deliberate host override may write over it --
                // never an incidental edit while the host is entering everyone else's.
                const frozen = player.settledAt !== null && state.status === "settling";
                const overridable = frozen && state.viewerIsHost;
                const locked = frozen && !overriddenIds.has(player.id);
                return (
                  <div
                    key={player.id}
                    className={cn(
                      "surface-card flex flex-col gap-3 rounded-3xl p-4 transition-opacity ease-[var(--ease-out)]",
                      isPending || isSaving ? "opacity-70" : "opacity-100",
                    )}
                    style={{ transitionDuration: `${DUR.base * 1000}ms` }}
                  >
                    <div className="flex flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ChipAvatar avatarKey={player.avatarKey} personId={player.id} name={player.name} className="size-11" />
                        <p className="t-title">{player.name}</p>
                      </div>
                      {player.settledAt && (
                        <Badge variant="secondary">{frozen ? "תוצאה קפואה" : "סגר חשבון"}</Badge>
                      )}
                    </div>

                    {locked && overridable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start text-[var(--text-2)]"
                        onClick={() => addTo(setOverriddenIds, player.id)}
                      >
                        לשנות בכל זאת
                      </Button>
                    )}

                    {state.chipSet ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="t-caption ink-3">{state.chipSet.name}</p>
                          {(isPending || isSaving) && (
                            <ArcPill progress="indeterminate">
                              {isSaving ? "שומר..." : "רגע..."}
                            </ArcPill>
                          )}
                        </div>
                        <ChipCounter
                          denominations={state.chipSet.denominations}
                          counts={player.chipCounts}
                          onChange={(counts) => updateChipCounts(player.id, counts)}
                          disabled={state.status === "closed" || locked}
                        />
                      </>
                    ) : (
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <Label className="t-caption ink-3 mb-1 block">
                            כמה נשאר ל{player.name}?
                          </Label>
                          <AmountInput
                            aria-label={`סכום נספר עבור ${player.name}`}
                            disabled={state.status === "closed" || isSaving || locked}
                            initialAmount={player.cashOut}
                            onChange={(amount) => optimisticAmount(player.id, amount)}
                            onCommit={(amount) => void save(player.id, amount)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex min-h-6 items-center justify-between">
                      <span className="t-caption ink-3">מאזן כרגע</span>
                      {/* `popLayout` takes the outgoing figure out of flow. On the
                          default `sync` mode both signs occupied the row while it
                          crossed zero, so the number slid sideways at the exact
                          moment the host was reading it. */}
                      <AnimatePresence mode="popLayout" initial={false}>
                        {player.cashOut !== null && (
                          <motion.span
                            key={Math.sign(net)}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: DUR.micro, ease: EASE_OUT }}
                          >
                            <Money
                              value={net}
                              signed
                              className={cn(
                                "t-title",
                                net > 0 ? "text-profit" : net < 0 ? "text-loss" : "text-even",
                              )}
                            />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>

                    {state.status === "active" && (
                      <Button
                        className="w-full"
                        disabled={isSaving || player.cashOut === null}
                        variant="secondary"
                        onClick={() =>
                          state.chipSet
                            ? saveEarlyChipCounts(player)
                            : player.cashOut !== null && void save(player.id, player.cashOut)
                        }
                      >
                        שמרו סגירת חשבון מוקדמת
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>

            <div
              className={cn(
                // The host is reading this number while counting cash. Snapping
                // between "balanced" and "off" reads as a glitch at exactly the
                // moment trust in the figure matters most. Colour only -- never
                // move the digits themselves.
                "surface-card rounded-3xl transition-colors ease-[var(--ease-out)]",
              )}
              style={{ transitionDuration: `${DUR.base * 1000}ms` }}
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-col gap-1 p-5 text-center">
                <p className="t-heading">
                  נספר: <Money value={state.counted} /> מתוך <Money value={state.pot} />
                </p>
                <p className={mismatch ? "t-title text-loss" : "t-label text-profit"}>
                  {resolved
                    ? "ההפרש טופל"
                    : mismatch
                    ? state.difference < 0
                      ? <>חסר <Money value={Math.abs(state.difference)} /></>
                      : <>עודף <Money value={Math.abs(state.difference)} /></>
                    : "הכול מאוזן"}
                </p>
              </div>
            </div>

            {state.status === "settling" && mismatch && !resolved && !missing && (
              <div className="surface-card flex flex-col gap-3 rounded-3xl p-4">
                <p className="t-title">הסכומים לא נסגרים</p>
                <div className="flex flex-col gap-1">
                  <Button className="w-full" variant="secondary" onClick={() => void resolve("recount")}>
                    ספירה מחדש
                  </Button>
                  <p className="t-caption ink-3">
                    חוזרים לבדוק ולתקן את הסכומים לפני שממשיכים. לא משנה כלום בקופה.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={!hasWinner}
                    onClick={() => void resolve("split")}
                  >
                    פיצול ההפרש בין המנצחים
                  </Button>
                  <p className="t-caption ink-3">
                    {hasWinner
                      ? "ההפרש מתחלק באופן יחסי בין כל מי שסיים ברווח."
                      : "אי אפשר לפצל. אף שחקן לא נמצא ברווח כרגע."}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button className="w-full" variant="secondary" onClick={() => setAssigning((value) => !value)}>
                    שיוך ההפרש לשחקן אחד
                  </Button>
                  <p className="t-caption ink-3">
                    שחקן אחד סופג את כל ההפרש לבד. בדרך כלל מי שכנראה טעה בספירה.
                  </p>
                  {/* A disclosure that appears under the button that asks for it, so
                      the list reads as belonging to it rather than as the layout
                      jumping. `height: auto` is a layout animation and cannot be
                      flattened by `motionSafe`, so reduced motion skips it outright. */}
                  <AnimatePresence initial={false}>
                    {assigning && (
                      <motion.div
                        key="assign-targets"
                        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : DUR.base, ease: EASE_OUT }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {state.players.map((player) => (
                            <Button
                              key={player.id}
                              variant="secondary"
                              onClick={() => void resolve("assign", player.id)}
                            >
                              {player.name}
                            </Button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {state.status === "settling" && (
              <div className="flex flex-col gap-2">
                {/* The server must settle the number the host is actually looking
                    at -- closing while a debounced chip count is still mid-flight
                    would settle the previous count instead. */}
                {pendingIds.size > 0 && !blockReason && (
                  <p className="t-label text-center text-[var(--text-2)]">
                    שומרים ספירה...
                  </p>
                )}
                {blockReason && (
                  <p className="t-label text-center text-loss" role="alert">
                    {blockReason}
                  </p>
                )}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={savingIds.size > 0 || pendingIds.size > 0 || missing || (mismatch && !resolved)}
                  aria-disabled={savingIds.size > 0 || pendingIds.size > 0 || missing || (mismatch && !resolved)}
                  onClick={() => void changeStatus("closed")}
                >
                  סגרו את החשבון
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
