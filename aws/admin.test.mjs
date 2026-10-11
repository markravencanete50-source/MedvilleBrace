/*
  Tests for the dashboard API. Invented orders and invented people only:
  no real customer data, no network, no AWS services.

    npm run test:orders
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregate, createAdminHandler, orderView } from "./src/admin.mjs";
import { createUsers } from "./src/users.mjs";
import { dayBounds, localParts, startOfDay, validDay, validTimeZone } from "./src/days.mjs";

const ORIGIN = "https://shop.test";
const TZ = "America/New_York";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function order(n, createdAt, { status = "new", state = "IL", lines = [["test-knee-brace", "Testbrand Knee Brace", 2, 100]] } = {}) {
  const items = lines.map(([slug, name, qty, unitPrice]) => ({ slug, name, sku: `${slug}-sku`, options: ["M"], optionNames: ["Size"], qty, unitPrice }));
  return {
    id: id(n),
    reference: `MB-${String(n).padStart(8, "0")}`,
    createdAt,
    status,
    customer: { name: `Test Person ${n}`, email: `person${n}@example.test`, phone: "555-010-0000", address: { line1: "1 Test Street", line2: "", city: "Testville", state, zip: "62701" } },
    notes: "",
    items,
    subtotal: items.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    currency: "USD",
    notificationStatus: "sent",
    requestHash: "x",
    gsi1pk: "ORDER",
    gsi1sk: `${createdAt}#${id(n)}`,
  };
}

/* An in-memory stand-in for the DynamoDB document client, paging two rows at a time. */
function fakeDb(seed = [], { pageSize = 2 } = {}) {
  const orders = new Map(seed.map((o) => [o.id, structuredClone(o)]));
  const audit = [];
  const calls = [];
  const project = (row, expr) => {
    if (!expr) return structuredClone(row);
    return { createdAt: row.createdAt, status: row.status, subtotal: row.subtotal, items: structuredClone(row.items), customer: { address: { state: row.customer.address.state } } };
  };
  async function send(kind, input) {
    calls.push([kind, structuredClone(input)]);
    if (kind === "Get") {
      const row = orders.get(input.Key.id);
      return { Item: row && structuredClone(row) };
    }
    if (kind === "Put") {
      audit.push(structuredClone(input.Item));
      return {};
    }
    if (kind === "Query") {
      const v = input.ExpressionAttributeValues;
      let rows = (input.IndexName === "OrderTimeline" ? [...orders.values()] : audit).filter((r) => r.gsi1pk === v[":pk"]);
      if (v[":start"] !== undefined) rows = rows.filter((r) => r.gsi1sk >= v[":start"] && r.gsi1sk <= v[":end"]);
      rows.sort((a, b) => (a.gsi1sk < b.gsi1sk ? -1 : 1));
      if (input.ScanIndexForward === false) rows.reverse();
      if (input.ExclusiveStartKey) rows = rows.slice(rows.findIndex((r) => r.gsi1sk === input.ExclusiveStartKey.gsi1sk) + 1);
      const limit = Math.min(input.Limit ?? Infinity, pageSize);
      const page = rows.slice(0, limit);
      const last = rows.length > limit ? page[page.length - 1] : null;
      return { Items: page.map((r) => project(r, input.ProjectionExpression)), LastEvaluatedKey: last ? { id: last.id, gsi1pk: last.gsi1pk, gsi1sk: last.gsi1sk } : undefined };
    }
    if (kind === "TransactWrite") {
      const [{ Update: u }, { Put: p }] = input.TransactItems;
      const row = orders.get(u.Key.id);
      if (!row) throw Object.assign(new Error("cancelled"), { CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }] });
      for (const [name, field] of Object.entries(u.ExpressionAttributeNames)) {
        const value = u.ExpressionAttributeValues[{ "#status": ":status", "#note": ":note", "#updatedAt": ":at", "#updatedBy": ":by" }[name]];
        row[field] = value;
      }
      audit.push(structuredClone(p.Item));
      return {};
    }
    throw new Error(`unexpected ${kind}`);
  }
  return { send, orders, audit, calls };
}

