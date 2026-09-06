import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <header className={cn("relative px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-5", className)}>
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="ink-2 hover:text-foreground -ms-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-[14px] px-2 text-sm font-medium transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4 rtl:rotate-180" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-display line-clamp-2 text-balance break-words">{title}</h1>
          {subtitle ? (
            <div className="t-caption ink-3 mt-1">{subtitle}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
    </header>
  );
}
