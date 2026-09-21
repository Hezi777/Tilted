"use client";

import { HAND_RANKINGS } from "@/lib/hand-ranking";
import { PlayingCardRow } from "@/components/CardPicker";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/**
 * Static reference sheet: all ten poker hand rankings, strongest first, each
 * with a Hebrew name and a five-card example drawn with the existing
 * `PlayingCard`. Pure presentation over `HAND_RANKINGS` -- no state, no game
 * data, opens instantly. The caller supplies the trigger; mounting is the
 * caller's job.
 */
export function HandRankingsSheet({
  children,
  className,
}: {
  /** The tap target that opens the sheet, e.g. a button. */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Drawer>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className={cn("max-h-[85vh]", className)}>
        <DrawerHeader className="text-start">
          <DrawerTitle>סדר ידיים בפוקר</DrawerTitle>
          <DrawerDescription>מהחזקה ביותר לחלשה ביותר</DrawerDescription>
        </DrawerHeader>
        <ol className="row-list overflow-y-auto px-4 pb-6">
          {HAND_RANKINGS.map((entry, index) => (
            <li key={`${entry.ranking}-${entry.name}`} className="flex min-h-12 items-center gap-3 py-2">
              <span className="t-caption w-5 shrink-0 text-center text-[var(--text-2)]">{index + 1}</span>
              <span className="min-w-0 flex-1 font-medium">{entry.name}</span>
              <PlayingCardRow cards={entry.example} className="shrink-0" />
            </li>
          ))}
        </ol>
      </DrawerContent>
    </Drawer>
  );
}
