import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small translucent pill for a piece of table metadata -- a buy-in count, a
 * seat number, elapsed time. Sits on `--glass-1` so it belongs to whatever
 * surface it is on, never a panel of its own.
 */
export function MetaPill({
  icon: Icon,
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & { icon: LucideIcon }) {
  return (
    <span
      className={cn(
        "t-caption inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full bg-[var(--glass-1)] px-2 text-[var(--text-1)]",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
      {children}
    </span>
  );
}
