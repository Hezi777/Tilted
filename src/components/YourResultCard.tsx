"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AnimatedMoney, Money } from "@/components/Money";
import { DUR, EASE_OUT } from "@/lib/motion";

export interface YourResult {
  totalIn: number;
  countedOut: number;
  adjustment: number;
  net: number;
}

/**
 * How your own night ended, shown the moment you step out rather than at settlement.
 *
 * It sits where the rebuy button was, because that is the place the thumb already
 * knows and because the screen should not simply get quieter when somebody finishes.
 * Before this, settling replaced a seat's total with a "נסגר" badge and the player was
 * told nothing at all -- the one moment they most want a number.
 *
 * It is also what a seat that has finished has instead of actions, so it doubles as the
 * read-only view of a table you are no longer playing at.
 */
export function YourResultCard({ result }: { result: YourResult }) {
  const reduceMotion = useReducedMotion();
  const up = result.net > 0;
  const even = result.net === 0;

  return (
    <motion.section
      aria-label="הסיכום שלך"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.enter, ease: EASE_OUT }}
      className="surface-card flex flex-col gap-3 rounded-[20px] px-4 py-3.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-[var(--text-1)]">
          {even ? "יצאתם בדיוק באפס" : up ? "יצאתם בפלוס" : "יצאתם במינוס"}
        </span>
        {/* The one number the whole card exists for. Counted, not faded in -- the
            count is the information, which is the one place motion carries meaning. */}
        <AnimatedMoney
          value={result.net}
          signed
          className="t-display-l"
        />
      </div>

      {/* The arithmetic behind it, so nobody has to take the headline on trust. This is
          the number people argue about at 2am, and an unshowable sum is what starts the
          argument. */}
      <dl className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        <div className="flex items-baseline gap-1.5">
          <dt className="t-caption ink-3">נכנסתם</dt>
          <dd>
            <Money value={result.totalIn} className="t-caption font-bold" />
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="t-caption ink-3">ספרתם</dt>
          <dd>
            <Money value={result.countedOut} className="t-caption font-bold" />
          </dd>
        </div>
        {result.adjustment !== 0 && (
          // Only when the table actually corrected a mismatch. Shown rather than folded
          // silently into the total, because a number that moved without explanation is
          // exactly what makes a ledger untrustworthy.
          <div className="flex items-baseline gap-1.5">
            <dt className="t-caption ink-3">תיקון ההפרש</dt>
            <dd>
              <Money value={result.adjustment} signed className="t-caption font-bold" />
            </dd>
          </div>
        )}
      </dl>

      <p className="t-caption ink-3">
        הסכום נעול. החשבון המלא ייסגר כשכל השולחן יסיים.
      </p>
    </motion.section>
  );
}
