"use client";

import { CrownIcon } from "lucide-react";
import { ChipAvatar } from "@/components/ChipAvatar";
import type { LivePlayer } from "@/db/live-queries";
import { agorot, formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The table, seen from your chair.
 *
 * Every poker client puts you at the bottom edge and everyone else around the far
 * arc, because that is where they are in the room -- so seats are laid out on an
 * ellipse starting at bottom-centre and walking anticlockwise from your seat. It
 * scales to any number of players without a fixed-seat background image, which is
 * why this is drawn rather than generated art.
 */
/**
 * Seat size and orbit radius by table size.
 *
 * A fixed 80px seat that works for a 4-handed game overlaps its neighbour once
 * enough seats share the same ellipse -- the seats near the bottom or top get
 * crowded first because that is where consecutive seats are angularly closest.
 * Shrinking the seat and pushing the orbit outward as headcount grows keeps
 * every seat clear of its neighbours and off the pot, verified for 2/5/8/10+
 * players. `seatWidthClass` stays >= 48px (the min tap target) at every tier.
 */
const SEAT_TIERS = [
  { max: 4, rx: 33, ry: 34, seatWidthClass: "w-20", avatarClass: "size-12", textClass: "text-xs" },
  { max: 6, rx: 35, ry: 36, seatWidthClass: "w-17", avatarClass: "size-10", textClass: "text-xs" },
  { max: 9, rx: 37, ry: 38, seatWidthClass: "w-14", avatarClass: "size-9", textClass: "text-[11px]" },
  { max: Infinity, rx: 39, ry: 40, seatWidthClass: "w-13", avatarClass: "size-8", textClass: "text-[10px]" },
] as const;

function seatTierFor(count: number) {
  return SEAT_TIERS.find((tier) => count <= tier.max) ?? SEAT_TIERS[SEAT_TIERS.length - 1];
}

export function PokerTable({
  players,
  pot,
  onSeatSelect,
  selectedPlayerId,
}: {
  players: LivePlayer[];
  pot: number;
  onSeatSelect?: (player: LivePlayer) => void;
  selectedPlayerId?: string | null;
}) {
  const youIndex = players.findIndex((p) => p.isYou);
  // Rotate so your seat is first, then place the rest around the far arc.
  const ordered =
    youIndex > 0
      ? [...players.slice(youIndex), ...players.slice(0, youIndex)]
      : players;

  const count = ordered.length;
  const tier = seatTierFor(count);

  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-[360px]">
      {/* The felt. A gold rim and an inner rail, no image. */}
      <div
        aria-hidden="true"
        className="absolute inset-[12%] rounded-[50%] bg-felt shadow-[inset_0_2px_0_color-mix(in_oklab,white_14%,transparent),inset_0_-18px_40px_-14px_rgb(0_0_0/0.55),0_18px_40px_-18px_rgb(0_0_0/0.7)] ring-2 ring-gold/45"
      >
        <div className="absolute inset-[6%] rounded-[50%] ring-1 ring-gold/20" />
      </div>

      {/* The pot sits in the middle of the cloth, where it does on a real table. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-felt-foreground-muted text-[11px] font-bold tracking-wide">
          קופה
        </span>
        <span className="foil tabular text-4xl leading-none font-black tracking-[-0.04em]">
          {formatILS(agorot(pot))}
        </span>
      </div>

      {ordered.map((player, index) => {
        // Bottom-centre is 90deg; walk anticlockwise so seat order reads around.
        const angle = 90 + (index * 360) / count;
        const radians = (angle * Math.PI) / 180;
        // `left`/`top` are both physical percentages here, deliberately paired
        // with the physical `translate` below -- this is ellipse trigonometry,
        // not a directional offset, so it must not flip under RTL. Mixing a
        // logical inset with this transform is what shipped seats outside the
        // table before; see AGENTS.md.
        const x = 50 + tier.rx * Math.cos(radians);
        const y = 50 + tier.ry * Math.sin(radians);
        const selected = selectedPlayerId === player.id;

        return (
          <button
            key={player.id}
            type="button"
            onClick={onSeatSelect ? () => onSeatSelect(player) : undefined}
            aria-label={`${player.name}, ${formatILS(agorot(player.totalIn))}${player.isSettled ? ", נסגר" : ""}`}
            aria-pressed={onSeatSelect ? selected : undefined}
            className={cn(
              "absolute flex flex-col items-center gap-1 rounded-2xl p-1 transition-transform duration-150",
              tier.seatWidthClass,
              onSeatSelect && "active:opacity-80",
              selected && "bg-gold/15 ring-2 ring-gold",
              player.isSettled && "opacity-55",
            )}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="relative">
              <ChipAvatar
                avatarKey={player.avatarKey}
                personId={player.personId}
                name={player.name}
                className={cn(
                  tier.avatarClass,
                  player.isYou && "ring-[3px] ring-gold",
                )}
              />
              {player.isHost && (
                <CrownIcon
                  aria-hidden="true"
                  className="text-gold absolute -top-1 -end-1 size-4 drop-shadow"
                />
              )}
              {player.buyInCount > 1 && (
                <span className="bg-gold text-primary-foreground absolute -bottom-1 -start-1 rounded-full px-1.5 text-[10px] font-black">
                  x{player.buyInCount}
                </span>
              )}
            </div>
            <span className={cn("max-w-full truncate font-bold", tier.textClass)}>
              {player.name}
            </span>
            <span className={cn("tabular font-bold", tier.textClass, player.isSettled ? "text-muted-foreground" : "text-gold")}>
              {player.isSettled ? "נסגר" : formatILS(agorot(player.totalIn))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
