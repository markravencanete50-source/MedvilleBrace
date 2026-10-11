/*
  Daily order figures, read from Firestore.

  The AWS figures function writes one document per business-zone day,
  figures/<YYYY-MM-DD>: counts and sums only, with no name, email, address,
  note or order id (aws/src/figures.mjs, dayDocument). The Overview and the
  Calendar draw from those documents, so a chart never touches a customer
  record, and a day with no orders simply has no document.

  This file merges the documents for a range into the OrderStats shape the
  pages already use. The merge is plain addition, so a range of any length
  gives the same answer as the AWS function counting it in one go:

  - totals and byDay add up orders, items and value;
  - averageValue is value divided by the orders that were not cancelled;
  - byStatus, byState and byHour add up bucket by bucket;
  - byWeekday is worked out from each document's day;
  - products merge by slug and sort by items, then value.

  A 30 second in-memory cache spares repeat reads while someone flicks between
  screens. It is cleared on sign-out. Firestore itself is loaded here on first
  use, so the sign-in screen never downloads it.
*/
import type { OrderStats, ProductFigures } from "./api";
import { BUSINESS_TIME_ZONE, weekday } from "./days";
import { getFirestoreLite } from "./firebase";

export interface Figures {
  stats: OrderStats;
  /* When the newest document in the range was written, or null when the range has none. */
  updatedAt: Date | null;
}

export class FiguresError extends Error {}

const CACHE_MS = 30_000;
const cache = new Map<string, { expiresAt: number; request: Promise<Figures> }>();

export function clearFiguresCache() {
  cache.clear();
}

const money = (n: number) => Math.round(n * 100) / 100;
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const text = (v: unknown) => (typeof v === "string" ? v : "");

function addInto(target: Record<string, number>, source: unknown) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + count(value);
}

/* Exported for the tests in the report; the pages call fetchFigures. */
export function mergeDays(docs: Record<string, unknown>[], from: string, to: string): Figures {
  const totals = { orders: 0, units: 0, value: 0, cancelled: 0 };
  const byDay: OrderStats["byDay"] = {};
  const byStatus: Record<string, number> = {};
  const byState: Record<string, number> = {};
  const byHour: number[] = Array(24).fill(0);
  const byWeekday: number[] = Array(7).fill(0);
  const products = new Map<string, ProductFigures>();
  let timeZone = "";
  let newest: Date | null = null;

  for (const doc of docs) {
    const day = text(doc.day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to) continue;
    const orders = count(doc.orders);
    const units = count(doc.units);
    const value = count(doc.value);

    totals.orders += orders;
    totals.units += units;
    totals.value += value;
    totals.cancelled += count(doc.cancelled);
    const entry = (byDay[day] ??= { orders: 0, units: 0, value: 0 });
    entry.orders += orders;
    entry.units += units;
    entry.value = money(entry.value + value);

    addInto(byStatus, doc.byStatus);
    addInto(byState, doc.byState);
    if (Array.isArray(doc.byHour)) for (let h = 0; h < 24; h++) byHour[h] += count(doc.byHour[h]);
    byWeekday[weekday(day)] += orders;

    if (Array.isArray(doc.products)) {
      for (const raw of doc.products) {
        const slug = text(raw?.slug);
        if (!slug) continue;
        const p = products.get(slug) ?? { slug, name: "", units: 0, value: 0, orders: 0 };
        p.name = p.name || text(raw.name);
        p.units += count(raw.units);
        p.value += count(raw.value);
        p.orders += count(raw.orders);
        products.set(slug, p);
      }
    }

    timeZone = timeZone || text(doc.timeZone);
    const written = doc.updatedAt as { toDate?: () => Date } | undefined;
    const at = typeof written?.toDate === "function" ? written.toDate() : null;
    if (at && (!newest || at > newest)) newest = at;
  }

  totals.value = money(totals.value);
  const kept = totals.orders - totals.cancelled;
  return {
    updatedAt: newest,
    stats: {
      timeZone: timeZone || BUSINESS_TIME_ZONE,
      from,
      to,
      totals: { ...totals, averageValue: kept > 0 ? money(totals.value / kept) : 0 },
      byDay,
      byStatus,
      byState,
      byHour,
      byWeekday,
      products: [...products.values()].map((p) => ({ ...p, value: money(p.value) })).sort((a, b) => b.units - a.units || b.value - a.value),
      truncated: false,
    },
  };
}

function plainProblem(problem: unknown) {
  const code = typeof (problem as { code?: unknown })?.code === "string" ? String((problem as { code: string }).code) : "";
  if (code.includes("permission-denied")) return "You do not have access to the figures.";
  if (code.includes("unauthenticated")) return "Please sign in again.";
  if (code.includes("unavailable") || code.includes("deadline") || /network|fetch|Failed to load/i.test(String((problem as Error)?.message ?? ""))) {
    return "The figures could not be loaded. Check the connection and try again.";
  }
  return "The figures could not be loaded. Please try again.";
}

async function load(from: string, to: string): Promise<Figures> {
  try {
    const [db, sdk] = await Promise.all([getFirestoreLite(), import("firebase/firestore/lite")]);
    const snapshot = await sdk.getDocs(sdk.query(sdk.collection(db, "figures"), sdk.where("day", ">=", from), sdk.where("day", "<=", to)));
    return mergeDays(snapshot.docs.map((d) => d.data() as Record<string, unknown>), from, to);
  } catch (problem) {
    throw new FiguresError(plainProblem(problem));
  }
}

export function fetchFigures(range: { from: string; to: string }): Promise<Figures> {
  const key = `${range.from}:${range.to}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.request;
  for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
  const request = load(range.from, range.to);
  cache.set(key, { expiresAt: now + CACHE_MS, request });
  request.catch(() => cache.get(key)?.request === request && cache.delete(key));
  return request;
}
