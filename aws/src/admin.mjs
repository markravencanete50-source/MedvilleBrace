/*
  The dashboard API: the AWS Lambda behind POST /admin.

  API Gateway checks the Cognito ID token before this runs (a JWT authorizer
  on the route), so every event here carries verified claims. This file then:

  - Reads the person's account and group live (cached for 30 seconds), so a
    removed or disabled person is refused even while their token is valid.
  - Allows each action only for the roles listed in ACCESS. Staff work with
    orders; owners also manage accounts and read the access log.
  - Writes an access-log entry for every read, change and export of orders,
    and for every refusal. The log names who and when, never what a customer
    wrote, so it does not become a second copy of the orders.
  - Never logs request bodies or order contents, and never echoes input.

  Kept free of AWS imports so it can be tested with plain Node and fake data
  (aws/admin.test.mjs). admin-index.mjs wires it to DynamoDB and Cognito.
*/
import { randomUUID } from "node:crypto";
import { reply } from "./order.mjs";
import { dayBounds, daysBetween, localParts, validDay, validTimeZone } from "./days.mjs";
import { ROLES } from "./users.mjs";

export const ORDER_STATUSES = ["new", "contacted", "confirmed", "shipped", "completed", "cancelled"];

const STAFF_ACTIONS = ["orders.list", "orders.get", "orders.update", "orders.stats", "orders.export"];
const OWNER_ACTIONS = [...STAFF_ACTIONS, "audit.list", "admins.list", "admins.invite", "admins.setRole", "admins.setEnabled", "admins.delete", "admins.resend"];
export const ACCESS = { owner: new Set(OWNER_ACTIONS), staff: new Set(STAFF_ACTIONS) };

/* Mailboxes several people share. A login must belong to one person, or the access log cannot say who acted. */
export const SHARED_MAILBOXES = new Set([
  "accounts", "admin", "administrator", "billing", "contact", "enquiries", "hello", "help", "info", "inquiries",
  "mail", "marketing", "no-reply", "noreply", "office", "orders", "sales", "staff", "support", "team",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USER_ID = /^[\w.@+-]{1,128}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_BODY = 65536;
const PAGE = 100;
const MAX_STATS_DAYS = 400;
const ACTOR_CACHE_MS = 30000;

const text = (v) => (typeof v === "string" ? v : "");
const money = (n) => Math.round(n * 100) / 100;

/* The fields the dashboard shows, read defensively: nothing in the table is trusted to have a shape. */
export function orderView(item) {
  const c = item.customer && typeof item.customer === "object" ? item.customer : {};
  const a = c.address && typeof c.address === "object" ? c.address : {};
  const items = Array.isArray(item.items) ? item.items : [];
  return {
    id: text(item.id),
    reference: text(item.reference),
    createdAt: text(item.createdAt) || null,
    status: ORDER_STATUSES.includes(item.status) ? item.status : "new",
    note: text(item.note),
    notes: text(item.notes),
    notificationStatus: text(item.notificationStatus),
    updatedAt: text(item.updatedAt) || null,
    updatedBy: text(item.updatedBy),
    customer: {
      name: text(c.name),
      email: text(c.email),
      phone: text(c.phone),
      address: { line1: text(a.line1), line2: text(a.line2), city: text(a.city), state: text(a.state), zip: text(a.zip) },
    },
    items: items.map((l) => ({
      slug: text(l?.slug),
      name: text(l?.name),
      sku: text(l?.sku),
      options: Array.isArray(l?.options) ? l.options.map(text) : [],
      optionNames: Array.isArray(l?.optionNames) ? l.optionNames.map(text) : [],
      qty: Number.isInteger(l?.qty) ? l.qty : 0,
      unitPrice: typeof l?.unitPrice === "number" ? l.unitPrice : 0,
    })),
    subtotal: typeof item.subtotal === "number" ? item.subtotal : 0,
    currency: text(item.currency) || "USD",
  };
}

/* Daily figures for the days from..to in tz. Value is the quoted subtotal of orders not cancelled. */
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
    if (state) byState[state] = (byState[state] ?? 0) + 1;

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

function encodeCursor(key) {
  return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null;
}

function decodeCursor(value, pk) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 600) throw new Error("bad cursor");
  const key = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  const ok = key && typeof key === "object" && Object.keys(key).length === 3 && typeof key.id === "string" && key.id.length <= 64 &&
    key.gsi1pk === pk && typeof key.gsi1sk === "string" && key.gsi1sk.length <= 120;
  if (!ok) throw new Error("bad cursor");
  return { id: key.id, gsi1pk: key.gsi1pk, gsi1sk: key.gsi1sk };
}

