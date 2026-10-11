/*
  Tests for the daily figures, the Firestore client and the Google sign-in.
  Invented orders only: no real customer data, no network, no AWS or Google
  services.

    npm run test:orders
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { FIGURE_PROJECTION, FIGURE_READ, aggregate, createFigures, dayDocument } from "./src/figures.mjs";
import { createFirestore, createGoogleAuth, fromFields, fromValue, toFields, toValue } from "./src/firestore.mjs";
import { addDays, dayBounds } from "./src/days.mjs";

const TZ = "America/New_York";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function order(n, createdAt, { status = "new", state = "IL", lines = [["test-knee-brace", "Testbrand Knee Brace", 2, 100]] } = {}) {
  const items = lines.map(([slug, name, qty, unitPrice]) => ({ slug, name, sku: `${slug}-sku`, options: ["M"], optionNames: ["Size"], qty, unitPrice }));
  return {
    id: id(n),
    reference: `MB-${String(n).padStart(8, "0")}`,
    createdAt,
    status,
    customer: { name: `Test Person ${n}`, email: `person${n}@example.test`, phone: "555-010-0000", address: { line1: "1 Test Street", line2: "Apt 9", city: "Testville", state, zip: "62701" } },
    notes: "Secret note text",
    note: "Secret staff note",
    items,
    subtotal: items.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    currency: "USD",
    notificationStatus: "sent",
    requestHash: "x",
    gsi1pk: "ORDER",
    gsi1sk: `${createdAt}#${id(n)}`,
  };
}

/* Three orders on 9 October New York time (one sent at 9 pm, which is already 10 October in UTC), one on 10 October. */
const SEED = [
  order(1, "2026-10-09T13:15:00.000Z"),
  order(2, "2026-10-09T18:40:00.000Z", { status: "cancelled", state: "CA" }),
  order(3, "2026-10-10T01:05:00.000Z", { lines: [["test-sleeve", "Testbrand Sleeve", 1, 25.5], ["test-knee-brace", "Testbrand Knee Brace", 1, 100]] }),
  order(4, "2026-10-10T16:00:00.000Z", { status: "shipped", state: "CA", lines: [["test-sleeve", "Testbrand Sleeve", 3, 25.5]] }),
];

/* Anything here in a Firestore document would be a leak. */
const PII = /Test Person|example\.test|555-010|Test Street|Apt 9|Testville|62701|Secret|MB-0000|00000000-0000-4000|person\d/;

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

test("aggregate: junk rows are read defensively", () => {
  const s = aggregate(
    [{ createdAt: "nope" }, { createdAt: "2026-10-09T15:00:00Z", status: "bogus", items: "x", subtotal: "12", customer: { address: { state: "Illinois" } } }, {}],
    { from: "2026-10-09", to: "2026-10-09", timeZone: TZ },
  );
  assert.deepEqual(s.totals, { orders: 1, units: 0, value: 0, cancelled: 0, averageValue: 0 });
  assert.deepEqual(s.byStatus, { new: 1 });
  assert.deepEqual(s.byState, {}, "only a two-letter state is kept");
});

test("dayDocument: counts and sums only, never a name, email, address, note or order id", () => {
  const at = new Date("2026-10-11T15:00:00Z");
  const doc = dayDocument(SEED, "2026-10-09", TZ, at);
  assert.deepEqual(Object.keys(doc), ["day", "timeZone", "orders", "units", "value", "cancelled", "byStatus", "byState", "byHour", "products", "updatedAt"]);
  assert.deepEqual([doc.day, doc.timeZone, doc.orders, doc.units, doc.value, doc.cancelled], ["2026-10-09", TZ, 3, 4, 325.5, 1]);
  assert.equal(doc.byHour.length, 24);
  assert.equal(doc.updatedAt, at);
  for (const p of doc.products) assert.deepEqual(Object.keys(p).sort(), ["name", "orders", "slug", "units", "value"]);
  assert.doesNotMatch(JSON.stringify(toFields(doc)), PII);
  assert.doesNotMatch(JSON.stringify(doc), PII);

  const many = Array.from({ length: 90 }, (_, n) => order(100 + n, "2026-10-09T15:00:00Z", { lines: [[`test-product-${n}`, `Product ${n}`, 1, 10]] }));
  assert.equal(dayDocument(many, "2026-10-09", TZ, at).products.length, 60, "a day holds at most 60 products");
  assert.equal(dayDocument([], "2026-10-09", TZ, at).orders, 0);
});

