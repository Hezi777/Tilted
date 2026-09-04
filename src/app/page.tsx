"use client";

import Image from "next/image";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/Money";
import { apiFetch, ApiError, type GameSummary } from "@/lib/api";

export default function Home() {
  const reduceMotion = useReducedMotion();
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
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof ApiError ? reason.message : "שגיאה בטעינת המשחקים");
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
      await apiFetch(`/api/game/${cancelTarget.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
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
    <main className="relative flex h-[100dvh] flex-1 flex-col overflow-hidden">
      <motion.header
        initial={false}
        className="relative h-[18.5rem] shrink-0 overflow-hidden"
      >
        <h1 className="sr-only">Tilted Poker</h1>
        <Image
          src="/art/neon-hero.webp"
          alt="Tilted Poker בשלט ניאון אדום"
          fill
          priority
          sizes="(max-width: 450px) 100vw, 450px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(5_2_3/0.12),transparent_52%,rgb(9_3_5)_100%)]" />
        <p className="absolute inset-x-5 bottom-3 mx-auto max-w-[31ch] text-center text-sm font-medium leading-relaxed text-foreground/72">
          הכניסות, הריבאיים והחשבון מסתדרים בזמן שהמשחק ממשיך.
        </p>
      </motion.header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-2.5">
          <motion.div whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={{ duration: 0.12 }}>
            <Button asChild className="h-[3.5rem] w-full text-base font-bold tracking-[-0.01em]">
              <Link href="/game/new">פותחים שולחן</Link>
            </Button>
          </motion.div>
          <Button asChild variant="ghost" className="h-10 text-muted-foreground hover:text-foreground">
            <Link href="/join">יש קוד חדר? <span className="text-brand-300">מצטרפים למשחק</span></Link>
          </Button>
        </div>

        {activeGame && (
          <section aria-labelledby="active-game-title">
            <h2 id="active-game-title" className="section-label mb-2.5">שולחן פתוח</h2>
            <Card className="accent-rim bg-surface-2">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{activeGame.name ?? "משחק פעיל"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-brand-300" />
                    שולחן פתוח
                    <span className="inline-flex items-center gap-1"><UsersIcon className="size-3.5" />{activeGame.playerCount}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button asChild className="min-h-11 px-4"><Link href={`/game/${activeGame.id}`}>חזרה לשולחן</Link></Button>
                  <Button type="button" variant="ghost" className="min-h-10 text-xs text-destructive" onClick={() => setCancelTarget(activeGame)}>ביטול משחק</Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="history-title">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="history-title" className="section-label">ערבים קודמים</h2>
            {closedGames.length > 0 && <span className="text-xs text-muted-foreground">{closedGames.length} משחקים</span>}
          </div>

          {games === null && !error && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => { setError(null); setRetryCount((count) => count + 1); }}>נסה שוב</Button>
            </div>
          )}

          {games !== null && !error && closedGames.length === 0 && (
            <Card className="flex flex-1 border-dashed bg-surface-1">
              <CardContent className="flex flex-1 items-center gap-4 p-5">
                <Image src="/art/empty.png" alt="דמות צ׳יפ מחכה לפתיחת שולחן" width={88} height={88} className="size-20 shrink-0 object-contain" />
                <div className="text-start">
                  <p className="font-semibold">השולחן הראשון מחכה לכם</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">פותחים משחק, בוחרים מי הגיע, ומכאן הקופה מסתדרת לבד.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="row-list casino-panel min-h-0 overflow-y-auto rounded-[20px]">
            {closedGames.map((game) => (
              <Link key={game.id} href={`/history/${game.id}`} className="flex min-h-20 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{game.name ?? "משחק"}</p>
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{new Date(game.createdAt).toLocaleDateString("he-IL")}</span>
                    <span className="inline-flex items-center gap-1"><UsersIcon className="size-3.5" />{game.playerCount} שחקנים</span>
                  </p>
                </div>
                <Money value={game.pot} className="font-semibold text-brand-300" />
              </Link>
            ))}
          </div>
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
