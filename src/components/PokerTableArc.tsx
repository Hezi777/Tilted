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
import { CrownIcon } from "@/components/icons";
import { motion, useAnimationControls, useReducedMotion, type Variants } from "framer-motion";
import { ChipAvatar } from "@/components/ChipAvatar";
import { assignSlots } from "@/components/PokerTable";
import { AnimatedMoney, Money } from "@/components/Money";
import { PotStack } from "@/components/PotStack";
import { StatusBadge } from "@/components/ui/status-badge";
import { StreakBadge } from "@/components/StreakBadge";
import type { LivePlayer } from "@/db/live-queries";
import type { PlayerStreakMap } from "@/db/streak-queries";
import { agorot, formatILS } from "@/lib/money";
import { bump, DUR, EASE_OUT, motionSafe, SPRING, STAGGER } from "@/lib/motion";
import { cn } from "@/lib/utils";

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
 * The rail, as a function of how many people are around it.
 *
 * A second row was the wrong answer. A real table does not grow a second rank of
 * chairs when a seventh person sits down -- you end up further from it, seeing
 * more of its surface, and everyone spreads further around the same rim. So the
 * table recedes progressively: the apex climbs, the ellipse narrows and deepens
 * (which is what "seeing more of its depth" means in projection), and the seats
 * reach further along a rail that now has the arc length to hold them.
 *
 * All values are percentages of the component's box.
 */
function railGeometry(count: number) {
  // 0 at three or fewer, 1 at eight, so the change is gradual rather than a jump.
  const t = Math.min(1, Math.max(0, (count - 3) / 5));
  return {
    // The apex barely moves. Letting it climb was the obvious way to buy room and
    // it is the wrong one: the pot lives at the top of this screen, and a rail that
    // rises far enough to matter rises straight into it.
    apex: 30 - 4 * t,
    // Curvature comes from DEPTH, never from width. Narrowing the ellipse buys the
    // same curve and costs the thing that matters: measured on screen, a table
    // narrowed this way was still only 359px wide at the bottom of a 390px phone,
    // so it stopped being full-bleed and grew black wedges down both sides at
    // exactly the player counts that need the room most. Holding the width and
    // deepening instead keeps the felt edge-to-edge below the rim -- the rim still
    // curves away at the sides, which is what the reference does too.
    insetX: 35,
    height: 128 + 290 * t,
    // Capped so the outermost seat's amount pill -- which is wider than the avatar
    // it sits under -- still clears the edge of the box.
    reach: 26 + 10 * t,
    t,
  };
}

type Rail = ReturnType<typeof railGeometry>;

/** The box's aspect, so a vertical percentage can be compared with a horizontal one. */
const BOX_ASPECT = 1.18;

/**
 * Every seat's place on the rail, spaced evenly *along the curve*.
 *
 * Spacing them evenly in x is the obvious thing and it looks wrong: near the apex
 * the rail is flat, so neighbours get no vertical offset and end up visually
 * closer than the ones out on the shoulders, which have both. Walking the curve
 * and placing seats at equal arc length gives every neighbour the same gap.
 *
 * Derived from the ellipse the table is actually drawn with, so a seat cannot
 * drift off the rim when the geometry changes -- it is the same curve by
 * construction.
 */
function railPoints(rail: Rail, count: number) {
  const rx = 50 + rail.insetX;
  const ry = rail.height / 2;
  const sagAt = (dx: number) => ry * (1 - Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));

  const STEPS = 240;
  const xs: number[] = [];
  const lengths: number[] = [];
  let total = 0;
  for (let step = 0; step <= STEPS; step += 1) {
    const dx = -rail.reach + (2 * rail.reach * step) / STEPS;
    if (step > 0) {
      const previous = xs[step - 1];
      total += Math.hypot(dx - previous, (sagAt(dx) - sagAt(previous)) * BOX_ASPECT);
    }
    xs.push(dx);
    lengths.push(total);
  }

  return Array.from({ length: count }, (_, index) => {
    if (count === 1) return { left: "50%", top: `${rail.apex}%` };
    const target = (total * index) / (count - 1);
    let step = lengths.findIndex((length) => length >= target);
    if (step < 0) step = STEPS;
    const dx = xs[step];
    return { left: `${50 + dx}%`, top: `${rail.apex + sagAt(dx)}%` };
  });
}

/** Seats give up size only as fast as the rail actually runs out of room. */
function railTier(count: number) {
  if (count <= 2) return { avatar: "size-16", width: "w-24" };
  if (count <= 4) return { avatar: "size-14", width: "w-20" };
  if (count <= 6) return { avatar: "size-12", width: "w-17" };
  if (count <= 7) return { avatar: "size-11", width: "w-15" };
  return { avatar: "size-10", width: "w-14" };
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
  const buyInCount = players.reduce((total, player) => total + player.buyInCount, 0);
  /* Ordered by the same physical-chair assignment the ring used, so `SeatPicker`
     still means something here: an arc has no numbered chairs, but the chair you
     chose still decides where along the rail you sit relative to everyone else. */
  const opponents = assignSlots(players)
    .map(({ player }) => player)
    .filter((player) => player !== you);
  const tier = railTier(opponents.length);
  const rail = railGeometry(opponents.length);
  const seats = railPoints(rail, opponents.length);

  return (
    <motion.div
      variants={tableVariants}
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      className="relative mx-auto aspect-[1/1.18] w-full max-w-[450px] overflow-hidden"
    >
      {/* The lamp over the table, drawn first so the table cuts it off. Its bottom
          edge is the rail, which is what makes the arc read as a dark lip against
          a lit ground instead of as a glowing plastic shape. */}
      <div
        aria-hidden="true"
        className="table-arc-glow absolute z-0 rounded-[50%]"
        style={{
          insetInline: `-${rail.insetX}%`,
          height: `${rail.height}%`,
          top: `calc(${rail.apex}% - 30px)`,
        }}
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
        className="table-arc absolute z-10 rounded-[50%]"
        style={{
          insetInline: `-${rail.insetX}%`,
          height: `${rail.height}%`,
          top: `${rail.apex}%`,
        }}
      />

      {/* The chips on the felt, where a poker client puts the community cards.
          Dropped once the players need a second rail -- at that point the felt is
          full, and the stack would sit under someone's feet. */}
      {opponents.length <= 6 && (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: `${rail.apex + 38}%` }}
      >
        <PotStack buyInCount={buyInCount} />
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
            animate={{ ...seats[index], x: "-50%", y: "-50%" }}
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