/*
  db.send(kind, input) runs one DynamoDB document-client command: "Get",
  "Query", "Put" or "TransactWrite". users is the account store from users.mjs.
*/
export function createAdminHandler({ origins, db, users, ordersTable, auditTable, defaultTimeZone = "America/New_York", statsLimit = 20000, now = () => Date.now() }) {
  const actors = new Map();

  async function actorFor(username) {
    const hit = actors.get(username);
    if (hit && hit.until > now()) return hit.actor;
    const actor = await users.lookup(username);
    actors.set(username, { actor, until: now() + ACTOR_CACHE_MS });
    if (actors.size > 200) actors.delete(actors.keys().next().value);
    return actor;
  }

  function auditItem(actor, action, detail = {}) {
    const at = new Date(now()).toISOString();
    const id = randomUUID();
    return { id, gsi1pk: "AUDIT", gsi1sk: `${at}#${id}`, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role || "none", action, ...detail, at };
  }

  const audit = (actor, action, detail) =>
    db.send("Put", { TableName: auditTable, Item: auditItem(actor, action, detail), ConditionExpression: "attribute_not_exists(id)" });

  function rangeQuery(b, timeZone) {
    const from = b.from || "";
    const to = b.to || "";
    if ((from && !validDay(from)) || (to && !validDay(to)) || (from && to && from > to)) return null;
    const input = { KeyConditionExpression: "gsi1pk = :pk", ExpressionAttributeValues: { ":pk": "ORDER" } };
    if (from || to) {
      const bounds = dayBounds(from || "2000-01-01", to || "2999-12-31", timeZone);
      input.KeyConditionExpression += " AND gsi1sk BETWEEN :start AND :end";
      input.ExpressionAttributeValues[":start"] = from ? bounds.start : "0";
      input.ExpressionAttributeValues[":end"] = to ? bounds.end : "9";
    }
    return input;
  }

  const zoneOf = (b) => (b.timeZone === undefined ? defaultTimeZone : validTimeZone(b.timeZone) ? b.timeZone : null);

  const actions = {
    async "orders.list"(actor, b) {
      const timeZone = zoneOf(b);
      const range = timeZone && rangeQuery(b, timeZone);
      if (!range) return { status: 400, error: "Invalid date range." };
      let start;
      try {
        start = decodeCursor(b.cursor, "ORDER");
      } catch {
        return { status: 400, error: "Invalid page." };
      }
      const out = await db.send("Query", { TableName: ordersTable, IndexName: "OrderTimeline", ...range, ScanIndexForward: false, Limit: PAGE, ExclusiveStartKey: start });
      const items = out.Items || [];
      await audit(actor, "orders.list", { count: items.length });
      return { orders: items.map(orderView), nextCursor: encodeCursor(out.LastEvaluatedKey) };
    },

    async "orders.get"(actor, b) {
      if (typeof b.id !== "string" || !UUID.test(b.id)) return { status: 400, error: "Invalid order." };
      const out = await db.send("Get", { TableName: ordersTable, Key: { id: b.id }, ConsistentRead: true });
      if (!out.Item) return { status: 404, error: "Order not found." };
      await audit(actor, "orders.read", { orderId: b.id });
      return { order: orderView(out.Item) };
    },

    async "orders.update"(actor, b) {
      if (typeof b.id !== "string" || !UUID.test(b.id)) return { status: 400, error: "Invalid order." };
      const names = { "#updatedAt": "updatedAt", "#updatedBy": "updatedBy" };
      const values = { ":at": new Date(now()).toISOString(), ":by": actor.email };
      const sets = ["#updatedAt = :at", "#updatedBy = :by"];
      const fields = [];
      if (b.status !== undefined) {
        if (!ORDER_STATUSES.includes(b.status)) return { status: 400, error: "Invalid status." };
        names["#status"] = "status";
        values[":status"] = b.status;
        sets.push("#status = :status");
        fields.push("status");
      }
      if (b.note !== undefined) {
        if (typeof b.note !== "string" || b.note.length > 2000 || CONTROL.test(b.note)) return { status: 400, error: "Invalid note." };
        names["#note"] = "note";
        values[":note"] = b.note;
        sets.push("#note = :note");
        fields.push("note");
      }
      if (!fields.length) return { status: 400, error: "Nothing to change." };
      try {
        await db.send("TransactWrite", {
          TransactItems: [
            { Update: { TableName: ordersTable, Key: { id: b.id }, UpdateExpression: `SET ${sets.join(", ")}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values, ConditionExpression: "attribute_exists(id)" } },
            { Put: { TableName: auditTable, Item: auditItem(actor, "orders.update", { orderId: b.id, fields, ...(b.status ? { detail: b.status } : {}) }), ConditionExpression: "attribute_not_exists(id)" } },
          ],
        });
      } catch (error) {
        if (error?.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") return { status: 404, error: "Order not found." };
        throw error;
      }
      return { ok: true, updatedAt: values[":at"], updatedBy: actor.email };
    },

    async "orders.stats"(actor, b) {
      const timeZone = zoneOf(b);
      if (!timeZone || !validDay(b.from) || !validDay(b.to) || b.from > b.to) return { status: 400, error: "Invalid date range." };
      if (daysBetween(b.from, b.to) >= MAX_STATS_DAYS) return { status: 400, error: `Choose a range of ${MAX_STATS_DAYS} days or less.` };
      const range = rangeQuery(b, timeZone);
      const items = [];
      let start;
      let truncated = false;
      do {
        const out = await db.send("Query", {
          TableName: ordersTable,
          IndexName: "OrderTimeline",
          ...range,
          /* Only what the figures need: no names, emails or street addresses. */
          ProjectionExpression: "createdAt, #status, subtotal, #items, customer.address.#state",
          ExpressionAttributeNames: { "#status": "status", "#items": "items", "#state": "state" },
          ExclusiveStartKey: start,
        });
        items.push(...(out.Items || []));
        start = out.LastEvaluatedKey;
        if (items.length >= statsLimit) truncated = Boolean(start);
      } while (start && !truncated);
      await audit(actor, "orders.stats", { count: items.length });
      return { ...aggregate(items, { from: b.from, to: b.to, timeZone }), truncated };
    },

    async "orders.export"(actor, b) {
      if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 1000 || !b.ids.every((id) => typeof id === "string" && UUID.test(id))) {
        return { status: 400, error: "Invalid export." };
      }
      await audit(actor, "orders.export", { count: b.ids.length });
      return { ok: true };
    },

    async "audit.list"(_actor, b) {
      let start;
      try {
        start = decodeCursor(b.cursor, "AUDIT");
      } catch {
        return { status: 400, error: "Invalid page." };
      }
      const out = await db.send("Query", {
        TableName: auditTable,
        IndexName: "AuditTimeline",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": "AUDIT" },
        ScanIndexForward: false,
        Limit: PAGE,
        ExclusiveStartKey: start,
      });
      const entries = (out.Items || []).map((e) => ({
        id: text(e.id),
        at: text(e.at) || null,
        actorEmail: text(e.actorEmail),
        actorRole: text(e.actorRole),
        action: text(e.action),
        orderId: text(e.orderId),
        target: text(e.target),
        detail: text(e.detail),
        count: typeof e.count === "number" ? e.count : null,
      }));
      return { entries, nextCursor: encodeCursor(out.LastEvaluatedKey) };
    },

    async "admins.list"() {
      return { admins: await users.list() };
    },

    async "admins.invite"(actor, b) {
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      if (!/^[^\s@"]{1,64}@[^\s@"]+\.[^\s@"]+$/.test(email) || email.length > 160) return { status: 400, error: "Enter a valid email address." };
      if (SHARED_MAILBOXES.has(email.split("@")[0])) {
        return { status: 400, error: "That is a shared mailbox. Every person needs their own address, because the access log records who opened each order." };
      }
      if (!ROLES.includes(b.role)) return { status: 400, error: "Choose Owner or Staff." };
      const result = await users.invite(email, b.role);
      actors.delete(result.id);
      await audit(actor, "admins.invite", { target: email, detail: b.role });
      return { ok: true, created: result.created };
    },

    async "admins.setRole"(actor, b) {
      if (typeof b.id !== "string" || !USER_ID.test(b.id)) return { status: 400, error: "Invalid account." };
      if (b.id === actor.id) return { status: 400, error: "You cannot change your own access." };
      if (b.role !== "none" && !ROLES.includes(b.role)) return { status: 400, error: "Invalid role." };
      const target = await users.lookup(b.id);
      if (!target) return { status: 404, error: "Account not found." };
      await users.setRole(b.id, b.role);
      actors.delete(b.id);
      await audit(actor, "admins.setRole", { target: target.email, detail: b.role });
      return { ok: true };
    },

    async "admins.setEnabled"(actor, b) {
      if (typeof b.id !== "string" || !USER_ID.test(b.id) || typeof b.enabled !== "boolean") return { status: 400, error: "Invalid account." };
      if (b.id === actor.id) return { status: 400, error: "You cannot switch off your own account." };
      const target = await users.lookup(b.id);
      if (!target) return { status: 404, error: "Account not found." };
      await users.setEnabled(b.id, b.enabled);
      actors.delete(b.id);
      await audit(actor, b.enabled ? "admins.enable" : "admins.disable", { target: target.email });
      return { ok: true };
    },

    async "admins.delete"(actor, b) {
      if (typeof b.id !== "string" || !USER_ID.test(b.id)) return { status: 400, error: "Invalid account." };
      if (b.id === actor.id) return { status: 400, error: "You cannot remove your own account." };
      const target = await users.lookup(b.id);
      if (!target) return { status: 404, error: "Account not found." };
      await users.remove(b.id);
      actors.delete(b.id);
      await audit(actor, "admins.delete", { target: target.email });
      return { ok: true };
    },

    async "admins.resend"(actor, b) {
      if (typeof b.id !== "string" || !USER_ID.test(b.id)) return { status: 400, error: "Invalid account." };
      const target = await users.lookup(b.id);
      if (!target) return { status: 404, error: "Account not found." };
      if (!(await users.resend(b.id))) return { status: 400, error: "This person has already signed in. They can use Forgot password on the sign-in page." };
      await audit(actor, "admins.resend", { target: target.email });
      return { ok: true };
    },
  };

  return async (event) => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const origin = headers.origin || "";
    if (!origins.includes(origin)) return reply(403, "", { error: "Request not allowed." });
    if (event.requestContext?.http?.method !== "POST") return reply(405, origin, { error: "Method not allowed." });
    if (!(headers["content-type"] || "").toLowerCase().startsWith("application/json")) return reply(415, origin, { error: "JSON required." });

    const claims = event.requestContext?.authorizer?.jwt?.claims || {};
    const username = claims["cognito:username"];
    if (claims.token_use !== "id" || typeof username !== "string" || !USER_ID.test(username)) return reply(401, origin, { error: "Please sign in again." });

    let raw = event.body || "";
    if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
    if (Buffer.byteLength(raw) > MAX_BODY) return reply(413, origin, { error: "Request too large." });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.action !== "string") return reply(400, origin, { error: "Invalid request." });
    const action = Object.hasOwn(actions, body.action) ? body.action : null;
    if (!action) return reply(400, origin, { error: "Unknown request." });

    try {
      const actor = await actorFor(username);
      if (!actor || !actor.enabled || !actor.role || !ACCESS[actor.role]?.has(action)) {
        const who = actor || { id: username, email: typeof claims.email === "string" ? claims.email : "", role: null };
        await audit(who, "access.denied", { detail: action });
        return reply(403, origin, { error: "You do not have access to that." });
      }
      const result = await actions[action](actor, body);
      const { status = 200, ...rest } = result;
      return reply(status, origin, rest);
    } catch {
      console.error("admin request failed", { requestId: event.requestContext?.requestId, action });
      return reply(503, origin, { error: "The order service is not available right now. Please try again." });
    }
  };
}
