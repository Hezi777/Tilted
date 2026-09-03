"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Share2 } from "lucide-react";
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const shareAvailable = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
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
      setFeedback("הסיכום הועתק לווצאפ");
    } catch {
      setFeedback("לא הצלחנו להעתיק את הסיכום");
    }
  }

  async function shareSummary() {
    if (!state || !navigator.share) return;
    try {
      await navigator.share({ text: state.exportText });
      setFeedback("הסיכום שותף");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setFeedback("השיתוף נכשל");
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader title="סיכום המשחק" subtitle={state?.name ?? "סגירת חשבון"} />
      <div className="flex flex-1 flex-col gap-5 p-5 pb-8">
        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {state && (
          <>
            {winner && (
              <Card className="overflow-hidden border-gold/60 bg-gold/10 shadow-[0_14px_30px_-24px_var(--felt)]">
                <CardContent className="flex items-center gap-4 p-5">
                  <ImageWithFallback src="/art/winner.png" alt="מנצח" className="size-24 shrink-0 object-contain" />
                  <div>
                    <p className="text-muted-foreground text-sm">המנצח</p>
                    <p className="text-2xl font-black tracking-tight">{winner.name}</p>
                    <p className="mt-1 text-2xl font-black text-felt">{formatSignedILS(agorot(winner.net))}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-foreground/10 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
                <CardTitle className="text-xl font-black">תוצאות</CardTitle>
                <Badge className="bg-gold/15 text-felt" variant="secondary">קופה {formatILS(agorot(state.pot))}</Badge>
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
                    <span className={player.outcome === "winner" ? "font-black text-felt" : player.outcome === "loser" ? "font-bold text-destructive" : "text-muted-foreground"}>
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
              {feedback && <p className="text-center text-sm text-primary" role="status">{feedback}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
