"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { HomeIcon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot, formatILS, formatSignedILS } from "@/lib/money";

interface SettlementPlayer {
  id: string;
  name: string;
  seatOrder: number;
  totalIn: number;
  cashOut: number;
  adjustment: number;
  net: number;
  outcome: "winner" | "loser" | "even";
}

interface SettlementTransfer {
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  amount: number;
}

interface SettlementState {
  id: string;
  name: string | null;
  status: "active" | "settling" | "closed" | "cancelled";
  pot: number;
  players: SettlementPlayer[];
  transfers: SettlementTransfer[];
  resolution: { kind: "split" } | { kind: "assign"; playerId: string } | null;
  exportText: string;
}

function ImageWithFallback({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={`${className} bg-felt/10`} role="img" aria-label={alt} />;
  }
  return <Image src={src} alt={alt} width={96} height={96} className={className} onError={() => setFailed(true)} />;
}

/** Read-only settlement result with browser-native export actions. */
export default function SettlementScreen({ gameId }: { gameId: string }) {
  const [state, setState] = useState<SettlementState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Decided after mount only: `navigator.share` is absent on desktop, and reading it
  // during the render that produces the server-rendered HTML would mismatch hydration.
  const [shareAvailable, setShareAvailable] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<SettlementState>(`/api/game/${gameId}/settlement`)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : "טעינת הסיכום נכשלה");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    // `navigator.share` only exists in the browser, so this can only be known post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShareAvailable(typeof navigator.share === "function");
    return load();
  }, [load]);

  const winner = useMemo(
    () => state?.players.find((player) => player.outcome === "winner"),
    [state],
  );
  const biggestLoser = useMemo(
    () => state?.players.filter((player) => player.outcome === "loser").at(-1),
    [state],
  );

  async function copySummary() {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.exportText);
      toast.success("הסיכום הועתק, אפשר להדביק בווצאפ");
    } catch {
      toast.error("לא הצלחנו להעתיק את הסיכום");
    }
  }

  async function shareSummary() {
    if (!state || typeof navigator.share !== "function") {
      toast.error("השיתוף לא נתמך בדפדפן הזה, אפשר להעתיק ולהדביק");
      return;
    }
    try {
      await navigator.share({ text: state.exportText });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      toast.error("השיתוף נכשל");
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader
        title="סיכום המשחק"
        subtitle={state?.name ?? "סגירת חשבון"}
        backHref="/"
        backLabel="בית"
      />
      <div className="flex flex-1 flex-col gap-5 p-5 pb-8">
        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {error && (
          <Card className="border-destructive/45 bg-destructive/5 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
              <p className="text-destructive text-sm">{error}</p>
              <Button className="min-h-12 rounded-xl" variant="outline" onClick={load}>
                נסה שוב
              </Button>
            </CardContent>
          </Card>
        )}
        {state && (
          <>
            {winner && (
              <Card className="overflow-hidden border-gold/60 bg-gold/10 shadow-[0_14px_30px_-24px_var(--felt)]">
                <CardContent className="flex items-center gap-4 p-5">
                  <ImageWithFallback src="/art/winner.png" alt="מנצח" className="size-24 shrink-0 object-contain" />
                  <div>
                    <p className="text-muted-foreground text-sm">המנצח</p>
                    <p className="text-2xl font-black tracking-tight">{winner.name}</p>
                    <p className="mt-1 text-2xl font-black text-chart-1">{formatSignedILS(agorot(winner.net))}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-foreground/10 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
                <CardTitle className="text-xl font-black">תוצאות</CardTitle>
                <Badge className="border-gold/40 bg-gold/15 text-foreground" variant="secondary">
                  קופה {formatILS(agorot(state.pot))}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 p-4 pt-2">
                {state.players.map((player) => (
                  <div key={player.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-foreground/8 px-1 py-2 last:border-b-0">
                    <span className="flex items-center gap-2 font-medium">
                      {player.name}
                      {player.outcome === "winner" && <span className="text-muted-foreground text-xs">מנצח</span>}
                      {player.outcome === "even" && <span className="text-muted-foreground text-xs">מאוזן</span>}
                      {player.id === biggestLoser?.id && (
                        <ImageWithFallback src="/art/broke.png" alt="הפסד" className="size-8 object-contain" />
                      )}
                    </span>
                    <span className={player.outcome === "winner" ? "font-black text-chart-1" : player.outcome === "loser" ? "font-bold text-destructive" : "text-muted-foreground"}>
                      {formatSignedILS(agorot(player.net))}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {state.transfers.length > 0 && (
              <Card className="border-foreground/10 shadow-none">
                <CardHeader className="p-4 pb-2"><CardTitle className="text-xl font-black">העברות</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-1 p-4 pt-2">
                  {state.transfers.map((transfer) => (
                    <div key={`${transfer.fromPlayerId}-${transfer.toPlayerId}`} className="flex min-h-14 items-center justify-between gap-3 border-b border-foreground/8 px-1 py-2 last:border-b-0">
                      <span>{transfer.fromName} ➜ {transfer.toName}</span>
                      <span className="font-bold">{formatILS(agorot(transfer.amount))}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {state.resolution && (
              <p className="text-muted-foreground text-sm">
                {state.resolution.kind === "split" ? "ההפרש בספירה פוצל בין המנצחים" : "ההפרש בספירה הוקצה לשחקן"}
              </p>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button className="h-14 rounded-xl bg-felt text-base font-black text-felt-foreground hover:bg-felt-deep" onClick={() => void copySummary()}>
                העתק לווצאפ
              </Button>
              {shareAvailable && (
                <Button variant="outline" className="h-14 rounded-xl border-felt/25 text-base" onClick={() => void shareSummary()}>
                  <Share2 />
                  שתף
                </Button>
              )}
              <Button asChild className="h-14 rounded-xl bg-gold text-base font-black text-felt hover:bg-gold/85">
                <Link href="/">
                  <HomeIcon />
                  סיימנו — למסך הבית
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
