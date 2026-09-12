"use client";

/**
 * Presentational chip-count stepper for a chip set: one row per denomination with
 * a count stepper, plus a live running total. Props in, `onChange` out — no data
 * fetching, so this same component drives both the cash-out screen (a later
 * milestone) and any chip-set preview here.
 */

import { useCallback, useEffect, useRef } from "react";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/Money";
import { totalAgorotForCounts, type ChipCounts } from "@/lib/chips";
import { agorot, formatILS } from "@/lib/money";
import { PokerChip } from "@/components/PokerChip";
import { cn } from "@/lib/utils";

/**
 * Press-and-hold auto-repeat for the steppers.
 *
 * Counting down a real stack at the end of the night was one tap per chip -- a
 * 45-chip stack meant 45 taps, on a phone, at 2am. The first press still fires
 * immediately, so a single tap is unchanged; holding past 400ms starts a repeat
 * that accelerates from 120ms to 40ms.
 *
 * Pointer capture keeps the repeat attached to the button the finger started on,
 * so sliding off mid-hold stops it rather than leaking a running timer.
 */
function useHoldRepeat(step: () => void) {
  const stepRef = useRef(step);
  const timer = useRef<number | null>(null);

  // The repeat reads the step through a ref so a running hold always applies the
  // latest count rather than the one captured when the press began.
  useEffect(() => {
    stepRef.current = step;
  });

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      stepRef.current();
      let delay = 120;
      const tick = () => {
        stepRef.current();
        delay = Math.max(40, delay - 12);
        timer.current = window.setTimeout(tick, delay);
      };
      timer.current = window.setTimeout(tick, 400);
    },
    [],
  );

  return { onPointerDown, onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop };
}

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
      {denominations.map((denomination) => (
        <ChipCounterRow
          key={denomination.id}
          denomination={denomination}
          count={counts[denomination.id] ?? 0}
          disabled={disabled}
          onCount={(next) => setCount(denomination.id, next)}
        />
      ))}
      <div className="flex items-center justify-between pt-1">
        <span className="t-label ink-2">סך הכול</span>
        <Money value={total} className="t-title font-bold" />
      </div>
    </div>
  );
}

function ChipCounterRow({
  denomination,
  count,
  disabled,
  onCount,
}: {
  denomination: ChipCounterDenomination;
  count: number;
  disabled?: boolean;
  onCount: (next: number) => void;
}) {
  const decrement = useHoldRepeat(() => onCount(count - 1));
  const increment = useHoldRepeat(() => onCount(count + 1));

  /* The steppers fire on pointer-down, so a click handler would double-count every
     press. Keyboard activation still arrives as a click and has to keep working:
     `detail === 0` is what tells an Enter/Space click apart from a pointer one. */
  function keyboardOnly(next: number) {
    return (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.detail === 0) onCount(next);
    };
  }

  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-ink-700 p-3">
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
          onClick={keyboardOnly(count - 1)}
          {...decrement}
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
          onChange={(event) => onCount(Number(event.target.value))}
          className="money h-12 w-16 px-2 text-center t-body font-semibold tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-12 rounded-full"
          disabled={disabled}
          aria-label="הוסף ז׳יטון"
          onClick={keyboardOnly(count + 1)}
          {...increment}
        >
          <PlusIcon strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
