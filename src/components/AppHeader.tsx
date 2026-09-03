import { cn } from "@/lib/utils";

/**
 * The felt band at the top of every screen. Defined once so the milestones that
 * follow inherit a design language instead of each inventing one.
 */
export function AppHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "felt-panel gold-rule relative px-5 pb-6 pt-7 text-felt-foreground",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl leading-none font-black tracking-[-0.03em]">
            {title}
          </h1>
          {subtitle ? (
            <div className="mt-2 text-sm leading-relaxed text-felt-foreground-muted">
              {subtitle}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
