/*
  Calendar days in a named time zone, for the dashboard's daily figures.

  Orders are stored with a UTC timestamp. A "day" on the dashboard is a day in
  the business time zone, so an order sent at 9 pm in New York counts for that
  evening, not for the next UTC morning. Plain Intl, no date library.
*/
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formats = new Map();

export function validTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validDay(day) {
  if (typeof day !== "string" || !DAY.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day;
}

export function addDays(day, n) {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function format(tz) {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formats.set(tz, f);
  }
  return f;
}

function parts(t, tz) {
  const out = {};
  for (const p of format(tz).formatToParts(new Date(t))) out[p.type] = p.value;
  return out;
}

/* The calendar day, hour (0 to 23) and weekday (0 is Sunday) of a moment in tz. */
export function localParts(iso, tz) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const p = parts(t, tz);
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, weekday: WEEKDAYS[p.weekday] ?? 0 };
}

function offsetMs(t, tz) {
  const p = parts(t, tz);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/* The UTC moment at which a calendar day starts in tz, correct across daylight saving changes. */
export function startOfDay(day, tz) {
  const guess = Date.parse(`${day}T00:00:00Z`);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return t;
}

/* ISO bounds for the days from..to inclusive: start <= createdAt < end. */
export function dayBounds(from, to, tz) {
  return { start: new Date(startOfDay(from, tz)).toISOString(), end: new Date(startOfDay(addDays(to, 1), tz)).toISOString() };
}

export function today(tz, now = Date.now()) {
  return localParts(now, tz).day;
}
