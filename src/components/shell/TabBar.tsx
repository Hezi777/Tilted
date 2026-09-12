"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClubIcon, HistoryIcon, UserRoundIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The app's three top-level destinations.
 *
 * Three is the count the pattern is worth having: below it a bar is noise, and above
 * five the targets crowd each other on a phone. Everything else in the app is reached
 * from one of these.
 */
const TABS = [
  { href: "/", label: "בית", icon: ClubIcon },
  { href: "/history", label: "היסטוריה", icon: HistoryIcon },
  { href: "/profile", label: "פרופיל", icon: UserRoundIcon },
] as const;

/**
 * Routes that own the whole screen.
 *
 * A live table, counting the pot and reading the settlement are single tasks with their
 * own bottom actions; stacking a nav bar under those would both crowd the thumb and
 * invite someone to walk out of a half-finished count. Sign-in has nowhere to go yet.
 */
function isFocusedRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/join") ||
    /^\/game\/[^/]+/.test(pathname)
  );
}

export function TabBar() {
  const pathname = usePathname();
  if (isFocusedRoute(pathname)) return null;

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[450px] items-stretch gap-1 bg-ink-950/85 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 48px is the stricter of the two platform floors, so it is the one to keep.
              "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] py-1 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active ? "text-foreground" : "text-[var(--text-2)] hover:text-[var(--text-1)]",
            )}
          >
            <Icon aria-hidden="true" className="size-6" />
            <span className="text-[11px] font-semibold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
