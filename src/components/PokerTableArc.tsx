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
import { Clock3Icon, CrownIcon } from "@/components/icons";
import { motion, useAnimationControls, useReducedMotion, type Variants } from "framer-motion";
import { ChipAvatar } from "@/components/ChipAvatar";
import { AnimatedMoney, Money } from "@/components/Money";
import { PotStack } from "@/components/PotStack";
import { StatusBadge } from "@/components/ui/status-badge";
import { StreakBadge } from "@/components/StreakBadge";
import type { LivePlayer } from "@/db/live-queries";
import type { PlayerStreakMap } from "@/db/streak-queries";
import { agorot, formatILS } from "@/lib/money";
import { bump, DUR, EASE_OUT, motionSafe, SPRING, STAGGER } from "@/lib/motion";
import { railGeometry, railPoints, railTier } from "@/lib/seat-layout";
import { seatStatus } from "@/lib/roster-status";
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
  show: ({
    settled,
    waiting,
    selected,
  }: {
    settled: boolean;
    waiting: boolean;
    selected: boolean;
  }) => ({
    // A waiting seat is dimmed, not ghosted. On the ordinary night the host seats
    // everybody and nobody else opens the app, so *every* other seat is waiting --
    // at 0.35 the whole table read as switched off, and the seats carrying most of
    // the pot were the faintest things on the screen. A settled seat is the one that
    // is genuinely finished with.
    opacity: waiting ? 0.75 : settled ? 0.55 : 1,
    scale: selected ? 1.05 : 1,
    transition: SPRING,
  }),
};

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
  /* Ordered by the stable `seatOrder` -- the arc has no numbered chairs to pick,
     so this is the only ordering left, and it never reshuffles mid-game. */
  const opponents = [...players]
    .sort((a, b) => a.seatOrder - b.seatOrder)
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
      {/* `polite` and not `assertive`: the pot moves on every rebuy, and a screen
          reader interrupting itself mid-sentence twenty times an evening is worse than
          hearing the new figure a moment late. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none absolute inset-x-0 top-[2%] z-20 flex flex-col items-center text-center"
      >
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
        const status = seatStatus(player);

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
              aria-label={`${player.name}, ${formatILS(agorot(player.totalIn))}${player.isSettled ? ", נסגר" : ""}${player.isWaiting ? ", ממתין" : ""}`}
              aria-pressed={onSeatSelect ? selected : undefined}
              variants={seatVariants}
              custom={{ settled: player.isSettled, waiting: player.isWaiting, selected }}
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
              {/* A settled seat is done and its total has moved to the cash-out screen,
                  so the badge replaces it. A waiting seat is not done -- it is in the pot
                  for its initial buy-in from the moment the host seats it -- so it keeps
                  its total and wears the badge alongside. Hiding it made the pot in the
                  header true and every seat under it blank. */}
              {status === "settled" ? (
                <StatusBadge tone="muted">נסגר</StatusBadge>
              ) : (
                <div className="flex flex-col items-center gap-0.5">
                  <SeatTotal value={player.totalIn} count={player.buyInCount} reduceMotion={reduceMotion} />
                  {status === "waiting" && (
                    <StatusBadge tone="muted">
                      <Clock3Icon aria-hidden="true" className="size-3" />
                      ממתין
                    </StatusBadge>
                  )}
                </div>
              )}
            </motion.button>
          </motion.div>
        );
      })}

      {/* Your side of the table. Not a seat on a ring -- the near edge, which is
          what makes the screen read as a table you are sitting at, and what keeps
          a two-player game from being one figure across a void. Not a tap target:
          every action on your own row already lives in the dock, so this is a
          readout, never a second door to the same rebuy. */}
      {you && (
        <motion.div
          variants={seatVariants}
          custom={{ settled: you.isSettled, waiting: false, selected: false }}
          className="absolute inset-x-0 bottom-[3%] z-20 flex items-end justify-center"
        >
          <div
            aria-label={`${you.name}, ${formatILS(agorot(you.totalIn))}, המקום שלך`}
            className="flex min-h-12 items-center gap-3 rounded-[22px] bg-[var(--glass-2)] px-4 py-2 backdrop-blur-md"
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
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
