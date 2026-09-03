"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import type { HistoryState } from "@/db/history-queries";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot, formatILS, formatSignedILS } from "@/lib/money";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("he-IL") : "";
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryScreen({ gameId }: { gameId: string }) {
  const [state, setState] = useState<HistoryState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<HistoryState>(`/api/game/${gameId}/history`)
      .then((next) => { if (!cancelled) setState(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof ApiError ? reason.message : "טעינת ההיסטוריה נכשלה"); });
    return () => { cancelled = true; };
  }, [gameId]);

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader title="היסטוריית משחק" subtitle={state ? `${date(state.closedAt)} · ${state.players.length} שחקנים` : "סיכום לקריאה בלבד"} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Button asChild variant="ghost" className="min-h-12 self-start"><Link href="/"><ArrowRightIcon /> חזרה</Link></Button>
        {!state && !error && <><Skeleton className="h-28 w-full" /><Skeleton className="h-56 w-full" /></>}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {state && <>
          <Card className="border-gold/60 bg-gold/10"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-muted-foreground text-sm">קופה</p><p className="tabular text-3xl font-black">{formatILS(agorot(state.pot))}</p></div><Badge variant="secondary">משחק סגור</Badge></CardContent></Card>
          <Card><CardHeader><CardTitle>תוצאות</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">{state.players.map((player) => <div key={player.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2"><span className="font-medium">{player.name}</span><span className={player.outcome === "winner" ? "font-bold text-emerald-700" : player.outcome === "loser" ? "font-bold text-destructive" : "text-muted-foreground"}>{formatSignedILS(agorot(player.net))}</span></div>)}</CardContent></Card>
          {state.transfers.length > 0 && <Card><CardHeader><CardTitle>העברות</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">{state.transfers.map((transfer) => <div key={`${transfer.fromPlayerId}-${transfer.toPlayerId}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"><span>{transfer.fromName} ➜ {transfer.toName}</span><span className="font-bold">{formatILS(agorot(transfer.amount))}</span></div>)}</CardContent></Card>}
          <Card><CardHeader><CardTitle>ציר זמן ריבייים</CardTitle></CardHeader><CardContent>{state.timeline.length === 0 ? <p className="text-muted-foreground text-sm">לא נרשמו ריבייים</p> : <ul className="flex flex-col gap-2">{state.timeline.map((item) => <li key={item.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"><span>{item.playerName} הוסיף ריביי{item.deletedAt && <span className="text-muted-foreground"> · בוטל</span>}</span><span className="tabular text-end">{formatILS(agorot(item.amount))}<br /><span className="text-muted-foreground text-xs">{time(item.createdAt)}</span></span></li>)}</ul>}</CardContent></Card>
        </>}
      </div>
    </main>
  );
}
