"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { Money } from "@/components/Money";
import type { GameSummary } from "@/lib/api";

/**
 * A strip that says a table is still open, from anywhere in the app.
 *
 * Without it a running game is invisible the moment you leave its screen, and the only
 * way back is to remember it exists and find it on the home list. Native apps solve
 * this with a Live Activity or an ongoing notification; a web app's equivalent is a
 * persistent bar that is also the way back in.
 *
 * Hidden on the game's own routes, where it would only point at the current screen, and
 * on home, which already leads with the open table -- two ways into the same game, one
 * directly above the other, reads as two different games.
 */
export function LiveSessionBar({ game }: { game: GameSummary | null }) {
  const pathname = usePathname();
  // Left null until the client says otherwise: the server's "now" is already stale by
  // the time the markup reaches the phone, and rendering it would hydrate mismatched.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  if (!game) return null;
  if (pathname === "/") return null;
  if (pathname.startsWith(`/game/${game.id}`)) return null;

  const minutes =
    now === null
      ? null
      : Math.max(0, Math.floor((now - new Date(game.createdAt).getTime()) / 60_000));
  const hours = minutes === null ? null : Math.floor(minutes / 60);
  const elapsed =
    minutes === null
      ? null
      : hours
        ? `${hours}:${String(minutes % 60).padStart(2, "0")} שעות`
        : `${minutes} דקות`;

  return (
    <Link
      href={`/game/${game.id}`}
      className="group flex min-h-14 items-center gap-3 border-b border-brand-500/25 bg-brand-900/45 px-5 py-2 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-brand-900/60 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-brand-300 shadow-[0_0_10px_var(--red-300)] motion-safe:animate-pulse"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold">
          {game.name ?? "שולחן פתוח"}
        </span>
        <span className="t-caption ink-3 truncate">
          {elapsed ? `פתוח ${elapsed}` : "שולחן פתוח"} · {game.playerCount} שחקנים
        </span>
      </span>
      <Money value={game.pot} className="shrink-0 text-sm font-bold text-brand-300" />
      <ChevronLeftIcon
        aria-hidden="true"
        className="ink-3 size-4 shrink-0 rtl:rotate-180"
      />
      <span className="sr-only">חזרה לשולחן</span>
    </Link>
  );
}
