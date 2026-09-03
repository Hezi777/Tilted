"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput } from "@/components/AmountInput";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState(false);

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

  const missing = state?.players.some((player) => player.cashOut === null) ?? false;
  const mismatch = (state?.difference ?? 0) !== 0;
  const resolved =
    state?.mismatchKind === "split" || state?.mismatchKind === "assigned";
  const absoluteDifference = state ? agorot(Math.abs(state.difference)) : null;
  // Mirrors resolveMismatch's own winner test (raw cash-out minus total-in, before
  // any stored adjustment) so the button disables exactly when the server would reject it.
  const hasWinner =
    state?.players.some(
      (player) => player.cashOut !== null && player.cashOut - player.totalIn > 0,
    ) ?? false;
  const blockReason = missing
    ? "יש להזין סכום לכל השחקנים כדי לסגור את המשחק."
    : mismatch && !resolved
    ? "אי אפשר לסגור כשיש הפרש בספירה — יש לבחור פתרון למעלה."
    : null;

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader
        title="סגירת חשבון"
        subtitle={
          state
            ? `${state.name ?? "המשחק"} · קופה ${formatILS(agorot(state.pot))}`
            : "ספירת הקופה בסוף הערב"
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
          <Card className="border-destructive/45 bg-destructive/5 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
              <p className="text-destructive text-sm">{loadError}</p>
              <Button
                className="min-h-12 rounded-xl"
                variant="outline"
                onClick={() => void load()}
              >
                נסה שוב
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && state && (
          <>
            {state.status === "closed" && (
              <Card className="border-gold/40 bg-gold/10 shadow-none">
                <CardContent className="flex flex-col gap-3 p-4 text-center">
                  <p className="text-sm">המשחק כבר נסגר וסוכם. אפשר לצפות בסיכום ולשתף אותו.</p>
                  <Button
                    asChild
                    className="min-h-12 w-full rounded-xl bg-felt text-felt-foreground hover:bg-felt-deep"
                  >
                    <Link href={`/game/${gameId}/settlement`}>למסך הסיכום</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {state.status === "active" && (
              <Card className="border-gold/35 bg-gold/5 shadow-none">
                <CardContent className="flex flex-col gap-3 p-4">
                  <p className="text-sm">ספירה מוקדמת מקפיאה שחקן ומאפשרת למשחק להמשיך.</p>
                  <Button className="min-h-12 w-full rounded-xl bg-felt text-felt-foreground hover:bg-felt-deep" onClick={() => void changeStatus("settling")}>
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
                      <Label className="text-muted-foreground mb-1 block text-xs">
                        כמה נספר עבור {player.name}?
                      </Label>
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

            <Card
              className={cn(
                // The host is reading this number while counting cash. Snapping
                // between "balanced" and "off" reads as a glitch at exactly the
                // moment trust in the figure matters most. Colour only -- never
                // move the digits themselves.
                "shadow-none transition-[background-color,border-color] duration-200 ease-[var(--ease-out)]",
                mismatch
                  ? "border-destructive/60 bg-destructive/10"
                  : "border-gold/45 bg-gold/5",
              )}
              role="status"
              aria-live="polite"
            >
              <CardContent className="flex flex-col gap-1 p-5 text-center">
                <p className="text-lg font-black tabular-nums">
                  נספר: {formatILS(agorot(state.counted))} מתוך {formatILS(agorot(state.pot))}
                </p>
                <p className={mismatch ? "text-destructive text-base font-bold" : "text-primary text-sm"}>
                  {resolved
                    ? "ההפרש טופל"
                    : mismatch && absoluteDifference !== null
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
                <CardContent className="flex flex-col gap-3 p-4 pt-1">
                  <div className="flex flex-col gap-1">
                    <Button className="min-h-12 w-full rounded-xl" variant="outline" onClick={() => void resolve("recount")}>
                      ספירה מחדש
                    </Button>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      חוזרים לבדוק ולתקן את הסכומים לפני שממשיכים. לא משנה כלום בקופה.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      className="min-h-12 w-full rounded-xl"
                      variant="outline"
                      disabled={!hasWinner}
                      onClick={() => void resolve("split")}
                    >
                      פיצול ההפרש בין המנצחים
                    </Button>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {hasWinner
                        ? "ההפרש מתחלק באופן יחסי בין כל מי שסיים ברווח."
                        : "אי אפשר לפצל — אף שחקן לא נמצא ברווח כרגע."}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button className="min-h-12 w-full rounded-xl" variant="outline" onClick={() => setAssigning((value) => !value)}>
                      שיוך ההפרש לשחקן אחד
                    </Button>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      שחקן אחד סופג את כל ההפרש לבד — בדרך כלל מי שכנראה טעה בספירה.
                    </p>
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
                  </div>
                </CardContent>
              </Card>
            )}

            {state.status === "settling" && (
              <div className="flex flex-col gap-2">
                {blockReason && (
                  <p className="text-destructive text-center text-sm font-semibold" role="alert">
                    {blockReason}
                  </p>
                )}
                <Button
                  className="min-h-14 w-full rounded-xl bg-felt text-base font-black text-felt-foreground hover:bg-felt-deep disabled:opacity-50"
                  disabled={missing || (mismatch && !resolved)}
                  aria-disabled={missing || (mismatch && !resolved)}
                  onClick={() => void changeStatus("closed")}
                >
                  סגור משחק והצג סיכום
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