/*
  A stand-in for the orders table that behaves like DynamoDB where it matters:
  it returns only the attributes a ProjectionExpression names, and refuses
  placeholders that are missing or unused.
*/
function fakeOrders(rows) {
  const calls = [];
  const table = new Map(rows.map((r) => [r.id, structuredClone(r)]));
  function project(row, expression, names = {}) {
    if (!expression) return structuredClone(row);
    const used = new Set(expression.match(/#\w+/g) || []);
    for (const key of Object.keys(names)) assert.ok(used.has(key), `unused placeholder ${key}`);
    const out = {};
    for (const path of expression.split(",").map((p) => p.trim())) {
      const parts = path.split(".").map((p) => (p.startsWith("#") ? assert.ok(names[p], `missing ${p}`) ?? names[p] : p));
      let from = row;
      let to = out;
      for (let i = 0; i < parts.length; i += 1) {
        if (from == null || !(parts[i] in from)) break;
        if (i === parts.length - 1) to[parts[i]] = structuredClone(from[parts[i]]);
        else to = to[parts[i]] ??= {};
        from = from[parts[i]];
      }
    }
    return out;
  }
  async function send(kind, input) {
    calls.push({ kind, input: structuredClone(input) });
    if (kind === "Get") {
      const row = table.get(input.Key.id);
      return { Item: row && project(row, input.ProjectionExpression, input.ExpressionAttributeNames) };
    }
    if (kind === "Query") {
      const v = input.ExpressionAttributeValues;
      assert.equal(input.IndexName, "OrderTimeline");
      const hits = [...table.values()].filter((r) => r.gsi1pk === v[":pk"] && r.gsi1sk >= v[":start"] && r.gsi1sk <= v[":end"]);
      return { Items: hits.map((r) => project(r, input.ProjectionExpression, input.ExpressionAttributeNames)) };
    }
    throw new Error(`unexpected ${kind}`);
  }
  return { send, calls };
}

const keyRecord = (orderId, eventName = "MODIFY") => ({ eventName, dynamodb: { Keys: { id: { S: orderId } } } });

function figuresWith(rows = SEED) {
  const db = fakeOrders(rows);
  const written = [];
  const figures = createFigures({
    db,
    write: async (docs) => written.push(...structuredClone(docs)),
    ordersTable: "orders",
    timeZone: TZ,
    now: () => Date.parse("2026-10-11T15:00:00Z"),
  });
  return { db, written, figures };
}

test("fromStream: keys only in, one recount per day, only counts out", async () => {
  const { db, written, figures } = figuresWith();
  const result = await figures.fromStream([
    keyRecord(id(1)),
    keyRecord(id(1)),
    keyRecord(id(3), "INSERT"),
    keyRecord(id(4)),
    { dynamodb: {} },
    { dynamodb: { Keys: { id: { S: "x".repeat(65) } } } },
    { dynamodb: { Keys: { id: { N: "5" } } } },
    null,
  ]);
  assert.deepEqual(result, { days: 2 });

  const gets = db.calls.filter((c) => c.kind === "Get");
  assert.deepEqual(gets.map((c) => c.input.Key.id), [id(1), id(3), id(4)], "each order is looked up once");
  for (const g of gets) {
    assert.equal(g.input.ConsistentRead, true, "a consistent read, so the change just made is seen");
    assert.equal(g.input.ProjectionExpression, FIGURE_READ.ProjectionExpression);
    assert.deepEqual(g.input.ExpressionAttributeNames, FIGURE_READ.ExpressionAttributeNames);
  }

  const queries = db.calls.filter((c) => c.kind === "Query");
  assert.equal(queries.length, 2, "orders 1 and 3 share a business day, so that day is recounted once");
  for (const q of queries) {
    assert.equal(q.input.ProjectionExpression, FIGURE_READ.ProjectionExpression);
    assert.deepEqual(q.input.ExpressionAttributeNames, FIGURE_READ.ExpressionAttributeNames);
  }
  assert.equal(FIGURE_READ.ProjectionExpression, `#id, ${FIGURE_PROJECTION.ProjectionExpression}`, "the figure fields plus the id, nothing else");
  assert.deepEqual(FIGURE_READ.ExpressionAttributeNames, { ...FIGURE_PROJECTION.ExpressionAttributeNames, "#id": "id" });
  assert.doesNotMatch(FIGURE_READ.ProjectionExpression + JSON.stringify(FIGURE_READ.ExpressionAttributeNames), /"name"|email|phone|line|zip|note/i);

  assert.deepEqual(written.map((d) => d.path), ["figures/2026-10-09", "figures/2026-10-10"]);
  assert.deepEqual(written.map((d) => d.data.orders), [3, 1]);
  assert.deepEqual(written[0].data.byState, { IL: 2, CA: 1 });
  assert.equal(written[0].data.updatedAt.toISOString(), "2026-10-11T15:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(written), PII, "the written documents hold no name, email, phone, street, ZIP, note or order id");
  assert.doesNotMatch(JSON.stringify(db.calls.filter((c) => c.kind === "Query")), /Secret|example\.test/);
});

/* The same table, but its index is behind: it leaves out some orders and shows others as they were. */
function laggingOrders(rows, { missing = [], stale = {} } = {}) {
  const db = fakeOrders(rows);
  const send = async (kind, input) => {
    const out = await db.send(kind, input);
    if (kind !== "Query") return out;
    return { ...out, Items: out.Items.filter((i) => !missing.includes(i.id)).map((i) => (stale[i.id] ? { ...i, ...stale[i.id] } : i)) };
  };
  return { ...db, send };
}

function figuresOver(db) {
  const written = [];
  const figures = createFigures({ db, write: async (docs) => written.push(...structuredClone(docs)), ordersTable: "orders", timeZone: TZ, now: () => Date.parse("2026-10-11T15:00:00Z") });
  return { written, figures };
}

test("fromStream: an order the index has not caught up with is still counted", async () => {
  const fresh = order(5, "2026-10-09T20:00:00.000Z", { state: "TX", lines: [["test-sleeve", "Testbrand Sleeve", 2, 25.5]] });
  const { written, figures } = figuresOver(laggingOrders([...SEED, fresh], { missing: [id(5)] }));
  assert.deepEqual(await figures.fromStream([keyRecord(id(5), "INSERT")]), { days: 1 });
  const day = written[0].data;
  assert.equal(written[0].path, "figures/2026-10-09");
  assert.deepEqual([day.orders, day.units, day.value], [4, 6, 376.5], "orders 1 to 3 from the index plus the new one");
  assert.equal(day.byState.TX, 1);
  assert.equal(day.byHour[16], 1);
  assert.doesNotMatch(JSON.stringify(written), PII);
});

test("fromStream: an order the index still shows with its old status is counted with the new one, once", async () => {
  const changed = SEED.map((o) => (o.id === id(1) ? { ...o, status: "cancelled", note: "Secret staff note" } : o));
  const { written, figures } = figuresOver(laggingOrders(changed, { stale: { [id(1)]: { status: "new" } } }));
  await figures.fromStream([keyRecord(id(1))]);
  const day = written[0].data;
  assert.equal(day.orders, 3, "not counted twice");
  assert.deepEqual(day.byStatus, { cancelled: 2, new: 1 });
  assert.equal(day.cancelled, 2);
  assert.deepEqual([day.units, day.value], [2, 125.5], "the cancelled order adds no units or value");
  assert.deepEqual(Object.keys(day), ["day", "timeZone", "orders", "units", "value", "cancelled", "byStatus", "byState", "byHour", "products", "updatedAt"], "no id in the document");
  assert.doesNotMatch(JSON.stringify(written), PII);
});

test("fromStream: when the index is up to date the result is the same as without the extra read", async () => {
  const lagging = figuresOver(laggingOrders(SEED, { missing: [id(1), id(3)] }));
  const plain = figuresWith();
  await lagging.figures.fromStream([keyRecord(id(1)), keyRecord(id(3))]);
  await plain.figures.fromStream([keyRecord(id(1)), keyRecord(id(3))]);
  assert.deepEqual(lagging.written, plain.written);
});

test("fromStream: an order that is gone writes nothing; an empty batch does nothing", async () => {
  const { db, written, figures } = figuresWith();
  assert.deepEqual(await figures.fromStream([keyRecord(id(99), "REMOVE")]), { days: 0 });
  assert.deepEqual(await figures.fromStream([]), { days: 0 });
  assert.deepEqual(await figures.fromStream(undefined), { days: 0 });
  assert.equal(written.length, 0);
  assert.equal(db.calls.filter((c) => c.kind === "Query").length, 0);
});

test("fromStream: a day is recounted, not incremented, so a replayed batch gives the same document", async () => {
  const { written, figures } = figuresWith();
  await figures.fromStream([keyRecord(id(1))]);
  await figures.fromStream([keyRecord(id(1))]);
  assert.equal(written.length, 2);
  assert.deepEqual(written[0], written[1]);
  assert.equal(written[1].data.orders, 3);
});

test("rebuild: refuses bad ranges", async () => {
  const { db, figures } = figuresWith();
  const bad = [
    ["2026-1-1", "2026-10-09"],
    ["2026-10-09", "2026-02-30"],
    ["2026-10-10", "2026-10-09"],
    ["2024-01-01", addDays("2024-01-01", 800)],
    [undefined, "2026-10-09"],
    [20261009, "2026-10-09"],
    [{ toString: () => "2026-10-09" }, "2026-10-09"],
  ];
  for (const [from, to] of bad) await assert.rejects(figures.rebuild(from, to), /invalid range/, `${from} to ${to}`);
  assert.equal(db.calls.length, 0);
  await assert.doesNotReject(figures.rebuild("2024-01-01", addDays("2024-01-01", 799)));
});

test("rebuild: works in chunks of 31 days and writes only the days that have orders", async () => {
  const { db, written, figures } = figuresWith();
  const result = await figures.rebuild("2026-08-01", "2026-10-31");
  assert.deepEqual(result, { days: 2 });
  assert.deepEqual(written.map((d) => d.path), ["figures/2026-10-09", "figures/2026-10-10"]);
  const bounds = db.calls.filter((c) => c.kind === "Query").map((c) => [c.input.ExpressionAttributeValues[":start"], c.input.ExpressionAttributeValues[":end"]]);
  const expected = [["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-10-01"], ["2026-10-02", "2026-10-31"]].map(([a, b]) => {
    const r = dayBounds(a, b, TZ);
    return [r.start, r.end];
  });
  assert.deepEqual(bounds, expected, "92 days make three chunks, the last one short");
  assert.doesNotMatch(JSON.stringify(written), PII);

  const one = figuresWith();
  assert.deepEqual(await one.figures.rebuild("2026-10-10", "2026-10-10"), { days: 1 });
  assert.equal(one.written[0].data.orders, 1);
  assert.equal(one.db.calls.filter((c) => c.kind === "Query").length, 1);

  const long = figuresWith([]);
  assert.deepEqual(await long.figures.rebuild("2025-01-01", "2026-03-15"), { days: 0 });
  assert.equal(long.written.length, 0, "no empty documents");
  assert.equal(long.db.calls.length, Math.ceil(439 / 31));
});

test("firestore: values round trip, in the shapes the REST API expects", () => {
  assert.deepEqual(toValue(5), { integerValue: "5" });
  assert.deepEqual(toValue(2.5), { doubleValue: 2.5 });
  assert.deepEqual(toValue("a"), { stringValue: "a" });
  assert.deepEqual(toValue(true), { booleanValue: true });
  assert.deepEqual(toValue(null), { nullValue: null });
  assert.deepEqual(toValue(new Date("2026-10-11T15:00:00Z")), { timestampValue: "2026-10-11T15:00:00.000Z" });
  assert.deepEqual(toValue([1, "a"]), { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }] } });
  assert.deepEqual(toValue({}), { mapValue: { fields: {} } });
  assert.deepEqual(toFields({ a: 1, b: undefined }), { a: { integerValue: "1" } }, "undefined is left out");

  const data = { a: 1, b: 1.5, c: "x", d: false, e: null, f: [1, "a", { g: 2 }, []], h: {}, i: { j: { k: [true] } }, n: 0, neg: -7 };
  assert.deepEqual(fromFields(toFields(data)), data);
  assert.equal(fromValue(toValue(new Date("2026-10-11T15:00:00Z"))), "2026-10-11T15:00:00.000Z");
  assert.equal(fromValue({ integerValue: "42" }), 42);
  assert.equal(fromValue({ arrayValue: {} }).length, 0);
  assert.equal(fromValue(undefined), null);
  assert.deepEqual(fromFields(undefined), {});
});

