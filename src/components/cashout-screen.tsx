"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput } from "@/components/AmountInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot, formatILS } from "@/lib/money";
import { countedTotal, mismatchDelta, type PlayerLedger } from "@/lib/settlement";

interface CashoutPlayer {
  id: string;
  name: string;
  seatOrder: number;
  settledAt: string | null;
  totalIn: number;
  cashOut: number | null;
  adjustment: number;
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
  players: CashoutPlayer[];
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
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setState(await apiFetch<CashoutState>(`/api/game/${gameId}/cashout`));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  React.useEffect(() => {
    // Initial data must be loaded from the route when this client screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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
      };
    });
  }

  async function save(playerId: string, amount: number) {
    if (!state) return;
    const previous = state;
    setSavingId(playerId);
    try {
      const next = await apiFetch<CashoutState>(
        `/api/game/${gameId}/cashout`,
        {
          method: "POST",
          body: JSON.stringify({ playerId, amount, early: state.status === "active" }),
        },
      );
      setState(next);
    } catch (error) {
      setState(previous);
      toast.error(errorText(error));
    } finally {
      setSavingId(null);
    }
  }

  async function changeStatus(status: "settling" | "closed") {
    try {
      const next = await apiFetch<CashoutState>(`/api/game/${gameId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setState(next);
      if (status === "closed") router.push(`/game/${gameId}/settlement`);
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

  if (loading) {
    return <main className="mx-auto flex w-full max-w-[430px] flex-1 p-5">טוען…</main>;
  }
  if (!state) return null;

  const missing = state.players.some((player) => player.cashOut === null);
  const mismatch = state.difference !== 0;
  const resolved =
    state.mismatchKind === "split" || state.mismatchKind === "assigned";
  const absoluteDifference = agorot(Math.abs(state.difference));

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 p-5 pb-8">
      <header className="border-b border-foreground/10 pb-3">
        <p className="text-xs font-bold tracking-wide text-muted-foreground">סגירת חשבון</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">{state.name ?? "המשחק"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          קופה: {formatILS(agorot(state.pot))}
        </p>
      </header>

      {state.status === "active" && (
        <Card className="border-gold/35 bg-gold/5 shadow-none">
          <CardContent className="flex flex-col gap-3 p-4">
            <p className="text-sm">ספירה מוקדמת מקפיאה שחקן ומאפשרת למשחק להמשיך.</p>
            <Button className="min-h-12 w-full rounded-xl bg-felt text-primary-foreground hover:bg-felt-deep" onClick={() => void changeStatus("settling")}>
              סיום משחק וספירת הקופה
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3" aria-label="ספירת שחקנים">
        {state.players.map((player) => (
          <Card key={player.id} className="border-foreground/10 bg-card/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
              <CardTitle className="text-base font-bold">{player.name}</CardTitle>
              {player.settledAt && <Badge variant="secondary">סגר חשבון</Badge>}
            </CardHeader>
            <CardContent className="flex items-end gap-3 p-4 pt-1">
              <div className="flex-1">
                <Label className="text-muted-foreground mb-1 block text-xs">כמה נספר?</Label>
                <AmountInput
                  aria-label={`סכום נספר עבור ${player.name}`}
                  disabled={state.status === "closed" || savingId === player.id}
                  initialAmount={player.cashOut}
                  onChange={(amount) => optimisticAmount(player.id, amount)}
                  onCommit={(amount) => void save(player.id, amount)}
                />
              </div>
              {state.status === "active" && (
                <Button
                  className="min-h-12"
                  disabled={savingId === player.id || player.cashOut === null}
                  variant="outline"
                  onClick={() => player.cashOut !== null && void save(player.id, player.cashOut)}
                >
                  שמור מוקדם
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className={mismatch ? "border-destructive/50 bg-destructive/5 shadow-none" : "border-gold/45 bg-gold/5 shadow-none"}>
        <CardContent className="flex flex-col gap-1 p-5 text-center">
          <p className="text-lg font-black tabular-nums">
            נספר: {formatILS(agorot(state.counted))} מתוך {formatILS(agorot(state.pot))}
          </p>
          <p className={mismatch ? "text-destructive text-sm" : "text-primary text-sm"}>
            {resolved
              ? "ההפרש טופל"
              : mismatch
              ? state.difference < 0
                ? `חסר ${formatILS(absoluteDifference)}`
                : `עודף ${formatILS(absoluteDifference)}`
              : "הכול מאוזן"}
          </p>
        </CardContent>
      </Card>

      {state.status === "settling" && mismatch && !resolved && !missing && (
        <Card className="border-foreground/10 shadow-none">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">יש הפרש — איך מתקנים?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-1">
            <Button className="min-h-12 w-full rounded-xl" variant="outline" onClick={() => void resolve("recount")}>
              ספירה מחדש
            </Button>
            <Button className="min-h-12 w-full rounded-xl" variant="outline" onClick={() => void resolve("split")}>
              פיצול ההפרש בין המנצחים
            </Button>
            <Button className="min-h-12 w-full rounded-xl" variant="outline" onClick={() => setAssigning((value) => !value)}>
              שיוך ההפרש לשחקן אחד
            </Button>
            {assigning && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {state.players.map((player) => (
                  <Button
                    key={player.id}
                    className="min-h-12 rounded-xl"
                    variant="secondary"
                    onClick={() => void resolve("assign", player.id)}
                  >
                    {player.name}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {state.status === "settling" && missing && (
        <p className="text-destructive text-center text-sm">יש להזין סכום לכל השחקנים כדי להמשיך.</p>
      )}

      {state.status === "settling" && (
        <Button
          className="min-h-14 w-full rounded-xl bg-felt text-base font-black text-primary-foreground hover:bg-felt-deep"
          disabled={missing || (mismatch && !resolved)}
          onClick={() => void changeStatus("closed")}
        >
          סגור משחק והצג סיכום
        </Button>
      )}
    </main>
  );
}
