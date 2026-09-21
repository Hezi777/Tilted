import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/history` awaits Neon before it can render anything (`page.tsx` is
 * force-dynamic). On a cold compute that stall used to leave a blank screen --
 * this route-level fallback fires instantly and is shaped like the real
 * screen (filters row, then a stack of night rows) so the list landing
 * doesn't jump.
 */
export default function HistoryLoading() {
  return (
    <main className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <AppHeader title="ערבים קודמים" />

      <div className="flex flex-1 flex-col gap-4 px-5">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-11 w-[8.5rem] rounded-xl" />
            <Skeleton className="h-11 w-[8.5rem] rounded-xl" />
            <Skeleton className="h-11 w-28 rounded-xl" />
          </div>
        </div>

        <div className="casino-panel flex flex-col gap-0.5 overflow-hidden rounded-[20px]">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-none" />
          ))}
        </div>
      </div>
    </main>
  );
}
