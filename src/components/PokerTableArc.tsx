"use client";

/**
 * Candidate replacement for `PokerTable`, built to be compared against it.
 *
 * The difference is not styling, it is point of view. `PokerTable` is a top-down
 * map: a portrait ellipse with every player, including you, placed on one ring.
 * That geometry is what produces the empty middle at two players, the seats that
 * overhang the container at nine, and the side seats that crowd the pot.
 *
 * This one is first-person, and stacked the way a poker client stacks it: the pot
 * at the top in the light, the far rail below it with the other players straddling
 * it, the felt beneath, and you at the near edge. The light comes from *behind*
 * the table rather than off it -- see `.table-arc` in globals.css.
 */

import { useEffect, useRef } from "react";
import { CrownIcon } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion, type Variants } from "framer-motion";
import { ChipAvatar } from "@/components/ChipAvatar";
import { assignSlots } from "@/components/PokerTable";
import { AnimatedMoney, Money } from "@/components/Money";
import { StatusBadge } from "@/components/ui/status-badge";
import { StreakBadge } from "@/components/StreakBadge";
import type { LivePlayer } from "@/db/live-queries";
import type { PlayerStreakMap } from "@/db/streak-queries";
import { agorot, formatILS } from "@/lib/money";
import { bump, DUR, EASE_OUT, motionSafe, SPRING, STAGGER } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Where the table's lip crosses the box. Everything else is placed against it. */
const RAIL = 30;

const tableVariants: Variants = {
  hidden: { opacity: 0, scale: 0.985 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: DUR.enter, ease: EASE_OUT, staggerChildren: STAGGER, delayChildren: 0.02 },
  },
};

const seatVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: ({ settled, selected }: { settled: boolean; selected: boolean }) => ({
    opacity: settled ? 0.55 : 1,
    scale: selected ? 1.05 : 1,
    transition: SPRING,
  }),
};

/**
 * Where an opponent sits on the far rail.
 *
 * A parabola, not an ellipse. An ellipse drops away fast at its edges, which is
 * how the old ring put its outermost seats past the container wall; a parabola
 * spreads horizontally and only sags, so the horizontal reach is a number you set
 * directly and can keep inside the box.
 *
 * Past five opponents one rail cannot hold them at a legible avatar size, so they
 * split across two -- the far one fuller, the near one tucked onto the felt.
 */
function railPosition(index: number, count: number) {
  const twoRows = count > 5;
  const farCount = twoRows ? Math.ceil(count / 2) : count;
  const onFar = index < farCount;
  const rowCount = onFar ? farCount : count - farCount;
  const rowIndex = onFar ? index : index - farCount;

  // -1 .. 1 across the row, 0 when it holds a single seat.
  const t = rowCount === 1 ? 0 : (rowIndex / (rowCount - 1)) * 2 - 1;

  const spread = rowCount === 1 ? 0 : Math.min(32, 11 + rowCount * 6);
  // Row separation clears a whole seat block at the outer positions, where the sag
  // is deepest -- that is where two rails collide if you only check the centre.
  const top = onFar ? RAIL + t * t * 4 : RAIL + 26 + t * t * 3;

  return { left: `${50 + t * spread}%`, top: `${top}%` };
}

/** Avatars get smaller only when the rail genuinely runs out of room. */
function railTier(count: number) {
  if (count <= 2) return { avatar: "size-16", width: "w-24" };
  if (count <= 4) return { avatar: "size-14", width: "w-20" };
  if (count <= 6) return { avatar: "size-12", width: "w-18" };
  return { avatar: "size-11", width: "w-16" };
}

/**
 * A seat's running total, with the rebuy count folded in beside it.
 *
 * The count used to be a badge pinned to the avatar's corner. At the avatar sizes
 * this layout uses it landed on the character's feet and ran into the name below
 * it, so it moves to where it is actually read -- next to the money it explains.
 */
function SeatTotal({
  value,
  count,
  reduceMotion,
}: {
  value: number;
  count: number;
  reduceMotion: boolean | null;
}) {
  const controls = useAnimationControls();
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    void controls.start("hit");
  }, [controls, value]);

  return (
    <motion.span
      variants={motionSafe(bump, reduceMotion)}
      initial="idle"
      animate={controls}
      className="t-caption inline-flex items-center gap-1 rounded-full bg-[var(--glass-2)] px-1.5 py-0.5 font-semibold text-violet-300 backdrop-blur-sm"
    >
      <Money value={value} />
      {count > 1 && <span className="text-felt-foreground-muted">×{count}</span>}
    </motion.span>
  );
}

