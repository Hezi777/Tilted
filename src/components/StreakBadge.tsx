import { FlameIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StreakBadgeProps {
  streak: number | null | undefined;
  className?: string;
}

/** The only cross-game label: a flame appears from a two-win streak upward. */
export function StreakBadge({ streak, className }: StreakBadgeProps) {
  if (streak === null || streak === undefined || streak < 2) return null;

  return (
    <Badge
      aria-label={`רצף ניצחונות של ${streak} משחקים`}
      className={cn("gap-1 border-ruby/50 bg-ruby/15 text-ruby-bright", className)}
      title={`רצף ניצחונות: ${streak}`}
      variant="secondary"
    >
      <FlameIcon aria-hidden="true" />
      <span>{streak}</span>
    </Badge>
  );
}
