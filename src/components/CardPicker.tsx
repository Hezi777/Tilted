"use client";

import { useState } from "react";
import { CARD_SUITS, POKER_DECK, playingCard, type PlayingCardCode } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export function PlayingCardRow({
  cards,
  className,
  emptySlots = 0,
}: {
  cards: readonly PlayingCardCode[];
  className?: string;
  emptySlots?: number;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-1", className)}>
      {cards.map((card) => <PlayingCard key={card} code={card} size="xs" />)}
      {Array.from({ length: Math.max(0, emptySlots - cards.length) }, (_, index) => (
        <span key={index} aria-hidden="true" className="h-10 w-7 rounded-[7px] border border-dashed border-white/18 bg-white/[0.025]" />
      ))}
    </span>
  );
}

export function CardPicker({
  label,
  selected,
  maxCards,
  unavailable,
  onChange,
  className,
}: {
  label: string;
  selected: readonly PlayingCardCode[];
  maxCards: number;
  unavailable?: ReadonlySet<PlayingCardCode>;
  onChange: (cards: PlayingCardCode[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function toggle(card: PlayingCardCode) {
    if (selected.includes(card)) {
      onChange(selected.filter((current) => current !== card));
      return;
    }
    if (unavailable?.has(card) || selected.length >= maxCards) return;
    const next = [...selected, card];
    onChange(next);
    if (next.length === maxCards) setOpen(false);
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn("h-auto min-h-16 w-full justify-between gap-3 rounded-[14px] px-3 py-2 text-start", className)}
          aria-label={`${label}: ${selected.length ? selected.map((code) => {
            const card = playingCard(code);
            return `${card.rank} ${card.suitName}`;
          }).join(", ") : "לא נבחרו קלפים"}`}
        >
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="t-caption text-[var(--text-1)]">{label}</span>
            {selected.length === 0 && <span className="text-sm">בחירת קלפים</span>}
          </span>
          <PlayingCardRow cards={selected} emptySlots={maxCards} className="shrink-0" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-start">
          <DrawerTitle>בחירת {label}</DrawerTitle>
          <DrawerDescription>נוגעים בקלף כדי לבחור. קלפים שכבר נבחרו במקום אחר לא זמינים.</DrawerDescription>
          <div className="mt-2 min-h-10">
            <PlayingCardRow cards={selected} emptySlots={maxCards} />
          </div>
        </DrawerHeader>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-2">
          {CARD_SUITS.map((suit) => {
            const suitCards = POKER_DECK.filter((card) => card.suit === suit.code);
            const tone = suit.tone === "red" ? "text-[#ff647d]" : "text-foreground";
            return (
              <section key={suit.code} aria-label={suit.name} className="surface-card rounded-[16px] p-3">
                <div dir="ltr" className="mb-2 flex items-center gap-2">
                  <span className={cn("text-2xl leading-none", tone)} aria-hidden="true">{suit.symbol}</span>
                  <span className="t-caption text-[var(--text-1)]">{suit.name}</span>
                </div>
                <div dir="ltr" className="flex gap-2 overflow-x-auto pb-2">
                  {suitCards.map((card) => {
                    const isSelected = selected.includes(card.code);
                    const disabled = !isSelected && (unavailable?.has(card.code) || selected.length >= maxCards);
                    return (
                      <Button
                        key={card.code}
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto rounded-[11px] p-0 opacity-100 disabled:opacity-25",
                          isSelected && "ring-2 ring-violet-300 ring-offset-2 ring-offset-ink-800",
                        )}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? "הסרת" : "בחירת"} ${card.rank} ${card.suitName}`}
                        onClick={() => toggle(card.code)}
                      >
                        <PlayingCard code={card.code} size="md" />
                      </Button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <DrawerFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            {selected.length === maxCards ? "הבחירה מוכנה" : "סיום"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

