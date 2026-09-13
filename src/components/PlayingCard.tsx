import { cn } from "@/lib/utils";
import { playingCard, type PlayingCardCode } from "@/lib/cards";

const sizes = {
  xs: "h-10 w-7 rounded-[7px]",
  sm: "h-14 w-10 rounded-[9px]",
  md: "h-[72px] w-[52px] rounded-[11px]",
} as const;

const rankSizes = {
  xs: "text-[11px] leading-none",
  sm: "text-sm leading-none",
  md: "text-lg leading-none",
} as const;

const suitSizes = {
  xs: "text-base",
  sm: "text-[22px]",
  md: "text-[30px]",
} as const;

export function PlayingCard({
  code,
  size = "sm",
  className,
}: {
  code: PlayingCardCode;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const card = playingCard(code);
  const tone = card.tone === "red" ? "text-[#d62f4b]" : "text-[#111116]";

  return (
    <span
      dir="ltr"
      role="img"
      aria-label={`${card.rank} ${card.suitName}`}
      className={cn(
        "relative inline-flex shrink-0 select-none overflow-hidden bg-[#f7f6fb] font-sans shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_7px_16px_-8px_rgb(5_2_18/0.9),0_0_0_1px_rgb(17_17_22/0.06)]",
        tone,
        sizes[size],
        className,
      )}
    >
      <span className={cn("absolute start-[16%] top-[12%] font-medium tracking-[-0.06em]", rankSizes[size])}>
        {card.rank}
      </span>
      <span className={cn("m-auto translate-y-[7%] leading-none", suitSizes[size])} aria-hidden="true">
        {card.symbol}
      </span>
    </span>
  );
}