function fakeUsers() {
  const accounts = new Map([
    ["u-owner", { id: "u-owner", email: "owner@shop.test", enabled: true, status: "CONFIRMED", role: "owner" }],
    ["u-staff", { id: "u-staff", email: "staff@shop.test", enabled: true, status: "CONFIRMED", role: "staff" }],
    ["u-off", { id: "u-off", email: "off@shop.test", enabled: false, status: "CONFIRMED", role: "staff" }],
    ["u-none", { id: "u-none", email: "none@shop.test", enabled: true, status: "CONFIRMED", role: null }],
  ]);
  const log = [];
  return {
    accounts,
    log,
    lookups: 0,
    async lookup(u) {
      this.lookups += 1;
      return accounts.has(u) ? { ...accounts.get(u) } : null;
    },
    async list() {
      return [...accounts.values()].map((a) => ({ ...a, role: a.role ?? "none", createdAt: null }));
    },
    async invite(email, role) {
      log.push(["invite", email, role]);
      return { id: `u-${email}`, created: true };
    },
    async setRole(u, role) {
      log.push(["setRole", u, role]);
      accounts.get(u).role = role === "none" ? null : role;
    },
    async setEnabled(u, enabled) {
      log.push(["setEnabled", u, enabled]);
      accounts.get(u).enabled = enabled;
    },
    async remove(u) {
      log.push(["remove", u]);
      accounts.delete(u);
    },
    async resend(u) {
      log.push(["resend", u]);
      return true;
    },
  };
}

const event = (body, { user = "u-owner", origin = ORIGIN, tokenUse = "id" } = {}) => ({
  headers: { Origin: origin, "Content-Type": "application/json" },
  requestContext: { http: { method: "POST" }, requestId: "test-request", authorizer: { jwt: { claims: { "cognito:username": user, token_use: tokenUse } } } },
  body: JSON.stringify(body),
  isBase64Encoded: false,
});
const json = (r) => JSON.parse(r.body);

function setup(seed = [], opts = {}) {
  const db = fakeDb(seed, opts);
  const users = fakeUsers();
  let clock = Date.parse("2026-10-11T15:00:00Z");
  const handler = createAdminHandler({ origins: [ORIGIN], db, users, ordersTable: "orders", auditTable: "audit", now: () => clock, ...opts });
  return { db, users, handler, tick: (ms) => (clock += ms) };
}

/* Three orders on 9 October New York time (one sent at 9 pm, which is already 10 October in UTC), one on 10 October. */
const SEED = [
  order(1, "2026-10-09T13:15:00.000Z"),
  order(2, "2026-10-09T18:40:00.000Z", { status: "cancelled", state: "CA" }),
  order(3, "2026-10-10T01:05:00.000Z", { lines: [["test-sleeve", "Testbrand Sleeve", 1, 25.5], ["test-knee-brace", "Testbrand Knee Brace", 1, 100]] }),
  order(4, "2026-10-10T16:00:00.000Z", { status: "shipped", state: "CA", lines: [["test-sleeve", "Testbrand Sleeve", 3, 25.5]] }),
];

