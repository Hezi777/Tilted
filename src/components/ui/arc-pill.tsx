import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An outlined pill with a progress arc stroked over its own edge, drawn with
 * `pathLength={100}` so the dash math is independent of the pill's rendered
 * size. Exists to make the debounced cashout autosave visible -- until now its
 * only signal was a 12px grey line of text.
 *
 * `progress` is 0..1 for a determinate fill (e.g. the debounce window), or
 * "indeterminate" while a request is in flight and completion time is unknown.
 */
export function ArcPill({
  progress,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { progress: number | "indeterminate" }) {
  const determinate = typeof progress === "number";
  const dash = determinate ? `${Math.round(Math.max(0, Math.min(1, progress)) * 100)} 100` : "28 72";

  return (
    <span
      data-slot="arc-pill"
      className={cn(
        "t-caption relative inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-text-1",
        className,
      )}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={cn(
          "pointer-events-none absolute inset-0 size-full overflow-visible rounded-full",
          !determinate && "animate-spin [animation-duration:1.1s]",
        )}
      >
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          rx="49"
          pathLength={100}
          fill="none"
          stroke="var(--glass-3)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          rx="49"
          pathLength={100}
          fill="none"
          stroke="var(--text-0)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
