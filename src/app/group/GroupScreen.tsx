"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { apiFetch, ApiError } from "@/lib/api";
import type { GroupMember, GroupStats } from "@/db/group-stats";
import type { HeadToHead } from "@/db/head-to-head";

/** How long ago somebody last played, in the words a person would use. */
function lastSeen(iso: string | null): string {
  if (!iso) return "עוד לא שיחקו";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "שיחקו היום";
  if (days === 1) return "שיחקו אתמול";
  if (days < 14) return `לפני ${days} ימים`;
  if (days < 60) return `לפני ${Math.floor(days / 7)} שבועות`;
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

export function GroupScreen() {
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [record, setRecord] = useState<HeadToHead | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<GroupStats>("/api/group")
      .then((data) => !cancelled && setStats(data))
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof ApiError ? reason.message : "שגיאה בטעינה");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetched when a person is opened rather than for the whole list: one query per row
  // would be a dozen round trips to render a screen nobody has tapped into yet.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    apiFetch<HeadToHead>(`/api/people/${selected.personId}/head-to-head`)
      .then((data) => !cancelled && setRecord(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const members = useMemo(() => {
    const needle = query.trim();
    if (!needle) return stats?.members ?? [];
    return (stats?.members ?? []).filter((member) =>
      `${member.name} ${member.nickname ?? ""}`.includes(needle),
    );
  }, [stats, query]);

  return (
    <main className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <AppHeader title="החבורה" subtitle="איך הולך לשולחן הזה" backHref="/" backLabel="בית" />

      <motion.div
        variants={motionSafe(stagger, reduceMotion)}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 px-5"
      >
        {error && (
          <p role="alert" className="t-body text-destructive">
            {error}
          </p>
        )}

        {!stats && !error && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        )}

        {stats && (
          <>
            <motion.section
              variants={motionSafe(rise, reduceMotion)}
              aria-labelledby="group-totals"
              className="surface-card grid grid-cols-3 gap-3 rounded-[20px] px-4 py-4"
            >
              <h2 id="group-totals" className="sr-only">
                סיכום החבורה
              </h2>
              <div className="flex flex-col gap-1">
                <span className="t-caption ink-3">ערבים</span>
                <span className="t-title tabular">{stats.nightsPlayed}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="t-caption ink-3">סך הקופות</span>
                <Money value={stats.potTotal} className="t-title" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="t-caption ink-3">הקופה הגדולה</span>
                {stats.biggestPot === null ? (
                  <span className="t-title">—</span>
                ) : (
                  <Money value={stats.biggestPot} className="t-title" />
                )}
              </div>
            </motion.section>

            {stats.locations.length > 0 && (
              <motion.section variants={motionSafe(rise, reduceMotion)} aria-labelledby="group-places">
                <h2 id="group-places" className="section-label mb-2.5">
                  איפה משחקים
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {stats.locations.map((row) => (
                    <li
                      key={row.location}
                      className="surface-card t-caption flex items-center gap-2 rounded-full px-3 py-1.5"
                    >
                      <span className="font-bold">{row.location}</span>
                      <span className="ink-3 tabular">{row.nights}</span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            <motion.section variants={motionSafe(rise, reduceMotion)} aria-labelledby="group-people">
              <h2 id="group-people" className="section-label mb-2.5">
                מי משחק
              </h2>
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="חיפוש שחקן"
                aria-label="חיפוש שחקן"
                className="mb-3"
              />
              <ul className="row-list">
                {members.map((member) => (
                  <li key={member.personId}>
                    <button
                      type="button"
                      onClick={() => {
                        setRecord(null);
                        setSelected(member);
                      }}
                      className="surface-card flex min-h-18 w-full items-center gap-3 rounded-[18px] px-4 py-3 text-start transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-ink-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ChipAvatar
                        avatarKey={member.avatarKey}
                        personId={member.personId}
                        name={member.name}
                        className="size-10"
                      />
                      {/* The real name leads and the nickname sits under it. A nickname
                          is what the table calls someone, not what identifies them, so
                          showing it alone left rows nobody could match to a person. */}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {member.name}
                        </span>
                        {member.nickname && (
                          <span className="t-caption ink-3 block truncate">
                            {member.nickname}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="t-caption ink-3 tabular">
                          {member.nightsPlayed} ערבים
                        </span>
                        {/* Moved off the main column so the nickname can have it, and
                            it reads better beside the count it qualifies anyway. */}
                        <span className="t-caption ink-3">
                          {lastSeen(member.lastPlayedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {members.length === 0 && (
                  <li className="t-body ink-3 px-1 py-4">לא נמצא שחקן בשם הזה.</li>
                )}
              </ul>
            </motion.section>
          </>
        )}
      </motion.div>

      <Drawer open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {selected ? `אתם מול ${selected.name}` : ""}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4">
            {record === null && <Skeleton className="h-20 w-full rounded-2xl" />}
            {record !== null && record.nightsTogether === 0 && (
              <p className="t-body ink-3">
                עוד לא ישבתם יחד לערב שנסגר.
              </p>
            )}
            {record !== null && record.nightsTogether > 0 && (
              <>
                <div className="surface-card flex items-baseline justify-between gap-3 rounded-[20px] px-4 py-3.5">
                  <span className="t-label text-[var(--text-1)]">
                    {record.netDifference > 0
                      ? "אתם מקדימים"
                      : record.netDifference < 0
                        ? "אתם מאחור"
                        : "שוויון מוחלט"}
                  </span>
                  <Money value={record.netDifference} signed className="t-display-l" />
                </div>
                <p className="t-caption ink-3">
                  {record.nightsTogether} ערבים משותפים · {record.youAhead} לכם ·{" "}
                  {record.themAhead} להם
                </p>
                {/* The spec rules out an all-time table because it disadvantages whoever
                    joined last. This counts only nights you both sat at, so it starts
                    empty for both of you at once. */}
                <p className="t-caption ink-3">
                  נספרים רק ערבים ששניכם שיחקתם בהם.
                </p>
              </>
            )}
          </div>
          <DrawerFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setSelected(null)}>
              סגירה
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  );
}
