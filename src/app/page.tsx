"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { UsersIcon } from "@/components/icons";
import { motion, useReducedMotion } from "framer-motion";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/Money";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useIdentity } from "@/lib/identity";
import { ChipAvatar } from "@/components/ChipAvatar";
import { StreakBadge } from "@/components/StreakBadge";
import type { HomeStreak } from "@/db/streak-queries";
import { apiFetch, ApiError, type GameSummary } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const viewer = useIdentity();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GameSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Spec 5.7 asks for streaks in three places; only the live seats ever had them, so a
  // run that was still alive between nights was invisible until the next game started.
  const [streaks, setStreaks] = useState<HomeStreak[]>([]);

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

  // An installed PWA has no pull-to-refresh, so a phone that has been in a pocket
  // while somebody else closed the table comes back showing a night that is over
  // with no way to say so. Coming back to the screen is the refresh gesture.
  // Deliberately not a timer: on the free plan the meter is Neon's *awake* time,
  // so this asks once, when someone is actually looking.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Same pair as the manual retry button: a stale error must not outlive the
      // fetch that succeeds after it.
      setError(null);
      setRetryCount((count) => count + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ streaks: HomeStreak[] }>("/api/streaks?view=home")
      .then((data) => {
        if (!cancelled) setStreaks(data.streaks.filter((row) => row.streak >= 2));
      })
      // A missing strip is not worth an error state on the landing screen.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A settling game is not over -- the host started closing it, but every seat still
  // has its own result to enter, so home has to keep leading back in rather than
  // dropping it once the table itself has moved on.
  const activeGame =
    games?.find((game) => game.status === "active" || game.status === "settling") ?? null;
  const closedGames = games?.filter((game) => game.status === "closed") ?? [];
  // The most recent night is the one worth replaying: it is the roster the group
  // currently has, not the one it had a season ago.
  const lastClosedGame = closedGames[0] ?? null;

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
      // The open-table strip lives in the server-rendered layout, so dropping the game
      // from local state here is not enough -- without this the bar keeps offering a
      // way back into a game that no longer exists.
      router.refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "ביטול המשחק נכשל");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-1 flex-col">
      {/* The masthead is type, not a photograph of a neon sign. A wide soft glow
          sits behind the wordmark the way the reference lights its pot. */}
      <header className="relative shrink-0 px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 focal-glow"
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* The mark and the wordmark share a row; the tagline is a block beneath
                them. Keeping all three in one flex row made the paragraph a third
                flex item and crushed it into a one-word-per-line ribbon. */}
            <div className="flex items-center gap-3">
              {/* Vector, so it scales with the type rather than against it, and already
                  drawn in --light with an --ink-950 clock face -- no tinting needed. */}
              <Image
                src="/art/logo.svg"
                alt=""
                width={40}
                height={96}
                priority
                className="h-[3.25rem] w-auto shrink-0"
              />
              <h1 className="t-display leading-[0.92]">
                TILTED
                <span className="block text-[var(--text-2)]">POKER</span>
              </h1>
            </div>
            <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-[var(--text-1)]">
              הכניסות, הריביים והחשבון מסתדרים בזמן שהמשחק ממשיך.
            </p>
          </div>
          {viewer && (
            <div className="flex shrink-0 items-center gap-1">
              <NotificationsBell />
              <Link
                href="/profile"
                aria-label={`הפרופיל של ${viewer.name}`}
                className="shrink-0 rounded-full transition-transform duration-[var(--dur-micro)] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95"
              >
                <ChipAvatar
                  avatarKey={viewer.avatarKey}
                  personId={viewer.id}
                  name={viewer.name}
                  className="size-11"
                />
              </Link>
            </div>
          )}
        </div>
      </header>

      <motion.div
        variants={motionSafe(stagger, reduceMotion)}
        initial="hidden"
        animate="show"
        className="flex min-h-0 flex-1 flex-col gap-6 px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
      >
        <motion.div variants={motionSafe(rise, reduceMotion)} className="flex flex-col gap-2.5">
          <Button asChild size="lg" className="w-full">
            <Link href="/game/new">פותחים שולחן</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full">
            <Link href="/join">מצטרפים למשחק</Link>
          </Button>
          {/* This group plays the same people most weeks, so the roster step is the
              one nobody needs to repeat. Offered only when there is no table open --
              beside "חזרה לשולחן" it would read as a second way into tonight rather
              than a way to start another one. It pre-fills; it does not commit. */}
          {activeGame === null && lastClosedGame && (
            <Button asChild variant="ghost" className="w-full text-[var(--text-1)]">
              <Link href={`/game/new?from=${lastClosedGame.id}`}>אותה חבורה, ערב חדש</Link>
            </Button>
          )}
        </motion.div>

        {activeGame && (
          <motion.section variants={motionSafe(rise, reduceMotion)} aria-labelledby="active-game-title">
            <h2 id="active-game-title" className="section-label mb-2.5">שולחן פתוח</h2>
            <Card className="surface-raised rounded-[20px]">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{activeGame.name ?? "משחק פעיל"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-[var(--green-400)]" />
                    {activeGame.status === "settling" ? "סוגרים חשבון" : "שולחן פתוח"}
                    <span className="inline-flex items-center gap-1"><UsersIcon className="size-3.5" />{activeGame.playerCount}</span>
                  </p>
                </div>
                {/* Both were 40px, 4px apart, with the irreversible one directly under
                    the happy path. They are on the 48px floor now and separated. */}
                <div className="flex shrink-0 flex-col gap-2">
                  <Button asChild>
                    <Link href={activeGame.status === "settling" ? `/game/${activeGame.id}/cashout` : `/game/${activeGame.id}`}>
                      {activeGame.status === "settling" ? "לספירת הקופה" : "חזרה לשולחן"}
                    </Link>
                  </Button>
                  {activeGame.status === "active" && (
                    <Button type="button" variant="ghost" className="text-[var(--text-2)]" onClick={() => setCancelTarget(activeGame)}>ביטול משחק</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}

        {streaks.length > 0 && (
          /* Ambient, not a leaderboard: only live runs of two or more, and a streak
             always resets, so nobody carries a permanent label. This is the line the
             spec calls the point of the whole feature -- seeing it before you sit down
             against the person who is on one. */
          <motion.section variants={motionSafe(rise, reduceMotion)} aria-labelledby="streaks-title">
            <h2 id="streaks-title" className="section-label mb-2.5">על רצף</h2>
            <ul className="flex flex-wrap gap-2">
              {streaks.map((row) => (
                <li
                  key={row.personId}
                  className="surface-card flex items-center gap-2 rounded-full ps-3 pe-2 py-1.5"
                >
                  <span className="t-caption font-bold">{row.nickname ?? row.name}</span>
                  <StreakBadge streak={row.streak} />
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <motion.section variants={motionSafe(rise, reduceMotion)} className="flex min-h-0 flex-1 flex-col" aria-labelledby="history-title">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 id="history-title" className="section-label">ערבים קודמים</h2>
            {closedGames.length > 0 && (
              <Link
                href="/history"
                className="t-caption font-medium text-[var(--text-1)] hover:text-foreground"
              >
                כל {closedGames.length} הערבים
              </Link>
            )}
          </div>

          {games === null && !error && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-start gap-3 rounded-[20px] bg-ink-800 px-4 py-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setError(null); setRetryCount((count) => count + 1); }}>נסה שוב</Button>
            </div>
          )}

          {games !== null && !error && closedGames.length === 0 && (
            // An empty seat, drawn the way the reference draws a card that has not
            // come out yet -- rather than a 240 KB illustration of a sad chip.
            <motion.div
              variants={motionSafe(rise, reduceMotion)}
              initial="hidden"
              animate="show"
              className="empty-slot flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] px-6 py-10 text-center"
            >
              <Image src="/art/states/empty.webp" alt="" width={96} height={96} className="size-24 object-contain" />
              <p className="t-title">השולחן הראשון מחכה לכם</p>
              <p className="t-caption max-w-[30ch] leading-relaxed text-[var(--text-2)]">פותחים משחק, בוחרים מי הגיע, ומכאן הקופה מסתדרת לבד.</p>
            </motion.div>
          )}

          {closedGames.length > 0 && (
            <motion.ul
              variants={motionSafe(stagger, reduceMotion)}
              initial="hidden"
              animate="show"
              className="row-list"
            >
              {closedGames.slice(0, 3).map((game) => (
                <motion.li key={game.id} variants={motionSafe(rise, reduceMotion)}>
                  <Link href={`/history/${game.id}`} className="surface-card flex min-h-18 items-center justify-between gap-3 rounded-[18px] px-4 py-3 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-ink-700">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{game.name ?? "משחק"}</span>
                      <span className="t-caption ink-3 mt-1 flex items-center gap-3">
                        <span>{new Date(game.createdAt).toLocaleDateString("he-IL")}</span>
                        <span className="inline-flex items-center gap-1"><UsersIcon aria-hidden="true" className="size-3.5" />{game.playerCount}</span>
                      </span>
                    </span>
                    <Money value={game.pot} className="font-semibold" />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </motion.section>
      </motion.div>

      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>לבטל את המשחק?</DialogTitle><DialogDescription>המשחק יוסר מההיסטוריה ולא יהיה ניתן להמשיך אותו.</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="destructive" disabled={cancelling} onClick={() => void cancelGame()}>כן, בטל משחק</Button><Button type="button" variant="secondary" onClick={() => setCancelTarget(null)}>ביטול</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
