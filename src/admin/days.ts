/*
  Calendar days on the dashboard are days in the business time zone, the same
  rule the order API uses (aws/src/days.mjs), so a figure for "9 October"
  means the same orders on every screen and for every person, wherever they
  sit. Days are "YYYY-MM-DD" strings throughout; they compare and sort as text.
*/
import { BUSINESS_TIME_ZONE } from "../data/site";

export { BUSINESS_TIME_ZONE };

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/* The business-zone day a moment falls on. */
export function dayOf(moment: string | number | Date) {
  const date = moment instanceof Date ? moment : new Date(moment);
  return Number.isNaN(date.getTime()) ? "" : dayFormat.format(date);
}

export const today = () => dayOf(Date.now());

export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthBounds(month: string) {
  const from = `${month}-01`;
  const to = addDays(`${addMonths(month, 1)}-01`, -1);
  return { from, to };
}

/* 0 is Sunday. */
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/* The weeks of a month as rows of seven, Sunday first, with null outside the month. */
export function monthGrid(month: string): (string | null)[][] {
  const { from, to } = monthBounds(month);
  const cells: (string | null)[] = Array(weekday(from)).fill(null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function prettyDay(day: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const t = Date.parse(`${day}T12:00:00Z`);
  return Number.isNaN(t) ? day : new Date(t).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

export function prettyMonth(month: string) {
  return prettyDay(`${month}-01`, { month: "long", year: "numeric" });
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { timeZone: BUSINESS_TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

/* "Eastern time" style label for the zone, for notes under figures. */
export const ZONE_LABEL = (() => {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZone: BUSINESS_TIME_ZONE, timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    return part?.value ?? BUSINESS_TIME_ZONE;
  } catch {
    return BUSINESS_TIME_ZONE;
  }
})();

export const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => (h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`));
export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