export function PokerTableArc({
  players,
  pot,
  streaks,
  onSeatSelect,
  selectedPlayerId,
}: {
  players: LivePlayer[];
  pot: number;
  streaks?: PlayerStreakMap;
  onSeatSelect?: (player: LivePlayer) => void;
  selectedPlayerId?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const you = players.find((player) => player.isYou) ?? null;
  /* Ordered by the same physical-chair assignment the ring used, so `SeatPicker`
     still means something here: an arc has no numbered chairs, but the chair you
     chose still decides where along the rail you sit relative to everyone else. */
  const opponents = assignSlots(players)
    .map(({ player }) => player)
    .filter((player) => player !== you);
  const tier = railTier(opponents.length);

  return (
    <motion.div
      variants={tableVariants}
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      className="relative mx-auto aspect-[1/1.18] w-full max-w-[400px] overflow-hidden"
    >
      {/* The lamp over the table, drawn first so the table cuts it off. Its bottom
          edge is the rail, which is what makes the arc read as a dark lip against
          a lit ground instead of as a glowing plastic shape. */}
      <div
        aria-hidden="true"
        className="table-arc-glow absolute -inset-x-[35%] z-0 h-[128%] rounded-[50%]"
        style={{ top: `calc(${RAIL}% - 30px)` }}
      />

      {/* The pot, up in the light and above the table -- where a poker client puts
          it, and the only place on a portrait screen no seat can crowd it. */}
      <div className="pointer-events-none absolute inset-x-0 top-[2%] z-20 flex flex-col items-center text-center">
        <span className="section-label block text-felt-foreground-muted">הקופה על השולחן</span>
        <AnimatedMoney
          value={pot}
          className="money-display mt-0.5 block text-felt-foreground drop-shadow-[0_4px_16px_rgb(10_6_30/0.9)]"
        />
      </div>

      {/* The table: far wider than its box and running off the bottom, so only the
          near part of the far rail is on screen. Insets are symmetric, so there is
          no start/end for RTL to flip. */}
      <div
        aria-hidden="true"
        className="table-arc absolute -inset-x-[35%] z-10 h-[128%] rounded-[50%]"
        style={{ top: `${RAIL}%` }}
      />

      {/* The chips on the felt, where a poker client puts the community cards.
          Dropped once the players need a second rail -- at that point the felt is
          full, and the stack would sit under someone's feet. */}
      {opponents.length <= 5 && (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: `${RAIL + 34}%` }}
      >
        <div className="relative h-12 w-16 drop-shadow-[0_9px_10px_rgb(0_0_0/0.7)]">
          <span className="absolute inset-x-2 bottom-1 h-5 rounded-[50%] border-[5px] border-light bg-felt-highlight" />
          <span className="absolute inset-x-1 bottom-3 h-5 rounded-[50%] border-[5px] border-light bg-brand-500" />
          <span className="absolute inset-x-2 bottom-5 h-5 rounded-[50%] border-[5px] border-light bg-surface-4" />
        </div>
      </div>
      )}

      {opponents.map((player, index) => {
        const selected = selectedPlayerId === player.id;
        const streak = streaks?.[player.id];

        return (
          <motion.div
            key={player.id}
            className="absolute z-20"
            initial={false}
            animate={{ ...railPosition(index, opponents.length), x: "-50%", y: "-50%" }}
            transition={reduceMotion ? { duration: 0 } : SPRING}
          >
            <motion.button
              type="button"
              onClick={onSeatSelect ? () => onSeatSelect(player) : undefined}
              aria-label={`${player.name}, ${formatILS(agorot(player.totalIn))}${player.isSettled ? ", נסגר" : ""}`}
              aria-pressed={onSeatSelect ? selected : undefined}
              variants={seatVariants}
              custom={{ settled: player.isSettled, selected }}
              whileTap={
                onSeatSelect && !reduceMotion
                  ? { scale: 0.94, transition: { duration: DUR.micro, ease: EASE_OUT } }
                  : undefined
              }
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[16px] p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                tier.width,
                selected && "surface-raised backdrop-blur-sm",
              )}
            >
              <div className="relative">
                <ChipAvatar
                  avatarKey={player.avatarKey}
                  personId={player.personId}
                  name={player.name}
                  className={tier.avatar}
                />
                {player.isHost && (
                  <CrownIcon aria-hidden="true" className="absolute -top-1 -end-1 size-4 text-violet-300 drop-shadow" />
                )}
                {streak !== undefined && <StreakBadge streak={streak} className="absolute -top-1 -start-1" />}
              </div>
              <span className="t-caption max-w-full truncate font-bold text-felt-foreground drop-shadow-[0_1px_4px_rgb(0_0_0/0.9)]">
                {player.name}
              </span>
              {player.isSettled ? (
                <StatusBadge tone="muted">נסגר</StatusBadge>
              ) : (
                <SeatTotal value={player.totalIn} count={player.buyInCount} reduceMotion={reduceMotion} />
              )}
            </motion.button>
          </motion.div>
        );
      })}

      {/* Your side of the table. Not a seat on a ring -- the near edge, which is
          what makes the screen read as a table you are sitting at, and what keeps
          a two-player game from being one figure across a void. */}
      {you && (
        <motion.div
          variants={seatVariants}
          custom={{ settled: you.isSettled, selected: false }}
          className="absolute inset-x-0 bottom-[3%] z-20 flex items-end justify-center"
        >
          <button
            type="button"
            onClick={onSeatSelect ? () => onSeatSelect(you) : undefined}
            aria-label={`${you.name}, ${formatILS(agorot(you.totalIn))}, המקום שלך`}
            className="flex min-h-12 items-center gap-3 rounded-[22px] bg-[var(--glass-2)] px-4 py-2 backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <div className="relative">
              <ChipAvatar
                avatarKey={you.avatarKey}
                personId={you.personId}
                name={you.name}
                className="size-14"
              />
              {you.isHost && (
                <CrownIcon aria-hidden="true" className="absolute -top-1 -end-1 size-4 text-violet-300 drop-shadow" />
              )}
            </div>
            <span className="flex flex-col items-start">
              <span className="t-caption text-felt-foreground-muted">
                הקופה שלך{you.buyInCount > 1 ? ` · ${you.buyInCount} כניסות` : ""}
              </span>
              <Money value={you.totalIn} className="t-heading font-bold text-felt-foreground" />
            </span>
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
