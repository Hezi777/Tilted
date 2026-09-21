"use client";

import { useEffect, useRef, useState } from "react";
import { CardPicker } from "@/components/CardPicker";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { estimateEquity, type EquityResult } from "@/lib/equity";
import type { PlayingCardCode } from "@/lib/cards";
import { cn } from "@/lib/utils";

const MIN_OPPONENTS = 1;
const MAX_OPPONENTS = 9;

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * A private, per-player odds toy: pick hole cards and 0-5 board cards, pick an
 * opponent count, get a seeded Monte Carlo equity estimate. Reads nothing from
 * shared game state and persists nothing -- it exists entirely in this
 * component's own state. The caller supplies the trigger; mounting is the
 * caller's job.
 */
export function OddsCalculator({
  children,
  className,
  open,
  onOpenChange,
}: {
  /** The tap target that opens the calculator, e.g. a button. Omit for a fully
   * controlled instance (`open`/`onOpenChange`) with no trigger of its own --
   * needed when the visible trigger lives inside a drawer that closes before
   * this one's exit animation would otherwise let it mount. */
  children?: React.ReactNode;
  className?: string;
  /** Controlled open state. Uncontrolled (via `children`'s `DrawerTrigger`) when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [hole, setHole] = useState<PlayingCardCode[]>([]);
  const [board, setBoard] = useState<PlayingCardCode[]>([]);
  const [opponents, setOpponents] = useState(1);
  const [result, setResult] = useState<EquityResult | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    // Fewer than two hole cards: nothing to compute. The result stays stale in
    // state, but the render below gates on `hole.length` first, so a stale
    // result is never shown.
    if (hole.length !== 2) return;
    const thisRequest = ++requestId.current;
    // Deferred so the tap that changed a card paints immediately; the previous
    // result stays on screen until this one lands, instead of the UI freezing
    // or flashing empty.
    const timer = setTimeout(() => {
      const next = estimateEquity({ hole, board, opponents });
      if (requestId.current === thisRequest) setResult(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [hole, board, opponents]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {children ? <DrawerTrigger asChild>{children}</DrawerTrigger> : null}
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>מחשבון סיכויים</DrawerTitle>
          <DrawerDescription>הערכה פרטית, לא נשמרת ולא משפיעה על המשחק</DrawerDescription>
        </DrawerHeader>

        <div className={cn("flex flex-col gap-3 overflow-y-auto px-4 pb-2", className)}>
          <CardPicker label="הקלפים שלי" selected={hole} maxCards={2} unavailable={new Set(board)} onChange={setHole} />
          <CardPicker label="קלפי השולחן" selected={board} maxCards={5} unavailable={new Set(hole)} onChange={setBoard} />

          <div className="surface-card flex items-center justify-between gap-3 rounded-[14px] p-3">
            <span className="t-caption text-[var(--text-1)]">מספר יריבים</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="פחות יריבים"
                disabled={opponents <= MIN_OPPONENTS}
                onClick={() => setOpponents((count) => Math.max(MIN_OPPONENTS, count - 1))}
              >
                −
              </Button>
              <span dir="ltr" className="w-6 text-center text-lg font-semibold tabular-nums">{opponents}</span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="עוד יריב"
                disabled={opponents >= MAX_OPPONENTS}
                onClick={() => setOpponents((count) => Math.min(MAX_OPPONENTS, count + 1))}
              >
                +
              </Button>
            </div>
          </div>

          <div className="surface-raised flex flex-col gap-2 rounded-[14px] p-4" aria-live="polite">
            {hole.length !== 2 ? (
              <p className="t-body text-[var(--text-1)]">בחרו שני קלפים כדי לראות סיכויים</p>
            ) : result ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="t-caption text-[var(--text-1)]">סיכוי לזכות</span>
                  <span dir="ltr" className="text-2xl font-bold tabular-nums text-[var(--green-400)]">{pct(result.win)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="t-caption text-[var(--text-1)]">תיקו</span>
                  <span dir="ltr" className="tabular-nums text-[var(--text-1)]">{pct(result.tie)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="t-caption text-[var(--text-1)]">הפסד</span>
                  <span dir="ltr" className="tabular-nums text-[var(--text-1)]">{pct(result.lose)}</span>
                </div>
              </>
            ) : (
              <p className="t-body text-[var(--text-1)]">מחשב...</p>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
