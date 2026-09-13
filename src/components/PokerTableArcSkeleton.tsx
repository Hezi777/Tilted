/**
 * The loading placeholder for `PokerTableArc`.
 *
 * It used to be a plain oval -- the shape of `PokerTable`, the table this screen
 * retired. That shape has nothing to do with what actually lands: the arc's pot
 * sits at the top, its rail curves below, and its seats space out along that
 * curve rather than around a ring. Sharing `railGeometry`/`railPoints` with
 * `PokerTableArc` keeps the two shapes identical by construction, so the table
 * settles into place instead of reshaping itself once the data arrives.
 *
 * Six seats is a representative table size -- the real count is exactly what
 * loading doesn't know yet -- close enough to the common game that the curve
 * does not visibly re-flow when the real seats replace these.
 */

import { railGeometry, railPoints, railTier } from "@/lib/seat-layout";
import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_SEATS = 6;

export function PokerTableArcSkeleton() {
  const rail = railGeometry(PLACEHOLDER_SEATS);
  const seats = railPoints(rail, PLACEHOLDER_SEATS);
  const avatarClass = railTier(PLACEHOLDER_SEATS).avatar;

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[1/1.18] w-full max-w-[450px] overflow-hidden"
    >
      {/* The pot, in the same spot above the table it sits in once loaded. */}
      <div className="absolute inset-x-0 top-[2%] z-20 flex flex-col items-center gap-1.5">
        <Skeleton className="h-2.5 w-20 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>

      {/* The felt, on the exact curve `PokerTableArc` draws it on. */}
      <div
        className="absolute z-10 rounded-[50%] bg-surface-2"
        style={{
          insetInline: `-${rail.insetX}%`,
          height: `${rail.height}%`,
          top: `${rail.apex}%`,
        }}
      />

      {/* Seats, spaced along that same curve. */}
      {seats.map((seat, index) => (
        <div
          key={index}
          className="absolute z-20 flex flex-col items-center gap-1"
          style={{ left: seat.left, top: seat.top, transform: "translate(-50%, -50%)" }}
        >
          <Skeleton className={`rounded-full ${avatarClass}`} />
          <Skeleton className="h-3 w-10 rounded-full" />
        </div>
      ))}

      {/* Your own seat, at the near edge. */}
      <div className="absolute inset-x-0 bottom-[3%] z-20 flex items-end justify-center">
        <Skeleton className="h-[60px] w-40 rounded-[22px]" />
      </div>
    </div>
  );
}
