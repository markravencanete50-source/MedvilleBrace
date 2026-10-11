/*
  Daily order figures, copied from the orders table to Firestore.

  The dashboard's Overview and Calendar read these figures from Firebase, so
  drawing a chart never touches a customer record. Each business-zone day is
  one Firestore document, figures/<YYYY-MM-DD>, holding counts and sums only:
  orders, items, value, statuses, hours of the day, products and ship-to
  states. No name, email, phone, street, ZIP code or note is ever read for it,
  and no order id is ever copied.

  How it stays current: the orders table streams only the KEY of each order
  that changes (KEYS_ONLY), so this code never receives an order's contents.
  For each changed key it reads that order with a consistent read (the
  figures' fields alone), works out its day, recounts the whole day from the
  timeline index and replaces that day's document. A recount, not an
  increment, so a retried batch can never count an order twice. The index is
  eventually consistent, so it can lag behind the write that triggered the
  recount; the order just read replaces its own entry in the index results
  (or is added to them), so the day always includes the change. The order id
  is read only to match those two up and never reaches a document.

  Kept free of AWS and Google imports so it can be tested with plain Node
  (aws/admin.test.mjs). figures-index.mjs wires it up.
*/
import { addDays, dayBounds, daysBetween, localParts, validDay } from "./days.mjs";

export const ORDER_STATUSES = ["new", "contacted", "confirmed", "shipped", "completed", "cancelled"];

/* The attributes figures are made from. Never add a name, email, phone, street, ZIP or note. */
export const FIGURE_PROJECTION = {
  ProjectionExpression: "createdAt, #status, subtotal, #items, #customer.#address.#state",
  ExpressionAttributeNames: { "#status": "status", "#items": "items", "#customer": "customer", "#address": "address", "#state": "state" },
};

/* What is actually read: the same, plus the order id, used only to match an order to its entry in the index. It is dropped before counting. */
export const FIGURE_READ = {
  ProjectionExpression: `#id, ${FIGURE_PROJECTION.ProjectionExpression}`,
  ExpressionAttributeNames: { ...FIGURE_PROJECTION.ExpressionAttributeNames, "#id": "id" },
};

const PRODUCTS_PER_DAY = 60;
const MAX_REBUILD_DAYS = 800;

const text = (v) => (typeof v === "string" ? v : "");
const money = (n) => Math.round(n * 100) / 100;

/* Figures for the days from..to in tz. Value is the quoted subtotal of orders not cancelled. */
export function aggregate(items, { from, to, timeZone }) {
  const totals = { orders: 0, units: 0, value: 0, cancelled: 0 };
  const byDay = {};
  const byStatus = {};
  const byState = {};
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const products = new Map();

  for (const item of items) {
    const when = localParts(item.createdAt, timeZone);
    if (!when || when.day < from || when.day > to) continue;
    const status = ORDER_STATUSES.includes(item.status) ? item.status : "new";
    const cancelled = status === "cancelled";
    const lines = Array.isArray(item.items) ? item.items : [];
    const units = cancelled ? 0 : lines.reduce((n, l) => n + (Number.isInteger(l?.qty) ? l.qty : 0), 0);
    const value = cancelled || typeof item.subtotal !== "number" ? 0 : item.subtotal;

    totals.orders += 1;
    totals.units += units;
    totals.value += value;
    if (cancelled) totals.cancelled += 1;
    const day = (byDay[when.day] ??= { orders: 0, units: 0, value: 0 });
    day.orders += 1;
    day.units += units;
    day.value += value;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byHour[when.hour] += 1;
    byWeekday[when.weekday] += 1;
    const state = text(item.customer?.address?.state);
    if (/^[A-Z]{2}$/.test(state)) byState[state] = (byState[state] ?? 0) + 1;

    if (cancelled) continue;
    const seen = new Set();
    for (const l of lines) {
      const slug = text(l?.slug);
      if (!slug || !Number.isInteger(l?.qty)) continue;
      const p = products.get(slug) ?? { slug, name: text(l.name), units: 0, value: 0, orders: 0 };
      p.units += l.qty;
      p.value += (typeof l.unitPrice === "number" ? l.unitPrice : 0) * l.qty;
      if (!seen.has(slug)) p.orders += 1;
      seen.add(slug);
      products.set(slug, p);
    }
  }

  for (const d of Object.values(byDay)) d.value = money(d.value);
  totals.value = money(totals.value);
  const kept = totals.orders - totals.cancelled;
  return {
    timeZone,
    from,
    to,
    totals: { ...totals, averageValue: kept ? money(totals.value / kept) : 0 },
    byDay,
    byStatus,
    byState,
    byHour,
    byWeekday,
    products: [...products.values()].map((p) => ({ ...p, value: money(p.value) })).sort((a, b) => b.units - a.units || b.value - a.value),
  };
}

