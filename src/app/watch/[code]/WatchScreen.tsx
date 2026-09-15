"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { AnimatedMoney, Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch, ApiError } from "@/lib/api";
import type { WatchGame } from "@/db/watch-queries";

/**
 * Watching a table you are not playing at.
 *
 * Nothing here is tappable except the way in and the way home, which is the point: it
 * is for the person who stepped outside, the partner who is not in the game, and the
 * seat that has already counted out.
 *
 * Polls slowly. A watcher is not waiting on their own tap, so there is no latency to
 * protect and no reason to keep the database awake for them.
 */
const WATCH_POLL_MS = 8_000;

export function WatchScreen({ code }: { code: string }) {
  const reduceMotion = useReducedMotion();
  const [game, setGame] = useState<WatchGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = () =>
      apiFetch<WatchGame>(`/api/watch/${code}`)
        .then((data) => {
          if (cancelled) return;
          setGame(data);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(reason instanceof ApiError ? reason.message : "שגיאה בטעינה");
          }
        });
    void read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, WATCH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [code]);

  return (
    <main className="flex flex-1 flex-col pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <AppHeader
        title={game?.name ?? "צופים בשולחן"}
        subtitle={game?.location ?? "תצוגה בלבד"}
        backHref="/"
        backLabel="בית"
      />

      <div className="flex flex-col gap-5 px-5">
        {error && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="t-body text-destructive">{error}</p>
            <Button asChild variant="secondary"><Link href="/join">להצטרף לשולחן</Link></Button>
          </div>
        )}

        {!game && !error && <Skeleton className="h-40 w-full rounded-2xl" />}

        {game && (
          <>
            <section className="surface-card flex flex-col items-center gap-1 rounded-[20px] px-4 py-5">
              <span className="t-caption ink-3">הקופה</span>
              <AnimatedMoney value={game.pot} className="t-display" />
              {game.status === "settling" && (
                <StatusBadge tone="muted">סופרים את הקופה</StatusBadge>
              )}
            </section>

            <motion.ul
              variants={motionSafe(stagger, reduceMotion)}
              initial="hidden"
              animate="show"
              className="row-list"
            >
              {game.seats.map((seat, index) => (
                <motion.li key={`${seat.name}-${index}`} variants={motionSafe(rise, reduceMotion)}>
                  <div className="surface-card flex min-h-18 items-center gap-3 rounded-[18px] px-4 py-3">
                    <ChipAvatar
                      avatarKey={seat.avatarKey}
                      personId={`${code}-${index}`}
                      name={seat.name}
                      className="size-10"
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">{seat.name}</span>
                    {seat.isSettled ? (
                      <StatusBadge tone="muted">נסגר</StatusBadge>
                    ) : (
                      <span className="flex items-baseline gap-1.5">
                        <Money value={seat.totalIn} className="font-bold" />
                        <span className="t-caption ink-3 tabular">×{seat.buyInCount}</span>
                      </span>
                    )}
                  </div>
                </motion.li>
              ))}
            </motion.ul>

            <p className="t-caption ink-3 text-center">
              אתם צופים בלבד. כדי לשחק צריך מקום בשולחן.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
