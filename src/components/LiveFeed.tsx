"use client";

import type { LiveFeedItem } from "@/db/live-queries";
import { formatILS, agorot } from "@/lib/money";

function ago(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "עכשיו";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  return `לפני ${hours} שע׳`;
}

export function LiveFeed({ items, showTitle = true }: { items: readonly LiveFeedItem[]; showTitle?: boolean }) {
  return (
    <section aria-labelledby="feed-heading" className="flex flex-col gap-3">
      {showTitle && <h2 id="feed-heading" className="text-muted-foreground text-xs font-bold tracking-wide">מה קרה בשולחן</h2>}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 p-4 text-sm text-muted-foreground">עוד לא נוספו כניסות או ריבאיים</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 border-b border-foreground/8 px-1 py-3 text-sm last:border-b-0">
              <span>{item.playerName} {item.kind === "initial" ? "נכנס" : "הוסיף ריביי"}</span>
              <span className="text-muted-foreground tabular text-xs">{formatILS(agorot(item.amount))} · {ago(item.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
