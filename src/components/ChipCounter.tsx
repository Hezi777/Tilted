"use client";

/**
 * Presentational chip-count stepper for a chip set: one row per denomination with
 * a count stepper, plus a live running total. Props in, `onChange` out — no data
 * fetching, so this same component drives both the cash-out screen (a later
 * milestone) and any chip-set preview here.
 */

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/Money";
import { totalAgorotForCounts, type ChipCounts } from "@/lib/chips";
import { agorot, formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface ChipCounterDenomination {
  id: string;
  /** Agorot. */
  value: number;
  color: string;
  imageKey?: string | null;
}

interface ChipCounterProps {
  denominations: readonly ChipCounterDenomination[];
  counts: ChipCounts;
  onChange: (counts: ChipCounts) => void;
  disabled?: boolean;
  className?: string;
}

export function ChipCounter({
  denominations,
  counts,
  onChange,
  disabled,
  className,
}: ChipCounterProps) {
  const total = totalAgorotForCounts(
    denominations.map((denomination) => ({
      id: denomination.id,
      value: agorot(denomination.value),
    })),
    counts,
  );

  function setCount(denominationId: string, next: number) {
    const clamped = Math.max(0, Math.round(next));
    onChange({ ...counts, [denominationId]: clamped });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {denominations.map((denomination) => {
        const count = counts[denomination.id] ?? 0;
        return (
          <div
            key={denomination.id}
            className="flex items-center gap-3 rounded-[14px] border border-foreground/8 bg-surface-2 p-3"
          >
            <div
              className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground/15"
              style={{ backgroundColor: denomination.color }}
            >
              {denomination.imageKey ? (
                <Image
                  src={`/art/${denomination.imageKey}`}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 object-cover"
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="money text-sm font-semibold">
                {formatILS(agorot(denomination.value))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                disabled={disabled || count <= 0}
                aria-label="הפחת ז׳יטון"
                onClick={() => setCount(denomination.id, count - 1)}
              >
                −
              </Button>
              <span className="money w-8 text-center text-base font-semibold tabular-nums">
                {count}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                disabled={disabled}
                aria-label="הוסף ז׳יטון"
                onClick={() => setCount(denomination.id, count + 1)}
              >
                +
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-foreground/10 pt-3">
        <span className="text-sm font-medium text-muted-foreground">סך הכול</span>
        <Money value={total} className="text-lg font-bold" />
      </div>
    </div>
  );
}
