"use client";

import Image from "next/image";
import { CrownIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ChipAvatar } from "@/components/ChipAvatar";
import { AnimatedMoney, Money } from "@/components/Money";
import type { LivePlayer } from "@/db/live-queries";
import { agorot, formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";

const SEAT_TIERS = [
  { max: 3, rx: 32, ry: 32, seatWidthClass: "w-20", avatarClass: "size-12", textClass: "text-xs" },
  { max: 4, rx: 38, ry: 39, seatWidthClass: "w-20", avatarClass: "size-12", textClass: "text-xs" },
  { max: 6, rx: 40, ry: 41, seatWidthClass: "w-17", avatarClass: "size-10", textClass: "text-[11px]" },
  { max: 9, rx: 41, ry: 42, seatWidthClass: "w-14", avatarClass: "size-9", textClass: "text-[10px]" },
  { max: Infinity, rx: 42, ry: 43, seatWidthClass: "w-13", avatarClass: "size-8", textClass: "text-[9px]" },
] as const;

function seatTierFor(count: number) {
  return SEAT_TIERS.find((tier) => count <= tier.max) ?? SEAT_TIERS[SEAT_TIERS.length - 1];
}

/**
 * Slot 0..slots-1 for every player: physical `tableSeat` when chosen, otherwise the
 * next free slot handed out in `seatOrder` — never reshuffling `seatOrder` itself,
 * which the pot and settlement depend on (plan item 10).
 */
function assignSlots(players: LivePlayer[]): { player: LivePlayer; slot: number }[] {
  const maxChosen = players.reduce(
    (max, player) => (player.tableSeat !== null ? Math.max(max, player.tableSeat) : max),
    -1,
  );
  const slots = Math.max(players.length, maxChosen + 1, 1);
  const taken = new Set(
    players.filter((player) => player.tableSeat !== null).map((player) => player.tableSeat as number),
  );
  const unchosen = players
    .filter((player) => player.tableSeat === null)
    .sort((a, b) => a.seatOrder - b.seatOrder);

  const free: number[] = [];
  for (let index = 0; index < slots && free.length < unchosen.length; index += 1) {
    if (!taken.has(index)) free.push(index);
  }

  const assigned = new Map<string, number>();
  for (const player of players) {
    if (player.tableSeat !== null) assigned.set(player.id, player.tableSeat);
  }
  unchosen.forEach((player, index) => {
    assigned.set(player.id, free[index] ?? index);
  });

  return players
    .map((player) => ({ player, slot: assigned.get(player.id) ?? 0 }))
    .sort((a, b) => a.slot - b.slot);
}

export function PokerTable({
  players,
  pot,
  onSeatSelect,
  selectedPlayerId,
  compact = false,
}: {
  players: LivePlayer[];
  pot: number;
  onSeatSelect?: (player: LivePlayer) => void;
  selectedPlayerId?: string | null;
  compact?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const count = players.length;
  const tier = seatTierFor(count);
  const placed = assignSlots(players);
  const slots = Math.max(count, 1);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.975 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative mx-auto aspect-[5/8] w-full max-w-[350px]",
        count <= 3 && "max-w-[320px]",
        compact && "w-[min(350px,100%,calc((100dvh-21rem)*0.625))]",
      )}
    >
      <div aria-hidden="true" className="absolute inset-[1.5%] overflow-hidden rounded-[50%] drop-shadow-[0_28px_30px_rgb(0_0_0/0.72)]">
        <Image
          src="/art/poker-table-green.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 450px) 92vw, 350px"
          className="object-contain"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
        <div className="relative flex flex-col items-center text-center before:absolute before:inset-[-30px] before:-z-10 before:rounded-full before:bg-[radial-gradient(circle,rgb(245_237_230/0.10),transparent_68%)]">
          <div aria-hidden="true" className="relative h-12 w-16 drop-shadow-[0_9px_10px_rgb(6_37_27/0.65)]">
            <span className="absolute inset-x-2 bottom-1 h-5 rounded-[50%] border-[5px] border-ink-0 bg-felt-highlight" />
            <span className="absolute inset-x-1 bottom-3 h-5 rounded-[50%] border-[5px] border-ink-0 bg-brand-500" />
            <span className="absolute inset-x-2 bottom-5 h-5 rounded-[50%] border-[5px] border-ink-0 bg-surface-4" />
          </div>
          <span className="mt-1 block text-[10px] font-medium text-felt-foreground-muted">הקופה על השולחן</span>
          <AnimatedMoney value={pot} className="block text-[2.5rem] leading-[2.5rem] font-semibold tracking-[-0.03em] text-felt-foreground drop-shadow-[0_2px_8px_rgb(6_37_27/0.85)]" />
        </div>
      </div>

      {placed.map(({ player, slot }, index) => {
        const angle = 90 + (slot * 360) / slots;
        const radians = (angle * Math.PI) / 180;
        const x = 50 + tier.rx * Math.cos(radians);
        const y = 50 + tier.ry * Math.sin(radians);
        const selected = selectedPlayerId === player.id;

        return (
          <div
            key={player.id}
            className="absolute z-20"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          >
            <motion.button
              type="button"
              onClick={onSeatSelect ? () => onSeatSelect(player) : undefined}
              aria-label={`${player.name}, ${formatILS(agorot(player.totalIn))}${player.isSettled ? ", נסגר" : ""}${player.isYou ? ", המקום שלך" : ""}`}
              aria-pressed={onSeatSelect ? selected : undefined}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
              animate={{ opacity: player.isSettled ? 0.55 : 1, scale: selected ? 1.05 : 1 }}
              whileTap={onSeatSelect && !reduceMotion ? { scale: 0.94 } : undefined}
              transition={{ type: "spring", duration: 0.42, bounce: 0.16, delay: reduceMotion ? 0 : index * 0.035 }}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[14px] p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                tier.seatWidthClass,
                selected && "bg-surface-2/90 shadow-[0_8px_22px_rgb(4_2_3/0.55)] ring-1 ring-brand-500/70 backdrop-blur-sm",
              )}
            >
              <div className="relative">
                <ChipAvatar
                  avatarKey={player.avatarKey}
                  personId={player.personId}
                  name={player.name}
                  className={cn(tier.avatarClass, player.isYou && "ring-[3px] ring-brand-300")}
                />
                {player.isHost && <CrownIcon aria-hidden="true" className="absolute -top-1 -end-1 size-4 text-brand-300 drop-shadow" />}
                {player.buyInCount > 1 && (
                  <span className="absolute -bottom-1 -start-1 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-primary-foreground ring-1 ring-brand-300/30">
                    x{player.buyInCount}
                  </span>
                )}
              </div>
              <span className={cn("max-w-full truncate font-bold text-felt-foreground drop-shadow-[0_1px_4px_rgb(6_37_27/0.95)]", tier.textClass, player.isYou && "text-brand-200")}>{player.name}</span>
              <span className={cn("rounded-full bg-surface-2/92 px-1.5 py-0.5 font-semibold text-brand-300 backdrop-blur-sm", tier.textClass)}>
                {player.isSettled ? "נסגר" : <Money value={player.totalIn} />}
              </span>
            </motion.button>
          </div>
        );
      })}
    </motion.div>
  );
}
