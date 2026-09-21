"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontalIcon, XIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
 *
 * The date range and location live behind one filter button rather than laid out on
 * the screen (product direction): a row of controls read as clutter on a screen whose
 * job is the list beneath it, and it is one thing to reach for one-handed instead of
 * several. Search stays outside it -- it is the control used every time this screen
 * opens, typing while a sheet blocks the list is worse than the row it would save.
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
  const [open, setOpen] = useState(false);
  // Edited inside the sheet and only pushed to the URL on "החילו סינון" -- so paging
  // through months on the date pickers does not fire a `router.replace` (and refetch)
  // per keystroke the way the always-visible version did.
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [draftLocation, setDraftLocation] = useState(initial.location);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openDrawer() {
    setDraftFrom(initial.from);
    setDraftTo(initial.to);
    setDraftLocation(initial.location);
    setOpen(true);
  }

  function pushParams(next: Partial<HistoryFilterValues>) {
    const merged = { ...initial, q, from: draftFrom, to: draftTo, location: draftLocation, ...next };
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

  const activeCount = (initial.from || initial.to ? 1 : 0) + (initial.location ? 1 : 0);
  const draftActiveCount = (draftFrom || draftTo ? 1 : 0) + (draftLocation ? 1 : 0);

  function applyDraft() {
    pushParams({ from: draftFrom, to: draftTo, location: draftLocation });
    setOpen(false);
  }

  function clearAll() {
    setQ("");
    setDraftFrom("");
    setDraftTo("");
    setDraftLocation("");
    router.replace("/history", { scroll: false });
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="חיפוש לפי שם, מיקום או שחקן"
          className="h-12 rounded-xl bg-ink-800 px-4"
          aria-label="חיפוש בהיסטוריה"
        />
        {q && (
          // A visible way to clear, rather than counting on the browser's own
          // (inconsistent, and absent in some WebViews) search-field "x". Grown past
          // its drawn size with the pseudo-element rather than the icon itself, so it
          // still meets the 48px floor without crowding the text beside it.
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="ניקוי החיפוש"
            className="absolute inset-y-0 end-2 my-auto flex size-8 items-center justify-center text-[var(--text-2)] after:absolute after:-inset-2 hover:text-[var(--text-1)]"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={activeCount > 0 ? `סינון, ${activeCount} פעילים` : "סינון"}
          aria-pressed={activeCount > 0}
          onClick={openDrawer}
          className={cn(
            "relative size-12 shrink-0 rounded-xl",
            // Colour alone doesn't carry state (WCAG 1.4.11): the filled pill is the
            // second channel, same convention as the tab bar's active tab -- the count
            // badge on top of it is the third, for "how many" without opening anything.
            activeCount > 0 && "border-violet-300/50 bg-ink-700 text-foreground",
          )}
        >
          <SlidersHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
          {activeCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1.5 -start-1.5 h-5 min-w-5 justify-center rounded-full bg-violet-300 px-1 text-[var(--ink-950)]"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>סינון ההיסטוריה</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex items-center gap-2">
              <label className="flex flex-1 flex-col gap-1.5">
                <Label className="t-caption ink-3">מתאריך</Label>
                <Input
                  type="date"
                  value={draftFrom}
                  onChange={(event) => setDraftFrom(event.target.value)}
                  className="h-12 rounded-xl bg-ink-800 px-3 t-body"
                  aria-label="מתאריך"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <Label className="t-caption ink-3">עד תאריך</Label>
                <Input
                  type="date"
                  value={draftTo}
                  onChange={(event) => setDraftTo(event.target.value)}
                  className="h-12 rounded-xl bg-ink-800 px-3 t-body"
                  aria-label="עד תאריך"
                />
              </label>
            </div>

            {locations.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="t-caption ink-3">מיקום</Label>
                {/* A toggle group reads its selected value as a filled pill per item --
                    the same second channel as everywhere else here -- and lets a thumb
                    pick a location without a second menu opening inside this one. */}
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draftLocation || ALL_LOCATIONS}
                  onValueChange={(value) => value && setDraftLocation(value === ALL_LOCATIONS ? "" : value)}
                  className="flex flex-wrap justify-start gap-2"
                >
                  <ToggleGroupItem
                    value={ALL_LOCATIONS}
                    className="h-11 min-w-0 flex-none rounded-xl px-3 t-body data-[state=on]:border-violet-300/50 data-[state=on]:bg-ink-700 data-[state=on]:text-foreground"
                  >
                    כל המיקומים
                  </ToggleGroupItem>
                  {locations.map((location) => (
                    <ToggleGroupItem
                      key={location}
                      value={location}
                      className="h-11 min-w-0 flex-none rounded-xl px-3 t-body data-[state=on]:border-violet-300/50 data-[state=on]:bg-ink-700 data-[state=on]:text-foreground"
                    >
                      {location}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          </div>
          <DrawerFooter>
            <Button type="button" className="h-12" onClick={applyDraft}>
              החילו סינון
            </Button>
            {(draftActiveCount > 0 || activeCount > 0 || q) && (
              // Clearing is a convenience, not the destructive action rose is reserved
              // for -- it undoes a search, not money or data -- and reachable from the
              // same sheet the filters themselves live in.
              <Button type="button" variant="ghost" className="h-12 gap-1.5 text-violet-300" onClick={clearAll}>
                <XIcon aria-hidden="true" className="size-3.5" />
                נקו סינון
              </Button>
            )}
            <DrawerClose asChild>
              <Button type="button" variant="secondary" className="h-12">
                ביטול
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
