import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Money } from "@/components/Money";
import { getGamesForDevice } from "@/db/queries";
import { getViewer } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Every evening that has finished.
 *
 * This route did not exist: `HistoryScreen.tsx` sat in this folder with no `page.tsx`
 * beside it, so `/history` fell through to Next's default 404. The list itself used to
 * be a section on the home screen, which left home doing two jobs at once.
 *
 * Rendered on the server, so the list arrives with the page instead of after a skeleton.
 */
export default async function HistoryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const games = await getGamesForDevice(viewer.person.id);
  const closed = games.filter((game) => game.status === "closed");

  return (
    <main className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <AppHeader
        title="ערבים קודמים"
        subtitle={
          closed.length > 0
            ? `${closed.length} ${closed.length === 1 ? "ערב" : "ערבים"}`
            : undefined
        }
      />

      <div className="flex flex-1 flex-col px-5">
        {closed.length === 0 ? (
          <div className="empty-slot flex flex-1 items-center gap-4 rounded-[20px] p-5">
            <Image
              src="/art/states/empty.webp"
              alt=""
              width={88}
              height={88}
              className="size-20 shrink-0 object-contain"
            />
            <div className="text-start">
              <p className="t-title">עוד לא נסגר אף ערב</p>
              <p className="t-caption ink-3 mt-1 leading-relaxed">
                כשתסגרו קופה, הערב יופיע כאן עם החשבון המלא.
              </p>
            </div>
          </div>
        ) : (
          <ul className="row-list casino-panel overflow-hidden rounded-[20px]">
            {closed.map((game) => (
              <li key={game.id}>
                <Link
                  href={`/history/${game.id}`}
                  className="flex min-h-20 items-center justify-between gap-3 px-4 py-3 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-white/3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {game.name ?? "משחק"}
                    </span>
                    <span className="t-caption ink-3 mt-1 flex items-center gap-3">
                      <span>
                        {new Date(game.closedAt ?? game.createdAt).toLocaleDateString(
                          "he-IL",
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon aria-hidden="true" className="size-3.5" />
                        {game.playerCount}
                      </span>
                    </span>
                  </span>
                  <Money value={game.pot} className="font-semibold text-brand-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