test("firestore: setAll commits whole documents in batches of 400, signed, and errors carry only a status", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const firestore = createFirestore({ projectId: "demo-project", fetchImpl });
  const docs = Array.from({ length: 950 }, (_, n) => ({ path: `figures/d${n}`, data: { n, label: "x" } }));
  await firestore.setAll(docs, "tok");
  assert.deepEqual(sent.map((s) => s.body.writes.length), [400, 400, 150]);
  assert.equal(sent[0].url, "https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents:commit");
  assert.equal(sent[0].init.method, "POST");
  assert.equal(sent[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(sent[0].body.writes[1], { update: { name: "projects/demo-project/databases/(default)/documents/figures/d1", fields: { n: { integerValue: "1" }, label: { stringValue: "x" } } } });
  assert.ok(sent.every((s) => s.body.writes.every((w) => Object.keys(w).join() === "update")), "no merge mask: each document is replaced whole");

  sent.length = 0;
  await firestore.setAll([], "tok");
  assert.equal(sent.length, 0);

  const failing = createFirestore({ projectId: "p", fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: "details about someone@example.test" }) }) });
  await assert.rejects(failing.setAll([{ path: "figures/x", data: {} }], "tok"), (error) => error.message === "firestore write 503");
});

test("firestore: get reads a public document without a token, and a missing one is null", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith("/store%2Fgone") || url.endsWith("/store/gone")) return { ok: false, status: 404, json: async () => ({}) };
    if (url.endsWith("/store/broken")) return { ok: false, status: 500, json: async () => ({ error: "x" }) };
    return { ok: true, status: 200, json: async () => ({ fields: toFields({ products: { "a-slug": { hidden: true } }, updatedBy: "owner@shop.test" }) }) };
  };
  const firestore = createFirestore({ projectId: "demo-project", fetchImpl });
  assert.deepEqual(await firestore.get("store/catalog"), { products: { "a-slug": { hidden: true } }, updatedBy: "owner@shop.test" });
  assert.equal(seen[0].url, "https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents/store/catalog");
  assert.deepEqual(seen[0].init.headers, {}, "no token for a public read");
  assert.ok(seen[0].init.signal, "a read always has a timeout");
  assert.equal(await firestore.get("store/gone"), null);
  await assert.rejects(firestore.get("store/broken"), (error) => error.message === "firestore read 500");
  await firestore.get("figures/2026-10-09", "tok");
  assert.equal(seen.at(-1).init.headers.Authorization, "Bearer tok");
});

