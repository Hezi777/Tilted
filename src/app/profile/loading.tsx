import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/profile` awaits Neon before it can render anything (`page.tsx` is force-dynamic,
 * and reads the viewer, the profile row and lifetime stats before the screen exists).
 * On a cold compute that stall used to leave a blank screen -- this route-level
 * fallback fires instantly and is shaped like the real screen (avatar and name, then
 * the stats grid, then the settings cards) so the landing doesn't jump.
 */
export default function ProfileLoading() {
  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col">
      <AppHeader title="פרופיל" backHref="/" />

      <div className="flex flex-col gap-4 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-4 py-2">
          <Skeleton className="size-20 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-2/3 rounded-md" />
            <Skeleton className="h-4 w-1/2 rounded-md" />
          </div>
        </div>

        <div className="surface-card flex flex-col gap-3 rounded-[20px] p-5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[4.5rem] w-full rounded-[16px]" />
            <Skeleton className="h-[4.5rem] w-full rounded-[16px]" />
            <Skeleton className="h-[4.5rem] w-full rounded-[16px]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[4.5rem] w-full rounded-[16px]" />
            <Skeleton className="h-[4.5rem] w-full rounded-[16px]" />
            <Skeleton className="h-[4.5rem] w-full rounded-[16px]" />
          </div>
        </div>

        <Skeleton className="h-48 w-full rounded-[20px]" />
        <Skeleton className="h-32 w-full rounded-[20px]" />
        <Skeleton className="h-40 w-full rounded-[20px]" />
      </div>
    </main>
  );
}
