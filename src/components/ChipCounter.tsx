"use client";

/**
 * Presentational chip-count stepper for a chip set: one row per denomination with
 * a count stepper, plus a live running total. Props in, `onChange` out — no data
 * fetching, so this same component drives both the cash-out screen (a later
 * milestone) and any chip-set preview here.
 */

import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/Money";
import { totalAgorotForCounts, type ChipCounts } from "@/lib/chips";
import { agorot, formatILS } from "@/lib/money";
import { PokerChip } from "@/components/PokerChip";
import { cn } from "@/lib/utils";

export interface ChipCounterDenomination {
  id: string;
  /** Agorot. */
  value: number;
  /** Body colour. */
  color: string;
  /** Edge-spot colour, or null to derive one from the body. */
  edgeColor?: string | null;
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
    const clamped = Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
    onChange({ ...counts, [denominationId]: clamped });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {denominations.map((denomination) => {
        const count = counts[denomination.id] ?? 0;
        return (
          <div
            key={denomination.id}
            className="flex items-center gap-3 rounded-[14px] bg-ink-700 p-3"
          >
            <PokerChip
              color={denomination.color}
              edgeColor={denomination.edgeColor}
              className="size-11"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="t-caption ink-3">ערך לז׳יטון</span>
              <span className="money t-label font-semibold">
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
                <MinusIcon strokeWidth={1.75} />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                disabled={disabled}
                aria-label={`כמות ז׳יטונים בערך ${formatILS(agorot(denomination.value))}`}
                value={count}
                onChange={(event) =>
                  setCount(denomination.id, Number(event.target.value))
                }
                className="money h-12 w-16 px-2 text-center t-body font-semibold tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                disabled={disabled}
                aria-label="הוסף ז׳יטון"
                onClick={() => setCount(denomination.id, count + 1)}
              >
                <PlusIcon strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        <span className="t-label ink-2">סך הכול</span>
        <Money value={total} className="t-title font-bold" />
      </div>
    </div>
  );
}
