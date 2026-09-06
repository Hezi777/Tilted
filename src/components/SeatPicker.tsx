"use client";

import { ArmchairIcon } from "lucide-react";
import { MAX_TABLE_SEATS, type LivePlayer } from "@/db/live-queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const RX = 41;
const RY = 42;

/**
 * A dialog letting a player pick their real chair around the table (plan item 10).
 * Chairs are a fixed physical ring of `MAX_TABLE_SEATS`, independent of how many
 * players are currently seated, so a chosen chair keeps its meaning as people join
 * or leave. Positions use `left`/`top` with a matching `translate(-50%,-50%)`
 * transform only — never a logical inset mixed with a physical transform.
 */
export function SeatPicker({
  open,
  onOpenChange,
  players,
  targetPlayerId,
  targetName,
  onSelect,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: LivePlayer[];
  targetPlayerId: string;
  targetName: string;
  onSelect: (seat: number | null) => void;
  saving: boolean;
}) {
  const occupantBySeat = new Map<number, LivePlayer>();
  for (const player of players) {
    if (player.tableSeat !== null && player.id !== targetPlayerId) {
      occupantBySeat.set(player.tableSeat, player);
    }
  }
  const currentSeat = players.find((player) => player.id === targetPlayerId)?.tableSeat ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>איפה {targetName} יושבים?</DialogTitle>
          <DialogDescription>בחרו את הכיסא האמיתי סביב השולחן</DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto aspect-square w-full max-w-[280px]">
          <div aria-hidden="true" className="absolute inset-[10%] rounded-[50%] border border-felt/50 bg-felt/20" />
          {Array.from({ length: MAX_TABLE_SEATS }, (_, seat) => {
            const angle = 90 + (seat * 360) / MAX_TABLE_SEATS;
            const radians = (angle * Math.PI) / 180;
            const x = 50 + RX * Math.cos(radians);
            const y = 50 + RY * Math.sin(radians);
            const occupant = occupantBySeat.get(seat);
            const isMine = currentSeat === seat;
            const disabled = saving || (occupant !== undefined && !isMine);

            return (
              <button
                key={seat}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(isMine ? null : seat)}
                aria-label={
                  isMine
                    ? `הכיסא שלכם, מקום ${seat + 1}. הקשה תבטל את הבחירה`
                    : occupant
                      ? `מקום ${seat + 1}, תפוס על ידי ${occupant.name}`
                      : `מקום ${seat + 1}, פנוי`
                }
                className={cn(
                  "absolute flex size-12 flex-col items-center justify-center gap-0.5 rounded-full border text-[10px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                  isMine
                    ? "border-brand-300 bg-brand-500/25 text-brand-200 ring-2 ring-brand-300"
                    : occupant
                      ? "bg-ink-800 text-[var(--text-3)]"
                      : "border-brand-500/30 bg-surface-1 text-foreground hover:bg-surface-2",
                  disabled && !isMine && "opacity-60",
                )}
                style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
              >
                {occupant ? (
                  <span className="max-w-9 truncate px-1">{occupant.name}</span>
                ) : (
                  <ArmchairIcon aria-hidden="true" className="size-5" />
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          {currentSeat !== null && (
            <Button type="button" variant="outline" className="h-12" disabled={saving} onClick={() => onSelect(null)}>
              בלי מקום קבוע
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-12" onClick={() => onOpenChange(false)}>
            סגירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
