import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The felt band at the top of every screen, and the app's only navigation.
 *
 * `backHref` is not optional decoration: without it a screen is a dead end, and
 * every screen in this app was one. In RTL "back" points left, which is what
 * ChevronLeft gives us -- the icon is mirrored by direction, not by us.
 */
export function AppHeader({
  title,
  subtitle,
  action,
  backHref,
  backLabel = "חזרה",
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  /** Where this screen goes back to. Pass "/" for the home screen. */
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "felt-panel gold-rule relative px-5 pb-5 pt-5 text-felt-foreground",
        className,
      )}
    >
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="text-felt-foreground-muted hover:text-felt-foreground -ms-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4 rtl:rotate-180" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl leading-none font-black tracking-[-0.03em]">
            {title}
          </h1>
          {subtitle ? (
            <div className="text-felt-foreground-muted mt-2 text-sm leading-relaxed">
              {subtitle}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