test("google auth: signs a service-account JWT that verifies, and keeps the token until near expiry", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const account = { type: "service_account", client_email: "figures@demo-project.iam.gserviceaccount.test", private_key: privateKey };
  let clock = Date.parse("2026-10-11T15:00:00Z");
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ access_token: `token-${requests.length}`, expires_in: 3600 }) };
  };
  const token = createGoogleAuth(account, { scope: "https://www.googleapis.com/auth/datastore", fetchImpl, now: () => clock });

  assert.equal(await token(), "token-1");
  assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(requests[0].init.body);
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [header, claims, signature] = form.get("assertion").split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
  const iat = Math.floor(clock / 1000);
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url")), {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  });
  assert.ok(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url")), "the assertion verifies against the public key");
  assert.ok(!form.toString().includes("PRIVATE KEY"), "the key itself is never sent");

  clock += 3000 * 1000;
  assert.equal(await token(), "token-1", "cached while more than a minute is left");
  assert.equal(requests.length, 1);
  clock += 541 * 1000;
  assert.equal(await token(), "token-2", "renewed once less than a minute is left");
  assert.equal(requests.length, 2);
});

test("google auth: a refused sign-in is an error with only a status and is tried again next time", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  let ok = false;
  const fetchImpl = async () => (ok ? { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) } : { ok: false, status: 401, json: async () => ({ error_description: "details" }) });
  const token = createGoogleAuth({ client_email: "a@b.test", private_key: privateKey }, { scope: "s", fetchImpl });
  await assert.rejects(token(), (error) => error.message === "google auth 401");
  ok = true;
  assert.equal(await token(), "t");
  assert.throws(() => createGoogleAuth({ client_email: "a@b.test" }, { scope: "s" }), /incomplete/);
  assert.throws(() => createGoogleAuth(null, { scope: "s" }), /incomplete/);
});
