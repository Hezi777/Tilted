"use client";

import Image from "next/image";
import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppHeader } from "@/components/AppHeader";
import { apiFetch, ApiError, type GameSummary } from "@/lib/api";
import { agorot, formatILS } from "@/lib/money";

export default function Home() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GameSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ games: GameSummary[] }>("/api/games")
      .then((data) => {
        if (!cancelled) setGames(data.games);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "שגיאה בטעינת המשחקים");
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const activeGame = games?.find((game) => game.status === "active") ?? null;
  const closedGames = games?.filter((game) => game.status === "closed") ?? [];

  async function cancelGame() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/game/${cancelTarget.id}/cancel`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      setGames((previous) => previous?.filter((game) => game.id !== cancelTarget.id) ?? previous);
      setCancelTarget(null);
      toast.success("המשחק בוטל");
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "ביטול המשחק נכשל");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader title="פוקר" subtitle="הקופה, הריבייים וסגירת החשבון" />

      <div className="flex flex-1 flex-col gap-6 p-4">
        <div className="flex flex-col items-stretch gap-3">
          <Button
            asChild
            className="chip-raise h-auto justify-between rounded-3xl px-6 py-5 text-start"
          >
            <Link href="/game/new">
              <span className="flex flex-col gap-0.5">
                <span className="t-title">משחק חדש</span>
                <span className="t-caption font-medium opacity-70">
                  בחרו כניסה ומי משחק
                </span>
              </span>
              <ChevronLeftIcon aria-hidden="true" className="size-5 shrink-0 rtl:rotate-180" />
            </Link>
          </Button>

          {/* Section 5.3: guests arrive with a code. Quiet, but not hidden --
              a second identical slab would flatten the hierarchy to nothing. */}
          <Link
            href="/join"
            className="ink-2 hover:text-foreground inline-flex min-h-11 items-center justify-center gap-1.5 text-[0.9375rem] font-semibold transition-colors"
          >
            יש לכם קוד חדר?
            <span className="text-gold underline underline-offset-4">הצטרפו</span>
          </Link>
        </div>

        {activeGame && (
          <Card>
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium">{activeGame.name ?? "משחק פעיל"}</p>
                <p className="text-muted-foreground text-xs">
                  משחק פעיל · {activeGame.playerCount} שחקנים
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button asChild variant="secondary" className="min-h-12"><Link href={`/game/${activeGame.id}`}>המשך משחק</Link></Button>
                <Button type="button" variant="ghost" className="min-h-12 text-xs text-destructive" onClick={() => setCancelTarget(activeGame)}>בטל משחק</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="flex flex-1 flex-col gap-3">
          <h2 className="section-label">משחקים קודמים</h2>

          {games === null && !error && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

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

          {games !== null && !error && closedGames.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-10 text-center">
              <Image
                src="/art/empty.png"
                alt=""
                width={160}
                height={160}
                priority
                className="size-36"
              />
              <p className="text-muted-foreground max-w-[26ch] text-sm text-balance">
                עוד לא שיחקתם כאן אף משחק. פתחו משחק חדש, או הצטרפו לאחד עם קוד
                החדר.
              </p>
            </div>
          )}

          {closedGames.map((game) => (
            <Card key={game.id}>
              <CardContent className="p-0">
                <Link href={`/history/${game.id}`} className="flex min-h-20 items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{game.name ?? "משחק"}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(game.createdAt).toLocaleDateString("he-IL")} ·{" "}
                    {game.playerCount} שחקנים
                  </p>
                </div>
                <p className="font-medium">{formatILS(agorot(game.pot))}</p>
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>לבטל את המשחק?</DialogTitle><DialogDescription>המשחק יוסר מההיסטוריה ולא יהיה ניתן להמשיך אותו.</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="destructive" className="min-h-12" disabled={cancelling} onClick={() => void cancelGame()}>כן, בטל משחק</Button><Button type="button" variant="outline" className="min-h-12" onClick={() => setCancelTarget(null)}>ביטול</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
