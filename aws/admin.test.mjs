/*
  Tests for the dashboard API and the staff-account code. Invented orders and
  invented people only: no real customer data, no network, no AWS or Google
  services.

    npm run test:orders
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAdminHandler, orderView } from "./src/admin.mjs";
import { accountView, createIdentity, identityCall } from "./src/identity.mjs";
import { dayBounds, localParts, startOfDay, validDay, validTimeZone } from "./src/days.mjs";

const ORIGIN = "https://shop.test";
const TZ = "America/New_York";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/* When the invented people last signed in, in seconds (Firebase auth_time). */
const SIGNED_IN = 1760000000;

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
      return { Items: page.map((r) => structuredClone(r)), LastEvaluatedKey: last ? { id: last.id, gsi1pk: last.gsi1pk, gsi1sk: last.gsi1sk } : undefined };
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

/* The account store the handler sees (identity.mjs's shape), with sessions that can be ended and invitations not yet accepted. */
function fakeUsers() {
  const person = (id, email, over = {}) => [id, { id, email, enabled: true, role: "staff", invited: false, validSince: 0, createdAt: null, ...over }];
  const accounts = new Map([
    person("u-owner", "owner@shop.test", { role: "owner" }),
    person("u-staff", "staff@shop.test"),
    person("u-off", "off@shop.test", { enabled: false }),
    person("u-none", "none@shop.test", { role: null }),
    person("u-new", "new@shop.test", { invited: true }),
  ]);
  const log = [];
  return {
    accounts,
    log,
    async lookup(u) {
      return accounts.has(u) ? { ...accounts.get(u) } : null;
    },
    async list() {
      return [...accounts.values()].map(({ validSince, ...a }) => ({ ...a, role: a.role ?? "none" }));
    },
    async invite(email, role) {
      log.push(["invite", email, role]);
      const existing = [...accounts.values()].find((a) => a.email === email);
      if (existing) {
        existing.role = role;
        return { id: existing.id, created: false };
      }
      const [key, account] = person(`u-${email}`, email, { role, invited: true });
      accounts.set(key, account);
      return { id: key, created: true };
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
  };
}

/* An API Gateway event whose JWT authorizer has already accepted a Firebase ID token. */
const event = (body, { user = "u-owner", origin = ORIGIN, authTime = SIGNED_IN, email } = {}) => ({
  headers: { Origin: origin, "Content-Type": "application/json" },
  requestContext: {
    http: { method: "POST" },
    requestId: "test-request",
    authorizer: { jwt: { claims: { sub: user, auth_time: String(authTime), ...(email ? { email } : {}) } } },
  },
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
  const noTime = event({ action: "orders.list" });
  delete noTime.requestContext.authorizer.jwt.claims.auth_time;
  assert.equal((await handler(noTime)).statusCode, 401);
  const noSubject = event({ action: "orders.list" });
  delete noSubject.requestContext.authorizer.jwt.claims.sub;
  assert.equal((await handler(noSubject)).statusCode, 401);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "bad id/../" }))).statusCode, 401);
  const noClaims = event({ action: "orders.list" });
  delete noClaims.requestContext.authorizer;
  assert.equal((await handler(noClaims)).statusCode, 401);
  assert.equal((await handler(event({ action: "orders.delete" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "orders.stats" }))).statusCode, 400, "figures are not served here any more");
  assert.equal((await handler({ ...event({}), body: "{not json" })).statusCode, 400);
  assert.equal(db.calls.length, 0, "nothing was read before the checks passed");
});

test("handler: a token from before the account's sessions were ended is refused", async () => {
  const { handler, users, db } = setup(SEED);
  users.accounts.get("u-staff").validSince = SIGNED_IN + 100;
  const old = await handler(event({ action: "orders.list" }, { user: "u-staff", authTime: SIGNED_IN }));
  assert.equal(old.statusCode, 401);
  assert.match(json(old).error, /sign in again/i);
  assert.equal(db.calls.length, 0, "no order was read");
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-staff", authTime: SIGNED_IN + 100 }))).statusCode, 200, "signing in again works");
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-owner", authTime: SIGNED_IN }))).statusCode, 200, "others are not affected");
});

