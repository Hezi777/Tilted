import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The screen header. Flush with the page, not a coloured band.
 *
 * The band was three-greens-in-one-screen and read as a rendering artefact.
 * Hierarchy here comes from type scale and space, which is what separates a
 * header from body content in every well-made mobile app.
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
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header className={cn("px-5 pt-3 pb-6", className)}>
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="ink-2 hover:text-foreground -ms-2 mb-3 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold transition-colors"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4 rtl:rotate-180" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-display truncate">{title}</h1>
          {subtitle ? (
            <div className="t-body ink-2 mt-1.5">{subtitle}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
    </header>
  );
}
