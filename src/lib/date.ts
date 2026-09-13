/**
 * Israel-local date handling, in one place.
 *
 * Games are stored with `timestamptz`, but a game that started at 00:30 Israel time
 * must not read as the previous day: display, grouping and range-filtering all need
 * the *same* calendar date, derived in the Israel time zone rather than UTC or the
 * server's local zone. Every place that needs "what day is this game" -- history list,
 * history detail, the date-range filter -- should go through here.
 */

export const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

/** `YYYY-MM-DD` in Israel local time, e.g. for grouping and range comparisons. */
export function israelDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Hebrew display date (e.g. "13.9.2026"), in Israel local time. */
export function formatIsraelDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("he-IL", { timeZone: ISRAEL_TIME_ZONE });
}
