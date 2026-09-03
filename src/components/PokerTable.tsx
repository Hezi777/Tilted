"use client";

import Image from "next/image";
import { CrownIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ChipAvatar } from "@/components/ChipAvatar";
import type { LivePlayer } from "@/db/live-queries";
import { agorot, formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";

const SEAT_TIERS = [
  { max: 4, rx: 39, ry: 40, seatWidthClass: "w-20", avatarClass: "size-12", textClass: "text-xs" },
  { max: 6, rx: 40, ry: 41, seatWidthClass: "w-17", avatarClass: "size-10", textClass: "text-[11px]" },
  { max: 9, rx: 41, ry: 42, seatWidthClass: "w-14", avatarClass: "size-9", textClass: "text-[10px]" },
  { max: Infinity, rx: 42, ry: 43, seatWidthClass: "w-13", avatarClass: "size-8", textClass: "text-[9px]" },
] as const;

function seatTierFor(count: number) {
  return SEAT_TIERS.find((tier) => count <= tier.max) ?? SEAT_TIERS[SEAT_TIERS.length - 1];
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
  const youIndex = players.findIndex((player) => player.isYou);
  const ordered = youIndex > 0 ? [...players.slice(youIndex), ...players.slice(0, youIndex)] : players;
  const count = ordered.length;
  const tier = seatTierFor(count);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.975 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative mx-auto aspect-[5/8] w-full max-w-[350px]",
        compact && "w-[min(350px,100%,calc((100dvh-21rem)*0.625))]",
      )}
    >
      <div aria-hidden="true" className="absolute inset-[1.5%] drop-shadow-[0_28px_30px_rgb(0_0_0/0.72)]">
        <Image
          src="/art/poker-table-premium.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 450px) 92vw, 350px"
          className="object-contain"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
        <div className="rounded-2xl border border-white/9 bg-black/38 px-5 py-3 text-center shadow-[0_16px_28px_-18px_rgb(0_0_0/0.95),inset_0_1px_rgb(255_255_255/0.07)] backdrop-blur-sm">
          <span className="block text-[10px] font-bold text-felt-foreground-muted">הקופה על השולחן</span>
          <span className="tabular block text-3xl leading-none font-black tracking-[-0.04em] text-white">
            {formatILS(agorot(pot))}
          </span>
        </div>
      </div>

      {ordered.map((player, index) => {
        const angle = 90 + (index * 360) / count;
        const radians = (angle * Math.PI) / 180;
        const x = 50 + tier.rx * Math.cos(radians);
        const y = 50 + tier.ry * Math.sin(radians);
        const selected = selectedPlayerId === player.id;

        return (
          <div
            key={player.id}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <motion.button
              type="button"
              onClick={onSeatSelect ? () => onSeatSelect(player) : undefined}
              aria-label={`${player.name}, ${formatILS(agorot(player.totalIn))}${player.isSettled ? ", נסגר" : ""}`}
              aria-pressed={onSeatSelect ? selected : undefined}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
              animate={{ opacity: player.isSettled ? 0.55 : 1, scale: selected ? 1.05 : 1 }}
              whileTap={onSeatSelect && !reduceMotion ? { scale: 0.94 } : undefined}
              transition={{ type: "spring", duration: 0.42, bounce: 0.16, delay: reduceMotion ? 0 : index * 0.035 }}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-2xl p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ruby-bright",
                tier.seatWidthClass,
                selected && "bg-black/58 shadow-[0_8px_22px_rgb(0_0_0/0.5)] ring-1 ring-ruby-bright/70 backdrop-blur-sm",
              )}
            >
              <div className="relative">
                <ChipAvatar
                  avatarKey={player.avatarKey}
                  personId={player.personId}
                  name={player.name}
                  className={cn(tier.avatarClass, player.isYou && "ring-[3px] ring-ruby-bright")}
                />
                {player.isHost && <CrownIcon aria-hidden="true" className="absolute -top-1 -end-1 size-4 text-ruby-bright drop-shadow" />}
                {player.buyInCount > 1 && (
                  <span className="absolute -bottom-1 -start-1 rounded-full bg-ruby px-1.5 text-[10px] font-black text-white ring-1 ring-white/20">
                    x{player.buyInCount}
                  </span>
                )}
              </div>
              <span className={cn("max-w-full truncate font-bold text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.95)]", tier.textClass)}>{player.name}</span>
              <span className={cn("tabular rounded-full bg-black/52 px-1.5 py-0.5 font-bold text-ruby-bright backdrop-blur-sm", tier.textClass)}>
                {player.isSettled ? "נסגר" : formatILS(agorot(player.totalIn))}
              </span>
            </motion.button>
          </div>
        );
      })}
    </motion.div>
  );
}
