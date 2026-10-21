/*
  The dashboard API: the AWS Lambda behind POST /admin.

  Staff sign in with Firebase Authentication. API Gateway checks the Firebase
  ID token before this runs (a JWT authorizer on the route, issuer
  securetoken.google.com/<project>), so every event here carries verified
  claims. Only that token crosses from Google to AWS; no order detail goes
  the other way. This file then:

  - Reads the person's account and role live from Firebase (cached for 30
    seconds), so a removed, switched-off or demoted person is refused even
    while their token is valid, and a token issued before their sessions
    were ended is refused too.
  - Allows each action only for the roles listed in ACCESS. Staff work with
    orders and can publish store changes; owners also manage accounts and
    read the access log.
  - Writes an access-log entry for every read, change and export of orders,
    and for every refusal. The log names who and when, never what a customer
    wrote, so it does not become a second copy of the orders.
  - Never logs request bodies or order contents, and never echoes input.

  Kept free of AWS imports so it can be tested with plain Node and fake data
  (aws/admin.test.mjs). admin-index.mjs wires it to DynamoDB and Firebase.

  The figures on the Overview and Calendar are not served here: figures.mjs
  copies daily counts (no customer details) to Firestore and the dashboard
  reads them there.
*/
import { randomUUID } from "node:crypto";
import { reply } from "./order.mjs";
import { dayBounds, validDay, validTimeZone } from "./days.mjs";
import { ROLES } from "./identity.mjs";
import { ORDER_STATUSES } from "./figures.mjs";
import { PublishHookError } from "./publish.mjs";

export { ORDER_STATUSES };

const STAFF_ACTIONS = ["orders.list", "orders.get", "orders.update", "orders.export", "site.publish"];
const OWNER_ACTIONS = [...STAFF_ACTIONS, "audit.list", "admins.list", "admins.invite", "admins.setRole", "admins.setEnabled", "admins.delete", "admins.resend"];
export const ACCESS = { owner: new Set(OWNER_ACTIONS), staff: new Set(STAFF_ACTIONS) };

/* Mailboxes several people share. A login must belong to one person, or the access log cannot say who acted. */
export const SHARED_MAILBOXES = new Set([
  "accounts", "admin", "administrator", "billing", "contact", "enquiries", "hello", "help", "info", "inquiries",
  "mail", "marketing", "no-reply", "noreply", "office", "orders", "sales", "staff", "support", "team",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_BODY = 65536;
const PAGE = 100;
const ACTOR_CACHE_MS = 30000;
const PUBLISH_GAP_MS = 60000;

const text = (v) => (typeof v === "string" ? v : "");

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
  "Query", "Put" or "TransactWrite". users is the account store from
  identity.mjs. publish() starts a rebuild of the website (a Vercel deploy
  hook), or is null when none is set up.
*/
export function createAdminHandler({ origins, db, users, ordersTable, auditTable, publish = null, defaultTimeZone = "America/New_York", now = () => Date.now() }) {
  const actors = new Map();
  let publishedAt = -Infinity;
  let uncertainPublish = null;

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

    async "orders.export"(actor, b) {
      if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 1000 || !b.ids.every((id) => typeof id === "string" && UUID.test(id))) {
        return { status: 400, error: "Invalid export." };
      }
      await audit(actor, "orders.export", { count: b.ids.length });
      return { ok: true };
    },

    async "site.publish"(actor) {
      if (!publish) return { status: 400, error: "Publishing is not set up yet. Store changes appear after the next deploy. See README.md, Store content." };
      if (now() - publishedAt < PUBLISH_GAP_MS) {
        if (uncertainPublish) throw uncertainPublish;
        return { ok: true, already: true };
      }
      /* Keep the gap after an uncertain response: the hook may already have started a rebuild. */
      const previous = publishedAt;
      publishedAt = now();
      uncertainPublish = null;
      try {
        await publish();
      } catch (error) {
        if (!(error instanceof PublishHookError) || error.reason === "http") publishedAt = previous;
        else uncertainPublish = error;
        throw error;
      }
      await audit(actor, "site.publish");
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
      if (email === actor.email) return { status: 400, error: "You cannot change your own access." };
      const result = await users.invite(email, b.role);
      actors.delete(result.id);
      await audit(actor, "admins.invite", { target: email, detail: b.role });
      /* The dashboard now has Firebase email the person a link to choose a password. */
      return { ok: true, created: result.created, email };
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
      if (!target.invited || !target.enabled) return { status: 400, error: "This person has already signed in. They can use Forgot password on the sign-in page." };
      await audit(actor, "admins.resend", { target: target.email });
      return { ok: true, email: target.email };
    },
  };

  return async (event) => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const origin = headers.origin || "";
    if (!origins.includes(origin)) return reply(403, "", { error: "Request not allowed." });
    if (event.requestContext?.http?.method !== "POST") return reply(405, origin, { error: "Method not allowed." });
    if (!(headers["content-type"] || "").toLowerCase().startsWith("application/json")) return reply(415, origin, { error: "JSON required." });

    const claims = event.requestContext?.authorizer?.jwt?.claims || {};
    const uid = claims.sub;
    const signedInAt = Number(claims.auth_time);
    if (typeof uid !== "string" || !USER_ID.test(uid) || !Number.isFinite(signedInAt)) return reply(401, origin, { error: "Please sign in again." });

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
      const actor = await actorFor(uid);
      /* Sessions ended by a role change or switch-off: the token predates them. */
      if (actor && signedInAt < actor.validSince) return reply(401, origin, { error: "Your session ended. Please sign in again." });
      if (!actor || !actor.enabled || !actor.role || !ACCESS[actor.role]?.has(action)) {
        const who = actor || { id: uid, email: typeof claims.email === "string" ? claims.email : "", role: null };
        await audit(who, "access.denied", { detail: action });
        return reply(403, origin, { error: "You do not have access to that." });
      }
      const result = await actions[action](actor, body);
      const { status = 200, ...rest } = result;
      return reply(status, origin, rest);
    } catch (error) {
      if (action === "site.publish" && error instanceof PublishHookError) {
        /* Only fixed categories and numeric status codes. Never log the URL or raw exception. */
        console.error("admin request failed", { requestId: event.requestContext?.requestId, action, failure: error.reason, ...(error.status ? { status: error.status } : {}) });
        const message = error.reason === "http"
          ? "Publishing could not be started. Please try again later."
          : "The publish result could not be confirmed. A rebuild may already have started. Check Vercel deployments before trying again.";
        return reply(503, origin, { error: message });
      }
      console.error("admin request failed", { requestId: event.requestContext?.requestId, action });
      return reply(503, origin, { error: "The order service is not available right now. Please try again." });
    }
  };
}
