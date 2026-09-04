"use client";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/Money";
import { cn } from "@/lib/utils";

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
    <Button
      type="button"
      size="lg"
      className={cn("chip-raise hover-dim h-12 min-w-28 flex-col gap-0.5 leading-none", className)}
      disabled={disabled}
      onClick={() => {
        navigator.vibrate?.(8);
        onClick();
      }}
    >
      <span className="text-[11px] font-medium opacity-70">הוספת ריביי</span>
      <Money value={amount} className="text-base font-bold tracking-[-0.02em]" />
    </Button>
  );
}
