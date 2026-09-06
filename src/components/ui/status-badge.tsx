import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A fully round, ink-800 pill with coloured text and no fill. Used for the
 * outcome of a player (winner / loser / even) or a transfer (paid / unpaid) --
 * never a substitute for the money figure itself, only a label beside it.
 */
export type StatusBadgeTone = "winner" | "loser" | "even" | "paid" | "unpaid" | "amber" | "muted";

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  winner: "text-profit",
  loser: "text-loss",
  even: "text-even",
  paid: "text-profit",
  unpaid: "text-even",
  amber: "text-amber",
  muted: "text-even",
};

export function StatusBadge({
  tone,
  className,
  ...props
}: React.ComponentProps<"span"> & { tone: StatusBadgeTone }) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "t-label inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 rounded-full bg-ink-800 px-2.5 whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
}
