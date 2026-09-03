"use client";

import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agorot, formatILS } from "@/lib/money";

export function RebuyButton({
  amount,
  onClick,
  disabled,
}: {
  amount: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button type="button" size="lg" className="chip-raise h-12 min-w-28 gap-1 rounded-xl bg-primary text-base font-bold text-primary-foreground hover:brightness-95 active:scale-[0.97] transition-[filter,transform] duration-150" disabled={disabled} onClick={onClick}>
      <PlusIcon aria-hidden="true" /> ריביי
      <span className="text-xs font-normal opacity-80">{formatILS(agorot(amount))}</span>
    </Button>
  );
}
