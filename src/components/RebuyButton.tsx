"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agorot, formatILS } from "@/lib/money";

export function RebuyButton({
  amount,
  onClick,
  disabled,
  className,
}: {
  amount: number;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button type="button" size="lg" className={cn("chip-raise hover-dim h-12 min-w-28 flex-col gap-0.5 rounded-xl leading-none", className)} disabled={disabled} onClick={onClick}>
      <span className="text-[11px] font-medium opacity-70">הוספת ריביי</span>
      <span className="tabular text-base font-black tracking-[-0.02em]">{formatILS(agorot(amount))}</span>
    </Button>
  );
}
