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
        "bg-felt text-primary-foreground px-4 pt-6 pb-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-tight font-bold tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <div className="text-primary-foreground/70 mt-1 text-sm">
              {subtitle}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