test("days: business-zone calendar days, across daylight saving", () => {
  assert.ok(validTimeZone(TZ));
  assert.ok(!validTimeZone("Not/AZone"));
  assert.ok(validDay("2026-10-09"));
  assert.ok(!validDay("2026-02-30"));
  assert.ok(!validDay("2026-1-9"));
  assert.deepEqual(localParts("2026-10-10T01:05:00.000Z", TZ), { day: "2026-10-09", hour: 21, weekday: 5 });
  assert.equal(new Date(startOfDay("2026-03-08", TZ)).toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(new Date(startOfDay("2026-03-09", TZ)).toISOString(), "2026-03-09T04:00:00.000Z");
  assert.deepEqual(dayBounds("2026-10-09", "2026-10-09", TZ), { start: "2026-10-09T04:00:00.000Z", end: "2026-10-10T04:00:00.000Z" });
});

test("aggregate: days, hours, statuses and products; cancelled orders count but add no value", () => {
  const s = aggregate(SEED, { from: "2026-10-09", to: "2026-10-10", timeZone: TZ });
  assert.deepEqual(s.byDay["2026-10-09"], { orders: 3, units: 4, value: 325.5 });
  assert.deepEqual(s.byDay["2026-10-10"], { orders: 1, units: 3, value: 76.5 });
  assert.deepEqual(s.totals, { orders: 4, units: 7, value: 402, cancelled: 1, averageValue: 134 });
  assert.deepEqual(s.byStatus, { new: 2, cancelled: 1, shipped: 1 });
  assert.deepEqual(s.byState, { IL: 2, CA: 2 });
  assert.equal(s.byHour[21], 1);
  assert.equal(s.byHour.reduce((a, b) => a + b), 4);
  assert.deepEqual(s.products.map((p) => [p.slug, p.units, p.value, p.orders]), [
    ["test-sleeve", 4, 102, 2],
    ["test-knee-brace", 3, 300, 2],
  ]);
  assert.equal(aggregate(SEED, { from: "2026-10-10", to: "2026-10-10", timeZone: TZ }).totals.orders, 1);
});

test("orderView: reads defensively and keeps only dashboard fields", () => {
  const v = orderView({ id: id(9), status: "bogus", items: "nope", customer: null, requestHash: "secret-ish", gsi1pk: "ORDER" });
  assert.equal(v.status, "new");
  assert.deepEqual(v.items, []);
  assert.equal(v.customer.name, "");
  assert.ok(!("requestHash" in v) && !("gsi1pk" in v));
});

test("handler: origin, sign-in claims and unknown actions are checked first", async () => {
  const { handler, db } = setup(SEED);
  assert.equal((await handler(event({ action: "orders.list" }, { origin: "https://evil.test" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { tokenUse: "access" }))).statusCode, 401);
  const noClaims = event({ action: "orders.list" });
  delete noClaims.requestContext.authorizer;
  assert.equal((await handler(noClaims)).statusCode, 401);
  assert.equal((await handler(event({ action: "orders.delete" }))).statusCode, 400);
  assert.equal((await handler({ ...event({}), body: "{not json" })).statusCode, 400);
  assert.equal(db.calls.length, 0, "nothing was read before the checks passed");
});

test("handler: roles decide each action, refusals are logged, disabled and role-less accounts are refused", async () => {
  const { handler, db } = setup(SEED);
  const staffList = await handler(event({ action: "admins.list" }, { user: "u-staff" }));
  assert.equal(staffList.statusCode, 403);
  assert.equal((await handler(event({ action: "audit.list" }, { user: "u-staff" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-staff" }))).statusCode, 200);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-off" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-none" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-gone" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "admins.list" }))).statusCode, 200);
  const denied = db.audit.filter((a) => a.action === "access.denied");
  assert.deepEqual(denied.map((a) => [a.actorEmail, a.detail]), [
    ["staff@shop.test", "admins.list"],
    ["staff@shop.test", "audit.list"],
    ["off@shop.test", "orders.list"],
    ["none@shop.test", "orders.list"],
    ["", "orders.list"],
  ]);
});

test("orders.list: business-day range, newest first, pages, and an access-log entry without customer details", async () => {
  const { handler, db } = setup(SEED);
  const first = json(await handler(event({ action: "orders.list", from: "2026-10-09", to: "2026-10-09" })));
  assert.deepEqual(first.orders.map((o) => o.reference), ["MB-00000003", "MB-00000002"]);
  assert.ok(first.nextCursor);
  const second = json(await handler(event({ action: "orders.list", from: "2026-10-09", to: "2026-10-09", cursor: first.nextCursor })));
  assert.deepEqual(second.orders.map((o) => o.reference), ["MB-00000001"]);
  assert.equal(second.nextCursor, null);
  assert.equal(first.orders[0].customer.email, "person3@example.test");

  const entries = db.audit.filter((a) => a.action === "orders.list");
  assert.deepEqual(entries.map((a) => a.count), [2, 1]);
  assert.doesNotMatch(JSON.stringify(db.audit), /Test Person|example\.test|Test Street/);
});

test("orders.list: rejects bad ranges, zones and forged cursors", async () => {
  const { handler } = setup(SEED);
  assert.equal((await handler(event({ action: "orders.list", from: "2026-10-10", to: "2026-10-09" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.list", from: "yesterday" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.list", timeZone: "Mars/Base" }))).statusCode, 400);
  const forged = Buffer.from(JSON.stringify({ id: id(1), gsi1pk: "AUDIT", gsi1sk: "x" })).toString("base64url");
  assert.equal((await handler(event({ action: "orders.list", cursor: forged }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.list", cursor: "%%%" }))).statusCode, 400);
});

test("orders.get and orders.update: logged, validated, and the change and its log entry are one write", async () => {
  const { handler, db } = setup(SEED);
  assert.equal((await handler(event({ action: "orders.get", id: "../etc" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.get", id: id(99) }))).statusCode, 404);
  const got = json(await handler(event({ action: "orders.get", id: id(1) }, { user: "u-staff" })));
  assert.equal(got.order.reference, "MB-00000001");
  assert.equal(db.audit.at(-1).action, "orders.read");
  assert.equal(db.audit.at(-1).orderId, id(1));

  assert.equal((await handler(event({ action: "orders.update", id: id(1), status: "lost" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.update", id: id(1), note: "bad\u0007note" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.update", id: id(1) }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.update", id: id(99), status: "contacted" }))).statusCode, 404);

  const r = json(await handler(event({ action: "orders.update", id: id(1), status: "confirmed", note: "Sizes checked by phone." }, { user: "u-staff" })));
  assert.equal(r.ok, true);
  assert.equal(r.updatedBy, "staff@shop.test");
  assert.equal(db.orders.get(id(1)).status, "confirmed");
  assert.equal(db.orders.get(id(1)).note, "Sizes checked by phone.");
  const entry = db.audit.at(-1);
  assert.deepEqual([entry.action, entry.orderId, entry.fields, entry.detail], ["orders.update", id(1), ["status", "note"], "confirmed"]);
  assert.ok(!JSON.stringify(entry).includes("Sizes checked"), "the note itself stays out of the log");
});

test("orders.stats: reads no names or addresses, caps the range, flags a cut-off, logs the read", async () => {
  const { handler, db } = setup(SEED);
  const s = json(await handler(event({ action: "orders.stats", from: "2026-10-09", to: "2026-10-10", timeZone: TZ })));
  assert.equal(s.totals.orders, 4);
  assert.equal(s.truncated, false);
  const queries = db.calls.filter(([k]) => k === "Query").map(([, i]) => i);
  assert.ok(queries.length >= 2, "followed the pages");
  for (const q of queries) assert.doesNotMatch(q.ProjectionExpression, /name|email|phone|line1|zip/);
  assert.equal(db.audit.at(-1).action, "orders.stats");
  assert.equal(db.audit.at(-1).count, 4);

  assert.equal((await handler(event({ action: "orders.stats", from: "2025-01-01", to: "2026-10-10" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.stats", from: "2026-10-09" }))).statusCode, 400);

  const capped = setup(SEED, { statsLimit: 2 });
  assert.equal(json(await capped.handler(event({ action: "orders.stats", from: "2026-10-01", to: "2026-10-31" }))).truncated, true);
});

test("orders.export: only logs the count; refuses junk", async () => {
  const { handler, db } = setup(SEED);
  assert.equal(json(await handler(event({ action: "orders.export", ids: [id(1), id(3)] }))).ok, true);
  assert.equal(db.audit.at(-1).action, "orders.export");
  assert.equal(db.audit.at(-1).count, 2);
  assert.equal((await handler(event({ action: "orders.export", ids: ["x"] }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.export", ids: [] }))).statusCode, 400);
});

test("audit.list: newest first with paging", async () => {
  const { handler, tick } = setup(SEED);
  for (let i = 0; i < 3; i += 1) {
    await handler(event({ action: "orders.get", id: id(1) }));
    tick(1000);
  }
  const page = json(await handler(event({ action: "audit.list" })));
  assert.equal(page.entries.length, 2);
  assert.ok(page.entries[0].at > page.entries[1].at);
  assert.ok(page.nextCursor);
});

test("admins: shared mailboxes refused, nobody changes their own access, and a change applies at once", async () => {
  const { handler, users } = setup(SEED);
  assert.equal((await handler(event({ action: "admins.invite", email: "orders@shop.test", role: "staff" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "admins.invite", email: "new.person@shop.test", role: "boss" }))).statusCode, 400);
  assert.equal(json(await handler(event({ action: "admins.invite", email: " New.Person@Shop.test ", role: "staff" }))).created, true);
  assert.deepEqual(users.log.at(-1), ["invite", "new.person@shop.test", "staff"]);

  assert.equal((await handler(event({ action: "admins.setRole", id: "u-owner", role: "staff" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "admins.delete", id: "u-owner" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "admins.setEnabled", id: "u-owner", enabled: false }))).statusCode, 400);

  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-staff" }))).statusCode, 200);
  assert.equal((await handler(event({ action: "admins.setRole", id: "u-staff", role: "none" }))).statusCode, 200);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-staff" }))).statusCode, 403, "the cached role was dropped");
  assert.equal((await handler(event({ action: "admins.setEnabled", id: "u-off", enabled: true }))).statusCode, 200);
  assert.equal((await handler(event({ action: "admins.delete", id: "u-none" }))).statusCode, 200);
  assert.equal((await handler(event({ action: "admins.delete", id: "u-none" }))).statusCode, 404);
});

test("handler: a storage failure is a plain 503 that logs no request data", async () => {
  const db = { send: async () => { throw new Error("Test Person person1@example.test"); } };
  const handler = createAdminHandler({ origins: [ORIGIN], db, users: fakeUsers(), ordersTable: "o", auditTable: "a" });
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const r = await handler(event({ action: "orders.get", id: id(1) }));
    assert.equal(r.statusCode, 503);
    assert.doesNotMatch(r.body, /Test Person|example\.test/);
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(JSON.stringify(logged), /Test Person|example\.test/);
});

test("users: role from groups, invitations, role moves end sessions, resend only before first sign-in", async () => {
  const calls = [];
  const groups = { "u-1": ["staff"] };
  const send = async (kind, input) => {
    calls.push([kind, input]);
    if (kind === "AdminGetUser") {
      if (input.Username === "u-missing") throw Object.assign(new Error("gone"), { name: "UserNotFoundException" });
      return { Enabled: true, UserStatus: input.Username === "u-new" ? "FORCE_CHANGE_PASSWORD" : "CONFIRMED", UserAttributes: [{ Name: "email", Value: `${input.Username}@shop.test` }] };
    }
    if (kind === "AdminListGroupsForUser") return { Groups: (groups[input.Username] || []).map((GroupName) => ({ GroupName })) };
    if (kind === "ListUsers") return input.Filter?.includes("existing") ? { Users: [{ Username: "u-existing" }] } : { Users: [] };
    if (kind === "AdminCreateUser") return { User: { Username: "u-created" } };
    return {};
  };
  const users = createUsers({ send, userPoolId: "pool" });
  assert.deepEqual(await users.lookup("u-1"), { id: "u-1", email: "u-1@shop.test", enabled: true, status: "CONFIRMED", role: "staff" });
  assert.equal(await users.lookup("u-missing"), null);

  assert.deepEqual(await users.invite("someone@shop.test", "staff"), { id: "u-created", created: true });
  assert.deepEqual(await users.invite("existing@shop.test", "owner"), { id: "u-existing", created: false });
  assert.equal(calls.filter(([k]) => k === "AdminCreateUser").length, 1);

  calls.length = 0;
  await users.setRole("u-1", "owner");
  assert.deepEqual(calls.map(([k, i]) => [k, i.GroupName]).filter(([k]) => k !== "AdminListGroupsForUser"), [
    ["AdminRemoveUserFromGroup", "staff"],
    ["AdminAddUserToGroup", "owner"],
    ["AdminUserGlobalSignOut", undefined],
  ]);

  assert.equal(await users.resend("u-1"), false);
  assert.equal(await users.resend("u-new"), true);
  assert.equal(calls.at(-1)[1].MessageAction, "RESEND");
});

test("stack: dashboard route needs a sign-in, accounts are invite-only, the access log is kept", () => {
  const template = readFileSync(new URL("./medville-brace-orders.yaml", import.meta.url), "utf8");
  assert.match(template, /RouteKey: POST \/admin\n\s*AuthorizationType: JWT/);
  assert.match(template, /AllowAdminCreateUserOnly: true/);
  assert.match(template, /TableName: medville-brace-audit\n[\s\S]*?DeletionProtectionEnabled: true\n\s*PointInTimeRecoverySpecification:\n\s*PointInTimeRecoveryEnabled: true/);
  const adminRole = template.slice(template.indexOf("\n  AdminRole:"), template.indexOf("\n  OrdersLogGroup:"));
  assert.match(adminRole, /Resource: !GetAtt AdminUserPool.Arn/);
  assert.doesNotMatch(adminRole, /cognito-idp:\*|dynamodb:\*|Resource: "\*"/);

  for (const file of ["admin.mjs", "admin-index.mjs", "users.mjs", "days.mjs"]) {
    const src = readFileSync(new URL(`./src/${file}`, import.meta.url), "utf8");
    for (const [, args] of src.matchAll(/console\.\w+\(([^)]*)\)/g)) assert.doesNotMatch(args.replace(/"[^"]*"/g, ""), /body|order|customer|email|name|address|\bip\b|note/i, file);
  }
});
