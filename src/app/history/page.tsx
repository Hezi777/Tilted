import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { UsersIcon } from "@/components/icons";
import { AppHeader } from "@/components/AppHeader";
import { Money } from "@/components/Money";
import { getHistoryList, getHistoryLocations } from "@/db/history-queries";
import { getViewer } from "@/lib/auth/session";
import { formatIsraelDate } from "@/lib/date";
import { HistoryFilters } from "./HistoryFilters";

export const dynamic = "force-dynamic";

/** Rows shown per "load more" step -- a weekly group hits this in five months. */
const PAGE_SIZE = 20;

/**
 * Every evening that has finished.
 *
 * This route did not exist: `HistoryScreen.tsx` sat in this folder with no `page.tsx`
 * beside it, so `/history` fell through to Next's default 404. The list itself used to
 * be a section on the home screen, which left home doing two jobs at once.
 *
 * Rendered on the server, so the list arrives with the page instead of after a skeleton.
 * Search and the date/location filters are read from the URL and applied in
 * `getHistoryList` itself, not by fetching everything and filtering here.
 *
 * The list itself is bounded by `page` (also on the URL, like the filters): a group
 * that plays weekly for a year has 50+ closed games, and mounting all of them at once
 * was the original bug. One row over `PAGE_SIZE * page` is fetched so "load more" can
 * tell there's another page without a second round trip.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; location?: string; page?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const from = params.from ?? "";
  const to = params.to ?? "";
  const location = params.location ?? "";
  const hasFilters = Boolean(q || from || to || location);
  const page = Math.max(1, Number(params.page) || 1);
  const visible = PAGE_SIZE * page;

  const [rows, locations] = await Promise.all([
    getHistoryList(viewer.person.id, {
      search: q || undefined,
      startDate: from || undefined,
      endDate: to || undefined,
      location: location || undefined,
      limit: visible + 1,
    }),
    getHistoryLocations(viewer.person.id),
  ]);
  const hasMore = rows.length > visible;
  const closed = hasMore ? rows.slice(0, visible) : rows;

  const nextPageHref = (() => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (location) next.set("location", location);
    next.set("page", String(page + 1));
    return `/history?${next.toString()}`;
  })();

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

      <div className="flex flex-1 flex-col gap-4 px-5">
        {(hasFilters || closed.length > 0) && (
          <HistoryFilters locations={locations} initial={{ q, from, to, location }} />
        )}

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
              <p className="t-title">
                {hasFilters ? "לא נמצאו ערבים מתאימים" : "עוד לא נסגר אף ערב"}
              </p>
              <p className="t-caption ink-3 mt-1 leading-relaxed">
                {hasFilters
                  ? "אפשר לנסות חיפוש אחר או לנקות את הסינון."
                  : "כשתסגרו קופה, הערב יופיע כאן עם החשבון המלא."}
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
                    <span
                      className={
                        game.name
                          ? "block truncate font-semibold"
                          : "ink-2 block truncate font-semibold"
                      }
                    >
                      {game.name ?? formatIsraelDate(game.createdAt)}
                    </span>
                    <span className="t-caption ink-3 mt-1 flex items-center gap-3">
                      {game.name && <span>{formatIsraelDate(game.createdAt)}</span>}
                      {game.location && <span className="truncate">{game.location}</span>}
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon aria-hidden="true" className="size-3.5" />
                        {game.playerCount}
                      </span>
                    </span>
                  </span>
                  <Money value={game.pot} className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <Link
            href={nextPageHref}
            scroll={false}
            className="t-body ink-2 hover:text-foreground flex min-h-11 items-center justify-center rounded-[14px] py-2.5 font-medium transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-white/3"
          >
            עוד ערבים
          </Link>
        )}
      </div>
    </main>
  );
}