/* One day's Firestore document. Plain numbers and short labels only. */
export function dayDocument(items, day, timeZone, updatedAt) {
  const s = aggregate(items, { from: day, to: day, timeZone });
  return {
    day,
    timeZone,
    orders: s.totals.orders,
    units: s.totals.units,
    value: s.totals.value,
    cancelled: s.totals.cancelled,
    byStatus: s.byStatus,
    byState: s.byState,
    byHour: s.byHour,
    products: s.products.slice(0, PRODUCTS_PER_DAY),
    updatedAt,
  };
}

/*
  db.send(kind, input) runs one DynamoDB document-client command ("Get" or
  "Query"). write(docs) replaces Firestore documents: [{ path, data }].
*/
export function createFigures({ db, write, ordersTable, timeZone, now = () => Date.now() }) {
  async function ordersBetween(from, to) {
    const { start, end } = dayBounds(from, to, timeZone);
    const items = [];
    let key;
    do {
      const out = await db.send("Query", {
        TableName: ordersTable,
        IndexName: "OrderTimeline",
        KeyConditionExpression: "gsi1pk = :pk AND gsi1sk BETWEEN :start AND :end",
        ExpressionAttributeValues: { ":pk": "ORDER", ":start": start, ":end": end },
        ...FIGURE_READ,
        ExclusiveStartKey: key,
      });
      items.push(...(out.Items || []));
      key = out.LastEvaluatedKey;
    } while (key);
    return items;
  }

  async function writeDays(days, items) {
    const at = new Date(now());
    const figureItems = items.map(({ id, ...rest }) => rest);
    const docs = [...days].sort().map((day) => ({ path: `figures/${day}`, data: dayDocument(figureItems, day, timeZone, at) }));
    if (docs.length) await write(docs);
    return docs.length;
  }

  return {
    /* A DynamoDB stream batch (KEYS_ONLY): recount every day an order changed on. */
    async fromStream(records) {
      const ids = new Set();
      for (const r of records || []) {
        const id = r?.dynamodb?.Keys?.id?.S;
        if (typeof id === "string" && id.length <= 64) ids.add(id);
      }
      const days = new Set();
      const fresh = new Map();
      for (const id of ids) {
        const out = await db.send("Get", { TableName: ordersTable, Key: { id }, ConsistentRead: true, ...FIGURE_READ });
        const when = out.Item && localParts(out.Item.createdAt, timeZone);
        if (!when) continue;
        days.add(when.day);
        fresh.set(id, { ...out.Item, id });
      }
      let written = 0;
      for (const day of days) {
        /* The index may not show these orders yet, or show them as they were: what was just read wins. */
        const indexed = (await ordersBetween(day, day)).filter((item) => !fresh.has(item.id));
        written += await writeDays([day], [...indexed, ...fresh.values()]);
      }
      return { days: written };
    },

    /* Recounts every day from..to that has orders. For a first fill, or after Firestore was unreachable. */
    async rebuild(from, to) {
      if (!validDay(from) || !validDay(to) || from > to || daysBetween(from, to) >= MAX_REBUILD_DAYS) throw new Error("invalid range");
      let written = 0;
      for (let start = from; start <= to; start = addDays(start, 31)) {
        const end = addDays(start, 30) < to ? addDays(start, 30) : to;
        const items = await ordersBetween(start, end);
        const days = new Set(items.map((i) => localParts(i.createdAt, timeZone)?.day).filter((d) => d && d >= start && d <= end));
        written += await writeDays(days, items);
      }
      return { days: written };
    },
  };
}
