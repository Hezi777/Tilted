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
    <Button type="button" size="lg" className="h-12 min-w-28 gap-1 rounded-xl bg-felt text-base font-bold text-primary-foreground shadow-sm hover:bg-felt-deep" disabled={disabled} onClick={onClick}>
      <PlusIcon aria-hidden="true" /> ריביי
      <span className="text-xs font-normal opacity-80">{formatILS(agorot(amount))}</span>
    </Button>
  );
}