test("handler: roles decide each action, refusals are logged, disabled and role-less accounts are refused", async () => {
  const { handler, db } = setup(SEED);
  const staffList = await handler(event({ action: "admins.list" }, { user: "u-staff" }));
  assert.equal(staffList.statusCode, 403);
  assert.equal((await handler(event({ action: "audit.list" }, { user: "u-staff" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-staff" }))).statusCode, 200);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-off" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-none" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "orders.list" }, { user: "u-gone", email: "gone@shop.test" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "admins.list" }))).statusCode, 200);
  const denied = db.audit.filter((a) => a.action === "access.denied");
  assert.deepEqual(denied.map((a) => [a.actorEmail, a.detail]), [
    ["staff@shop.test", "admins.list"],
    ["staff@shop.test", "audit.list"],
    ["off@shop.test", "orders.list"],
    ["none@shop.test", "orders.list"],
    ["gone@shop.test", "orders.list"],
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

test("site.publish: refused when no deploy hook is set up", async () => {
  const { handler, db } = setup(SEED);
  const r = await handler(event({ action: "site.publish" }, { user: "u-staff" }));
  assert.equal(r.statusCode, 400);
  assert.match(json(r).error, /not set up/i);
  assert.ok(!db.audit.some((a) => a.action === "site.publish"));
});

test("site.publish: staff can publish, it is logged, and a second click inside a minute does nothing", async () => {
  let runs = 0;
  const { handler, db, tick } = setup(SEED, { publish: async () => { runs += 1; } });
  const first = await handler(event({ action: "site.publish" }, { user: "u-staff" }));
  assert.equal(first.statusCode, 200);
  assert.deepEqual(json(first), { ok: true });
  assert.equal(runs, 1);
  const entry = db.audit.filter((a) => a.action === "site.publish");
  assert.deepEqual(entry.map((a) => [a.actorEmail, a.actorRole]), [["staff@shop.test", "staff"]]);

  tick(30000);
  assert.deepEqual(json(await handler(event({ action: "site.publish" }))), { ok: true, already: true });
  assert.equal(runs, 1, "the hook was not called twice");
  assert.equal(db.audit.filter((a) => a.action === "site.publish").length, 1);

  tick(31000);
  assert.deepEqual(json(await handler(event({ action: "site.publish" }))), { ok: true });
  assert.equal(runs, 2, "after the gap it runs again");
});

test("site.publish: two quick clicks start one rebuild, and a failed hook can be tried again at once", async () => {
  let runs = 0;
  let fail = true;
  const { handler } = setup(SEED, {
    publish: async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (fail) throw new Error("hook down");
    },
  });
  const failed = await handler(event({ action: "site.publish" }));
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(failed.body, /hook down/);
  fail = false;
  const [a, b] = await Promise.all([handler(event({ action: "site.publish" })), handler(event({ action: "site.publish" }))]);
  assert.equal(runs, 2, "one failed run, then one real run for both clicks");
  assert.deepEqual([json(a), json(b)].filter((r) => r.already).length, 1);
});

test("site.publish: staff can, but an unknown role cannot", async () => {
  const { handler } = setup(SEED, { publish: async () => {} });
  assert.equal((await handler(event({ action: "site.publish" }, { user: "u-none" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "site.publish" }, { user: "u-off" }))).statusCode, 403);
  assert.equal((await handler(event({ action: "site.publish" }, { user: "u-staff" }))).statusCode, 200);
});

test("admins: shared mailboxes refused, nobody changes their own access, and a change applies at once", async () => {
  const { handler, users } = setup(SEED);
  assert.equal((await handler(event({ action: "admins.invite", email: "orders@shop.test", role: "staff" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "admins.invite", email: "new.person@shop.test", role: "boss" }))).statusCode, 400);
  const invited = await handler(event({ action: "admins.invite", email: " New.Person@Shop.test ", role: "staff" }));
  assert.deepEqual(json(invited), { ok: true, created: true, email: "new.person@shop.test" });
  assert.deepEqual(users.log.at(-1), ["invite", "new.person@shop.test", "staff"]);
  assert.equal(json(await handler(event({ action: "admins.invite", email: "none@shop.test", role: "staff" }))).created, false, "an existing account is found, not created again");

  const before = users.log.length;
  assert.equal((await handler(event({ action: "admins.invite", email: "Owner@shop.test", role: "staff" }))).statusCode, 400, "an owner cannot demote themselves by inviting themselves");
  assert.equal(users.log.length, before);
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

test("admins.list: returns the people with role none for those without a role", async () => {
  const { handler } = setup(SEED);
  const list = json(await handler(event({ action: "admins.list" }))).admins;
  assert.equal(list.length, 5);
  assert.equal(list.find((a) => a.id === "u-none").role, "none");
  assert.equal(list.find((a) => a.id === "u-new").invited, true);
  assert.ok(list.every((a) => !("validSince" in a)));
});

test("admins.resend: returns the email for people who have not signed in yet, and refuses the rest", async () => {
  const { handler, db } = setup(SEED);
  const ok = await handler(event({ action: "admins.resend", id: "u-new" }));
  assert.deepEqual(json(ok), { ok: true, email: "new@shop.test" });
  assert.deepEqual(db.audit.at(-1).action, "admins.resend");
  const done = await handler(event({ action: "admins.resend", id: "u-staff" }));
  assert.equal(done.statusCode, 400);
  assert.match(json(done).error, /Forgot password/);
  assert.equal((await handler(event({ action: "admins.resend", id: "u-gone" }))).statusCode, 404);
  assert.equal((await handler(event({ action: "admins.resend", id: "../x" }))).statusCode, 400);
  assert.equal((await handler(event({ action: "admins.resend", id: "u-new" }, { user: "u-staff" }))).statusCode, 403, "staff cannot");
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

/* A stand-in for the Identity Toolkit REST API: raw accounts as Google returns them, paged two at a time. */
function fakeToolkit(seed = []) {
  const users = seed.map((u) => structuredClone(u));
  const calls = [];
  const call = async (path, body, method = "POST") => {
    calls.push({ path, body: body && structuredClone(body), method });
    if (path === "/accounts:lookup") {
      const found = users.filter((u) => (body.localId ? body.localId.includes(u.localId) : body.email.includes(u.email)));
      return found.length ? { kind: "identitytoolkit#GetAccountInfoResponse", users: found } : { kind: "identitytoolkit#GetAccountInfoResponse" };
    }
    if (path.startsWith("/accounts:batchGet")) {
      assert.equal(method, "GET");
      const query = new URLSearchParams(path.split("?")[1]);
      const from = Number(query.get("nextPageToken") || 0);
      const page = users.slice(from, from + 2);
      return { users: page, ...(from + 2 < users.length ? { nextPageToken: String(from + 2) } : {}) };
    }
    if (path === "/accounts") {
      const user = { localId: `new-${users.length + 1}`, email: body.email, emailVerified: body.emailVerified, createdAt: "1760000000000" };
      users.push(user);
      return { localId: user.localId, email: user.email };
    }
    if (path === "/accounts:update") {
      const user = users.find((u) => u.localId === body.localId);
      Object.assign(user, body);
      delete user.disableUser;
      if (body.disableUser !== undefined) user.disabled = body.disableUser;
      return { localId: body.localId };
    }
    if (path === "/accounts:delete") {
      users.splice(users.findIndex((u) => u.localId === body.localId), 1);
      return {};
    }
    throw new Error(`unexpected ${path}`);
  };
  return { call, calls, users };
}

const RAW = [
  { localId: "g-3", email: "Zed@Shop.test", customAttributes: '{"role":"staff"}', lastLoginAt: "1760000500000", createdAt: "1750000000000", validSince: "1760000100" },
  { localId: "g-1", email: "amy@shop.test", customAttributes: '{"role":"owner"}', createdAt: "1750000000000" },
  { localId: "g-2", email: "bob@shop.test", disabled: true, lastLoginAt: "1" },
];

test("identity: lookup reads the live role, status and session cut-off", async () => {
  const kit = fakeToolkit(RAW);
  const identity = createIdentity({ call: kit.call });
  assert.deepEqual(await identity.lookup("g-3"), {
    id: "g-3",
    email: "zed@shop.test",
    enabled: true,
    role: "staff",
    invited: false,
    validSince: 1760000100,
    createdAt: "2025-06-15T15:06:40.000Z",
  });
  assert.deepEqual(kit.calls[0], { path: "/accounts:lookup", body: { localId: ["g-3"] }, method: "POST" });
  assert.equal((await identity.lookup("g-1")).invited, true, "never signed in");
  assert.equal((await identity.lookup("g-2")).enabled, false);
  assert.equal(await identity.lookup("g-missing"), null);
});

test("identity: only owner and staff are roles; anything else in the claims is no role", () => {
  for (const attrs of [undefined, "", "{}", "not json", '{"role":"admin"}', '{"role":["owner"]}', "null"]) {
    assert.equal(accountView({ localId: "x", email: "a@shop.test", customAttributes: attrs }).role, null, String(attrs));
  }
  assert.equal(accountView({ localId: "x", email: "a@shop.test", customAttributes: '{"role":"owner","other":1}' }).role, "owner");
});

test("identity: list follows every page, shows role none, sorts by email and hides the session cut-off", async () => {
  const kit = fakeToolkit(RAW);
  const list = await createIdentity({ call: kit.call }).list();
  assert.equal(kit.calls.length, 2, "two pages");
  assert.deepEqual(kit.calls.map((c) => c.method), ["GET", "GET"]);
  assert.match(kit.calls[1].path, /nextPageToken=2$/);
  assert.deepEqual(list.map((a) => [a.email, a.role, a.enabled, a.invited]), [
    ["amy@shop.test", "owner", true, true],
    ["bob@shop.test", "none", false, false],
    ["zed@shop.test", "staff", true, false],
  ]);
  assert.ok(list.every((a) => !("validSince" in a)));
});

test("identity: invite creates a password-less account, or finds the existing one, and sets the role", async () => {
  const kit = fakeToolkit(RAW);
  const identity = createIdentity({ call: kit.call, now: () => 1760001234567 });
  assert.deepEqual(await identity.invite("new@shop.test", "staff"), { id: "new-4", created: true });
  const [lookup, create, update] = kit.calls;
  assert.deepEqual(lookup, { path: "/accounts:lookup", body: { email: ["new@shop.test"] }, method: "POST" });
  assert.deepEqual(create.body, { email: "new@shop.test", emailVerified: true });
  assert.ok(!("password" in create.body), "no credential is ever created");
  assert.deepEqual(update.body, { localId: "new-4", customAttributes: '{"role":"staff"}', validSince: "1760001234" });

  kit.calls.length = 0;
  assert.deepEqual(await identity.invite("bob@shop.test", "owner"), { id: "g-2", created: false });
  assert.deepEqual(kit.calls.map((c) => c.path), ["/accounts:lookup", "/accounts:update"], "nothing was created");
  assert.equal(kit.users.find((u) => u.localId === "g-2").customAttributes, '{"role":"owner"}');
});

test("identity: setRole sets the claim and ends the person's sessions", async () => {
  const kit = fakeToolkit(RAW);
  const identity = createIdentity({ call: kit.call, now: () => 1760009999000 });
  await identity.setRole("g-3", "owner");
  assert.deepEqual(kit.calls.at(-1).body, { localId: "g-3", customAttributes: '{"role":"owner"}', validSince: "1760009999" });
  await identity.setRole("g-3", "none");
  assert.equal(kit.calls.at(-1).body.customAttributes, "{}");
  await identity.setRole("g-3", "superuser");
  assert.equal(kit.calls.at(-1).body.customAttributes, "{}", "an unknown role grants nothing");
  assert.equal((await identity.lookup("g-3")).role, null);
});

test("identity: switching an account off ends its sessions; switching it on does not", async () => {
  const kit = fakeToolkit(RAW);
  const identity = createIdentity({ call: kit.call, now: () => 1760009999000 });
  await identity.setEnabled("g-1", false);
  assert.deepEqual(kit.calls.at(-1).body, { localId: "g-1", disableUser: true, validSince: "1760009999" });
  assert.equal((await identity.lookup("g-1")).enabled, false);
  await identity.setEnabled("g-1", true);
  assert.deepEqual(kit.calls.at(-1).body, { localId: "g-1", disableUser: false });
  assert.equal((await identity.lookup("g-1")).enabled, true);
});

test("identity: remove deletes the account", async () => {
  const kit = fakeToolkit(RAW);
  const identity = createIdentity({ call: kit.call });
  await identity.remove("g-2");
  assert.deepEqual(kit.calls.at(-1), { path: "/accounts:delete", body: { localId: "g-2" }, method: "POST" });
  assert.equal(await identity.lookup("g-2"), null);
});

test("identityCall: signed requests to the project, and errors that carry only a status", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return url.endsWith("/accounts:delete")
      ? { ok: false, status: 403, json: async () => ({ error: { message: "secret detail about someone@example.test" } }) }
      : { ok: true, status: 200, json: async () => ({ users: [] }) };
  };
  const call = identityCall({ projectId: "demo-project", token: async () => "tok", fetchImpl });
  await call("/accounts:lookup", { localId: ["a"] });
  await call("/accounts:batchGet?maxResults=500", null, "GET");
  assert.equal(seen[0].url, "https://identitytoolkit.googleapis.com/v1/projects/demo-project/accounts:lookup");
  assert.equal(seen[0].init.headers.Authorization, "Bearer tok");
  assert.equal(seen[0].init.headers["Content-Type"], "application/json");
  assert.equal(seen[0].init.body, '{"localId":["a"]}');
  assert.equal(seen[1].init.method, "GET");
  assert.equal(seen[1].init.body, undefined);
  await assert.rejects(call("/accounts:delete", { localId: "a" }), (error) => error.message === "identity 403");
});

test("stack: dashboard route needs a Firebase sign-in, there is no Cognito, the access log is kept", () => {
  const template = readFileSync(new URL("./medville-brace-orders.yaml", import.meta.url), "utf8");
  assert.match(template, /RouteKey: POST \/admin\n\s*AuthorizationType: JWT\n\s*AuthorizerId: !Ref AdminAuthorizer/);
  assert.match(template, /AuthorizerType: JWT/);
  assert.match(template, /Issuer: !Sub https:\/\/securetoken\.google\.com\/\$\{FirebaseProjectId\}/);
  assert.match(template, /Audience: \[!Ref FirebaseProjectId\]/);
  assert.doesNotMatch(template, /cognito/i, "Cognito is gone");
  assert.match(template, /TableName: medville-brace-audit\n[\s\S]*?DeletionProtectionEnabled: true\n\s*PointInTimeRecoverySpecification:\n\s*PointInTimeRecoveryEnabled: true/);

  /* Everything that needs Firebase exists only when it is configured, and nothing unconditional points at it. */
  for (const name of ["AdminRole", "FiguresRole", "AdminFunction", "FiguresFunction", "FiguresStream", "AdminAuthorizer", "AdminRoute", "AdminIntegration", "AdminPermission"]) {
    assert.match(template, new RegExp(`\\n  ${name}:\\n    Type: [\\w:]+\\n    Condition: HasDashboard`), name);
  }

  const adminRole = template.slice(template.indexOf("\n  AdminRole:"), template.indexOf("\n  FiguresRole:"));
  const figuresRole = template.slice(template.indexOf("\n  FiguresRole:"), template.indexOf("\n  OrdersLogGroup:"));
  for (const [name, role] of [["admin", adminRole], ["figures", figuresRole]]) {
    assert.match(role, /Action: \[secretsmanager:GetSecretValue\]\n\s*Resource: !Ref GoogleKeySecretArn/, `${name} role reads only the Google key`);
    assert.equal(role.match(/secretsmanager:/g)?.length, 1, name);
    /* The one exception: ListStreams cannot be limited to a resource. */
    const open = role.replace(/Action: \[dynamodb:ListStreams\]\n\s*Resource: "\*"/, "");
    assert.doesNotMatch(open, /Resource: "\*"|Action:.*\*|dynamodb:\*/, `${name} role has no wildcards`);
    assert.doesNotMatch(role, /dynamodb:(Scan|DeleteItem|BatchWriteItem)/, name);
  }
  assert.match(adminRole, /dynamodb:PutItem/);
  assert.doesNotMatch(figuresRole, /dynamodb:(PutItem|UpdateItem)/, "the figures role can only read orders");
  assert.match(figuresRole, /Action: \[dynamodb:DescribeStream, dynamodb:GetRecords, dynamodb:GetShardIterator\]\n\s*Resource: !GetAtt OrdersTable\.StreamArn/);
  assert.match(figuresRole, /Action: \[dynamodb:ListStreams\]\n\s*Resource: "\*"/, "ListStreams has its own statement");
  assert.equal(adminRole.includes("ListStreams"), false);
  assert.equal(template.match(/secretsmanager:GetSecretValue/g)?.length, 2, "no other role can read the Google key");
  assert.match(template, /GOOGLE_KEY_SECRET: !Ref GoogleKeySecretArn/);
  assert.match(template, /DEPLOY_HOOK_URL: !Ref DeployHookUrl/);
  assert.match(template, /DeployHookUrl:\n\s*Type: String\n\s*Default: ""\n\s*NoEcho: true/);

  for (const file of ["admin.mjs", "admin-index.mjs", "identity.mjs", "days.mjs", "figures.mjs", "figures-index.mjs", "firestore.mjs", "google-key.mjs", "content.mjs"]) {
    const src = readFileSync(new URL(`./src/${file}`, import.meta.url), "utf8");
    for (const [, args] of src.matchAll(/console\.\w+\(([^)]*)\)/g)) assert.doesNotMatch(args.replace(/"[^"]*"/g, ""), /body|order|customer|email|name|address|\bip\b|note/i, file);
  }
});
