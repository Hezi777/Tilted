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
        const x = 50 + 43 * Math.cos(radians);
        const y = 50 + 45 * Math.sin(radians);
        const selected = selectedPlayerId === player.id;

        return (
          <button
            key={player.id}
            type="button"
            onClick={onSeatSelect ? () => onSeatSelect(player) : undefined}
            aria-label={`${player.name}, ${formatILS(agorot(player.totalIn))}`}
            aria-pressed={onSeatSelect ? selected : undefined}
            className={cn(
              "absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl p-1.5 transition-transform duration-150",
              onSeatSelect && "active:scale-95",
              selected && "bg-gold/15 ring-2 ring-gold",
              player.isSettled && "opacity-55",
            )}
            style={{ insetInlineStart: `${x}%`, top: `${y}%` }}
          >
            <div className="relative">
              <ChipAvatar
                avatarKey={player.avatarKey}
                personId={player.personId}
                name={player.name}
                className={cn(
                  "size-14",
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
            <span className="max-w-full truncate text-xs font-bold">
              {player.name}
            </span>
            <span className="tabular text-gold text-xs font-bold">
              {formatILS(agorot(player.totalIn))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
