"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CrownIcon, Trash2Icon } from "@/components/icons";
import { toast } from "sonner";
import type { HistoryState } from "@/db/history-queries";
import type { MemorableHandRecord } from "@/db/music-hand-queries";
import { apiFetch, ApiError, type GameOwnershipInfo } from "@/lib/api";
import { useIdentity } from "@/lib/identity";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { MemorableHandCard } from "@/components/HandRecorder";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("he-IL") : "";
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryScreen({ gameId }: { gameId: string }) {
  const router = useRouter();
  const identity = useIdentity();
  const [state, setState] = useState<HistoryState | null>(null);
  const [ownership, setOwnership] = useState<GameOwnershipInfo | null>(null);
  const [hands, setHands] = useState<MemorableHandRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const winner = useMemo(
    () => state?.players.find((player) => player.outcome === "winner"),
    [state],
  );
  const playersById = useMemo(
    () => new Map(state?.players.map((player) => [player.id, player]) ?? []),
    [state],
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch<HistoryState>(`/api/game/${gameId}/history`)
      .then((next) => { if (!cancelled) setState(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof ApiError ? reason.message : "טעינת ההיסטוריה נכשלה"); });
    return () => { cancelled = true; };
  }, [gameId, retryCount]);

  useEffect(() => {
    let cancelled = false;
    // Location + who created the evening — layered onto the live-game GET
    // response (plan item 7), separate from the history read model above.
    apiFetch<GameOwnershipInfo>(`/api/game/${gameId}`)
      .then((next) => { if (!cancelled) setOwnership(next); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MemorableHandRecord[]>(`/api/game/${gameId}/hands`)
      .then((next) => { if (!cancelled) setHands(next); })
      .catch(() => { if (!cancelled) setHands([]); });
    return () => { cancelled = true; };
  }, [gameId]);

  const isCreator =
    identity != null &&
    ownership?.createdByPersonId != null &&
    identity.id === ownership.createdByPersonId;

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/game/${gameId}`, { method: "DELETE" });
      toast.success("הערב נמחק");
      router.replace("/");
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "מחיקת הערב נכשלה");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  const title = ownership?.name ?? state?.name ?? "הערב במספרים";
  const subtitle = state
    ? [date(state.closedAt), ownership?.location].filter(Boolean).join(" · ")
    : "המאזן שנשמר מהערב";

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader
        title={title}
        subtitle={subtitle}
        backHref="/"
        action={
          isCreator ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="מחיקת הערב"
              className="min-h-11 min-w-11 text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon aria-hidden="true" className="size-5" />
            </Button>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {!state && !error && <><Skeleton className="h-28 w-full" /><Skeleton className="h-56 w-full" /></>}
        {error && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3">
            <p className="text-destructive text-sm">{error}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setError(null);
                setRetryCount((count) => count + 1);
              }}
            >
              נסה שוב
            </Button>
          </div>
        )}
        {state && <>
          <Card className="felt-panel text-felt-foreground">
            <CardContent className="flex items-center justify-between gap-3">
              <div><p className="text-sm text-felt-foreground-muted">הקופה</p><Money value={state.pot} className="mt-1 text-4xl font-semibold" /></div>
              <span className="rounded-full border border-felt-foreground/15 bg-felt-deep/45 px-3 py-1 text-xs text-felt-foreground-muted">{state.players.length} שחקנים</span>
            </CardContent>
          </Card>
          {winner && (
            <Card className="accent-rim">
              <CardContent className="flex items-center gap-4">
                <div className="relative">
                  <ChipAvatar avatarKey={winner.avatarKey} personId={winner.id} name={winner.name} className="size-16" />
                  <CrownIcon className="absolute -top-3 -end-2 size-6 fill-brand-500 text-brand-300" />
                </div>
                <div><p className="text-sm text-muted-foreground">בראש הערימה</p><p className="text-xl font-bold">{winner.name}</p></div>
                <Money value={winner.net} signed className="ms-auto text-xl font-bold text-profit" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>המאזן הסופי</CardTitle></CardHeader>
            <CardContent className="flex flex-col">
              {state.players.map((player) => (
                <div key={player.id} className="flex min-h-14 items-center gap-3 py-2">
                  <ChipAvatar avatarKey={player.avatarKey} personId={player.id} name={player.name} className="size-10" />
                  <span className="font-medium">{player.name}</span>
                  <Money value={player.net} signed className={player.outcome === "winner" ? "ms-auto font-bold text-profit" : player.outcome === "loser" ? "ms-auto font-bold text-loss" : "ms-auto text-even"} />
                </div>
              ))}
            </CardContent>
          </Card>
          {state.transfers.length > 0 && (
            <Card>
              <CardHeader><CardTitle>מי העביר למי</CardTitle></CardHeader>
              <CardContent className="flex flex-col">
                {state.transfers.map((transfer) => (
                  <div key={`${transfer.fromPlayerId}-${transfer.toPlayerId}`} className="flex min-h-14 items-center gap-2 py-2">
                    <span>{transfer.fromName}</span>
                    <span className="flex flex-1 items-center gap-1 text-brand-300"><span className="h-px flex-1 bg-current" /><ArrowLeftIcon className="size-4" /></span>
                    <span>{transfer.toName}</span>
                    <Money value={transfer.amount} className="ms-auto font-bold" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {hands === null ? (
            <Skeleton className="h-40 w-full" />
          ) : hands.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="memorable-hands-title">
              <h2 id="memorable-hands-title" className="t-title px-1">ידיים שלא שוכחים</h2>
              {hands.map((hand) => <MemorableHandCard key={hand.id} record={hand} />)}
            </section>
          ) : null}
          <Card>
            <CardHeader><CardTitle>מהלך הריבאיים</CardTitle></CardHeader>
            <CardContent>
              {state.timeline.length === 0
                ? <p className="text-sm text-muted-foreground">לא היו ריבאיים</p>
                : <ul className="flex flex-col">
                    {state.timeline.map((item) => {
                      const player = playersById.get(item.playerId);
                      return (
                        <li key={item.id} className="flex min-h-14 items-center gap-3 py-2 text-sm">
                          <ChipAvatar avatarKey={player?.avatarKey} personId={item.playerId} name={item.playerName} className="size-9" />
                          <span>{item.playerName} הוסיף ריביי{item.deletedAt && <span className="text-muted-foreground">, בוטל</span>}</span>
                          <span className="ms-auto text-end"><Money value={item.amount} /><br /><span className="text-xs text-muted-foreground">{time(item.createdAt)}</span></span>
                        </li>
                      );
                    })}
                  </ul>}
            </CardContent>
          </Card>
        </>}
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>למחוק את {title}?</DialogTitle>
            <DialogDescription>הערב יימחק לצמיתות מההיסטוריה ולא ניתן יהיה לשחזר אותו.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              className="min-h-12"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "מוחקים..." : "כן, מחקו את הערב"}
            </Button>
            <Button type="button" variant="outline" className="min-h-12" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
