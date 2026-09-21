import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/admin` awaits Neon before it can render anything (`page.tsx` is force-dynamic,
 * and checks admin status and loads the custom avatar list before the screen exists).
 * On a cold compute that stall used to leave a blank screen -- this route-level
 * fallback fires instantly and is shaped like the real screen (the app-state card,
 * then the three management rows) so the landing doesn't jump.
 */
export default function AdminLoading() {
  return (
    <main className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <AppHeader
        title="כלי ניהול"
        subtitle="מה שמריץ את האפליקציה"
        backHref="/profile"
        backLabel="פרופיל"
      />

      <div className="flex flex-col gap-4 px-5">
        <Skeleton className="h-28 w-full rounded-[20px]" />
        <div className="surface-card flex flex-col gap-3 rounded-[20px] p-5">
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
