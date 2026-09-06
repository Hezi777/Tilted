import { FlameIcon } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

interface StreakBadgeProps {
  streak: number | null | undefined;
  className?: string;
}

/** The only cross-game label: a flame appears from a two-win streak upward. */
export function StreakBadge({ streak, className }: StreakBadgeProps) {
  if (streak === null || streak === undefined || streak < 2) return null;

  return (
    <StatusBadge
      tone="amber"
      aria-label={`רצף ניצחונות של ${streak} משחקים`}
      className={className}
      title={`רצף ניצחונות: ${streak}`}
    >
      <FlameIcon aria-hidden="true" strokeWidth={1.75} className="size-3" />
      <span>{streak}</span>
    </StatusBadge>
  );
}
