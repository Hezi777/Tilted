"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ALL_LOCATIONS = "__all__";

export interface HistoryFilterValues {
  q: string;
  from: string;
  to: string;
  location: string;
}

/**
 * Search + date-range + location controls for `/history`. Every change lands on the
 * URL's search params, which the server component reads and passes straight into
 * `getHistoryList` (src/db/history-queries.ts) -- filtering happens in the query, this
 * component only ever edits the URL.
 */
export function HistoryFilters({
  locations,
  initial,
}: {
  locations: string[];
  initial: HistoryFilterValues;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushParams(next: Partial<HistoryFilterValues>) {
    const merged = { ...initial, q, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.location) params.set("location", merged.location);
    const query = params.toString();
    router.replace(query ? `/history?${query}` : "/history", { scroll: false });
  }

  useEffect(() => {
    if (q === initial.q) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushParams reads latest state, not a dependency
  }, [q]);

  const hasDateRange = Boolean(initial.from || initial.to);

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="חיפוש לפי שם, מיקום או שחקן"
        className="h-12 rounded-xl bg-ink-800 px-4"
        aria-label="חיפוש בהיסטוריה"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">מתאריך</span>
          <Input
            type="date"
            value={initial.from}
            onChange={(event) => pushParams({ from: event.target.value })}
            className="h-10 w-[8.5rem] rounded-xl bg-ink-800 px-3 text-sm"
            aria-label="מתאריך"
          />
        </label>
        <span className="ink-3 text-sm">עד</span>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">עד תאריך</span>
          <Input
            type="date"
            value={initial.to}
            onChange={(event) => pushParams({ to: event.target.value })}
            className="h-10 w-[8.5rem] rounded-xl bg-ink-800 px-3 text-sm"
            aria-label="עד תאריך"
          />
        </label>

        {locations.length > 0 && (
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5 rounded-xl px-3 text-sm"
              >
                {initial.location || "כל המיקומים"}
                <ChevronLeftIcon aria-hidden="true" className="size-3.5 rtl:rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={initial.location || ALL_LOCATIONS}
                onValueChange={(value) =>
                  pushParams({ location: value === ALL_LOCATIONS ? "" : value })
                }
              >
                <DropdownMenuRadioItem value={ALL_LOCATIONS}>
                  כל המיקומים
                </DropdownMenuRadioItem>
                {locations.map((location) => (
                  <DropdownMenuRadioItem key={location} value={location}>
                    {location}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {(hasDateRange || initial.location || initial.q) && (
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-xl px-3 text-sm text-destructive"
            onClick={() => {
              setQ("");
              router.replace("/history", { scroll: false });
            }}
          >
            נקו סינון
          </Button>
        )}
      </div>
    </div>
  );
}
