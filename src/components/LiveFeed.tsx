"use client";

import type { LiveFeedItem } from "@/db/live-queries";
import { Money } from "@/components/Money";

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
        <p className="empty-slot rounded-[18px] p-4 text-sm text-[var(--text-2)]">עוד לא נוספו כניסות או ריבאיים</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-1 py-3 text-sm">
              <span>{item.playerName} {item.kind === "initial" ? "נכנס" : "הוסיף ריביי"}</span>
              <span className="flex flex-col items-end text-xs text-muted-foreground">
                <Money value={item.amount} />
                <span>{ago(item.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
