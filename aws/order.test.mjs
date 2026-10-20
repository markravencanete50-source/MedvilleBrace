/*
  Tests for the order intake. Invented catalog and invented people only:
  no real customer data, no network, no AWS services.

    npm run test:orders
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOrderHandler, fingerprint, hasUnavailable, referenceFor, resolveLine, validateOrder } from "./src/order.mjs";
import { applyStoreChanges, createLiveCatalog, variantKey } from "./src/content.mjs";
import { createStore } from "./src/store.mjs";
import { notificationMessage, sendNotification } from "./src/notification.mjs";

const CATALOG = {
  "test-knee-brace": {
    name: "Testbrand Knee Brace",
    optionNames: ["Size", "Side"],
    variants: [
      { o: ["M", "Left"], p: 100, s: "TKB-M-L" },
      { o: ["M", "Right"], p: 100, s: "TKB-M-R" },
      { o: ["L", "Left"], p: 110, s: "" },
    ],
  },
  "test-sleeve": { name: "Testbrand Sleeve", optionNames: [], variants: [{ o: [], p: 25.5, s: "" }] },
};

const ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const ORIGIN = "https://shop.test";
const good = () => ({
  submissionId: ID,
  website: "",
  agree: true,
  customer: {
    name: "Pat Example",
    email: "Pat@Example.com ",
    phone: "(555) 010-0000",
    address: { line1: "1 Test Street", line2: "", city: "Testville", state: "IL", zip: "62701" },
  },
  notes: "Thigh 19 in.",
  items: [
    { slug: "test-knee-brace", sku: "TKB-M-R", options: ["M", "Right"], qty: 2, unitPrice: 0.01 },
    { slug: "test-sleeve", sku: "", options: [], qty: 1 },
  ],
});

/* An API Gateway HTTP API (payload 2.0) event. */
const event = (body, { origin = ORIGIN, method = "POST", type = "application/json", raw } = {}) => ({
  headers: { origin, "content-type": type },
  requestContext: { http: { method, sourceIp: "203.0.113.9" }, requestId: "test-request" },
  body: raw ?? JSON.stringify(body),
  isBase64Encoded: false,
});
const handlerWith = (over = {}) =>
  createOrderHandler({ origins: [ORIGIN], enabled: true, catalog: CATALOG, save: async () => ({ duplicate: false }), notify: async () => {}, ...over });
const json = (r) => JSON.parse(r.body);

test("a valid order is normalised and priced from the server catalog", () => {
  const o = validateOrder(good(), CATALOG);
  assert.ok(o);
  assert.equal(o.customer.email, "pat@example.com");
  assert.equal(o.items[0].unitPrice, 100, "the browser's unitPrice is ignored");
  assert.equal(o.items[0].name, "Testbrand Knee Brace");
  assert.equal(o.subtotal, 225.5);
});

test("a variant without a SKU is found by its options", () => {
  const line = resolveLine(CATALOG, { slug: "test-knee-brace", sku: "", options: ["L", "Left"], qty: 1 });
  assert.equal(line.unitPrice, 110);
});

test("rejects bad input", () => {
  const cases = {
    honeypot: (b) => (b.website = "http://spam"),
    noConsent: (b) => (b.agree = false),
    badId: (b) => (b.submissionId = "123"),
    badEmail: (b) => (b.customer.email = "nope"),
    badState: (b) => (b.customer.address.state = "ZZ"),
    badZip: (b) => (b.customer.address.zip = "1234"),
    shortPhone: (b) => (b.customer.phone = "555"),
    unknownProduct: (b) => (b.items[0].slug = "not-a-product"),
    inheritedName: (b) => (b.items[0].slug = "constructor"),
    unknownSku: (b) => (b.items[0].sku = "NOPE"),
    zeroQty: (b) => (b.items[0].qty = 0),
    fractionalQty: (b) => (b.items[0].qty = 1.5),
    tooManyItems: (b) => (b.items = Array.from({ length: 31 }, () => ({ slug: "test-sleeve", sku: "", options: [], qty: 1 }))),
    emptyCart: (b) => (b.items = []),
    controlChars: (b) => (b.customer.name = "Pat\u0000"),
    longNotes: (b) => (b.notes = "x".repeat(1001)),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const b = good();
    mutate(b);
    assert.equal(validateOrder(b, CATALOG), null, name);
  }
});

test("handler: saves, notifies once, returns a reference", async () => {
  const saved = [];
  const notified = [];
  const handler = handlerWith({
    save: async (o) => (saved.push(o), { duplicate: saved.length > 1 }),
    notify: async (o) => notified.push(o.submissionId),
  });
  const r1 = await handler(event(good()));
  assert.equal(r1.statusCode, 200);
  assert.equal(json(r1).reference, referenceFor(ID));
  assert.equal(r1.headers["Access-Control-Allow-Origin"], ORIGIN);
  assert.equal(r1.headers["Cache-Control"], "no-store");
  const r2 = await handler(event(good()));
  assert.equal(r2.statusCode, 200, "a retry of the same submission still succeeds");
  assert.equal(notified.length, 1, "but is not notified twice");
});

test("handler: checks origin, method, switch, media type and size before touching storage", async () => {
  let touched = 0;
  const save = async () => (touched++, { duplicate: false });
  const cases = [
    [handlerWith({ save }), event(good(), { origin: "https://evil.test" }), 403],
    [handlerWith({ save }), event(good(), { method: "GET" }), 405],
    [handlerWith({ save, enabled: false }), event(good()), 503],
    [handlerWith({ save }), event(good(), { type: "text/plain" }), 415],
    [handlerWith({ save }), event(null, { raw: "x".repeat(20000) }), 413],
    [handlerWith({ save }), event(null, { raw: "{not json" }), 400],
    [handlerWith({ save }), event({ ...good(), agree: false }), 400],
  ];
  for (const [handler, ev, code] of cases) assert.equal((await handler(ev)).statusCode, code);
  assert.equal(touched, 0);
  assert.equal((await handlerWith({ save })(event(good(), { origin: "https://evil.test" }))).headers["Access-Control-Allow-Origin"], undefined);
});

test("handler: reads base64 bodies", async () => {
  const ev = event(null, { raw: Buffer.from(JSON.stringify(good())).toString("base64") });
  ev.isBase64Encoded = true;
  assert.equal((await handlerWith()(ev)).statusCode, 200);
});

test("handler: never echoes submitted values in errors", async () => {
  const bad = good();
  bad.customer.email = "secret-value-123";
  const res = await handlerWith()(event(bad));
  assert.equal(res.statusCode, 400);
  assert.ok(!res.body.includes("secret-value-123"));
});

test("handler: rate limit, changed answers, storage failure", async () => {
  assert.equal((await handlerWith({ save: async () => ({ limited: true }) })(event(good()))).statusCode, 429);
  assert.equal((await handlerWith({ save: async () => ({ conflict: true }) })(event(good()))).statusCode, 409);
  const broken = await handlerWith({ save: async () => { throw new Error("private detail"); } })(event(good()));
  assert.equal(broken.statusCode, 503);
  assert.ok(!broken.body.includes("private detail"));
});

test("handler: a failed notification does not fail the order", async () => {
  const res = await handlerWith({ notify: async () => { throw new Error("mail down"); } })(event(good()));
  assert.equal(res.statusCode, 200);
});

/* A fake DynamoDB: one orders table, one limits table, transactions all or nothing. */
function fakeDb() {
  const orders = new Map();
  const limits = new Map();
  const calls = [];
  const send = async (kind, input) => {
    calls.push({ kind, input });
    if (kind === "Get") return { Item: orders.get(input.Key.id) };
    if (kind === "Update") {
      const o = orders.get(input.Key.id);
      if (!o) throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
      o.notificationStatus = input.ExpressionAttributeValues[":status"];
      return {};
    }
    if (kind === "TransactWrite") {
      const [{ Put }, { Update }] = input.TransactItems;
      const count = limits.get(Update.Key.id)?.count ?? 0;
      const reasons = [
        { Code: orders.has(Put.Item.id) ? "ConditionalCheckFailed" : "None" },
        { Code: count >= Update.ExpressionAttributeValues[":limit"] ? "ConditionalCheckFailed" : "None" },
      ];
      if (reasons.some((r) => r.Code !== "None")) throw Object.assign(new Error("cancelled"), { CancellationReasons: reasons });
      orders.set(Put.Item.id, structuredClone(Put.Item));
      limits.set(Update.Key.id, { count: count + 1, expiresAt: Update.ExpressionAttributeValues[":expiry"] });
      return {};
    }
    throw new Error(kind);
  };
  return { send, orders, limits, calls };
}
const storeFor = (db, over = {}) => createStore({ send: db.send, ordersTable: "orders", limitsTable: "limits", secret: "test-secret", ...over });
const orderWithId = (n) => validateOrder({ ...good(), submissionId: `3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a${String(n).padStart(2, "0")}` }, CATALOG);

test("store: saves once, recognises a retry, refuses changed answers under the same id", async () => {
  const db = fakeDb();
  const store = storeFor(db);
  const order = validateOrder(good(), CATALOG);
  assert.deepEqual(await store.save(order, "203.0.113.9"), { duplicate: false });
  const item = db.orders.get(ID);
  assert.equal(item.reference, referenceFor(ID));
  assert.equal(item.status, "new");
  assert.equal(item.items[0].unitPrice, 100);
  assert.equal(item.requestHash, fingerprint(order));
  assert.deepEqual(await store.save(order, "203.0.113.9"), { duplicate: true });
  const changed = { ...order, customer: { ...order.customer, name: "Someone Else" } };
  assert.deepEqual(await store.save(changed, "203.0.113.9"), { conflict: true });
  assert.equal(db.orders.size, 1);
  assert.equal([...db.limits.values()][0].count, 1, "retries do not use up the limit");
});

test("store: limits each address to five orders an hour without storing the address", async () => {
  const db = fakeDb();
  const store = storeFor(db);
  for (let n = 0; n < 5; n++) assert.deepEqual(await store.save(orderWithId(n), "203.0.113.9"), { duplicate: false });
  assert.deepEqual(await store.save(orderWithId(5), "203.0.113.9"), { limited: true });
  assert.equal(db.orders.size, 5, "a refused order is not saved");
  assert.deepEqual(await store.save(orderWithId(6), "198.51.100.7"), { duplicate: false }, "another address is not affected");
  for (const key of db.limits.keys()) assert.ok(/^[0-9a-f]{64}$/.test(key) && !key.includes("203.0.113.9"));
  assert.ok(!JSON.stringify([...db.orders.values()]).includes("203.0.113.9"), "orders do not hold the address either");
});

test("store: unexpected database errors are passed up, not reported as limits", async () => {
  const db = fakeDb();
  const store = storeFor(db, { send: async (kind, input) => (kind === "Get" ? db.send(kind, input) : Promise.reject(Object.assign(new Error("x"), { CancellationReasons: [{ Code: "None" }, { Code: "TransactionConflict" }] }))) });
  await assert.rejects(store.save(validateOrder(good(), CATALOG), "203.0.113.9"));
});

test("store: records the notification status", async () => {
  const db = fakeDb();
  const store = storeFor(db);
  await store.save(validateOrder(good(), CATALOG), "203.0.113.9");
  await store.setNotificationStatus(ID, "sent");
  assert.equal(db.orders.get(ID).notificationStatus, "sent");
});

test("notification carries no customer details", async () => {
  const m = notificationMessage("MB-3F2B8C1E", 3);
  assert.match(m.text, /MB-3F2B8C1E/);
  for (const s of ["Pat", "example.com", "Test Street", "Knee", "62701"]) assert.ok(!m.text.includes(s), s);
  assert.doesNotMatch(m.text + m.subject, /\u2014/);

  const sent = [];
  const env = { SENDER_EMAIL: "orders@shop.test", NOTIFY_TO: "team@shop.test, owner@shop.test" };
  assert.equal(await sendNotification({ reference: "MB-3F2B8C1E", itemCount: 3 }, async (i) => sent.push(i), env), "sent");
  assert.deepEqual(sent[0].Destination.ToAddresses, ["team@shop.test", "owner@shop.test"]);
  assert.equal(sent[0].FromEmailAddress, "Medville Brace <orders@shop.test>");
  assert.equal(await sendNotification({ reference: "MB-1", itemCount: 1 }, async () => assert.fail("must not send"), {}), "not-configured");
});

test("stack: closed by default, encrypted, recoverable, throttled, no request bodies in logs", () => {
  const template = readFileSync(new URL("./medville-brace-orders.yaml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(template, /OrdersEnabled:\s*\n\s*Type: String\s*\n\s*Default: "false"/);
  assert.match(template, /TableName: medville-brace-orders\n[\s\S]*?DeletionProtectionEnabled: true/);
  assert.match(template, /PointInTimeRecoveryEnabled: true/);
  assert.equal(template.match(/SSEType: KMS/g)?.length, 3, "orders, rate limits and the access log");
  assert.match(template, /EnableKeyRotation: true/);
  assert.match(template, /TableName: medville-brace-order-limits[\s\S]*?AttributeName: expiresAt\n\s*Enabled: true/);
  assert.match(template, /ThrottlingBurstLimit: 20/);
  assert.match(template, /KmsKeyArn: !GetAtt OrdersKey.Arn/);
  const intakeRole = template.slice(template.indexOf("\n  OrdersRole:"), template.indexOf("\n  AdminRole:"));
  assert.ok(intakeRole.includes("medville-brace-orders-intake"));
  assert.doesNotMatch(intakeRole, /dynamodb:(Scan|Query|DeleteItem)/, "the intake role cannot read orders back in bulk or delete them");
  assert.doesNotMatch(template, /dynamodb:(Scan|DeleteItem|BatchWriteItem)/, "nothing in the stack can scan or delete orders");

  for (const file of ["index.mjs", "order.mjs", "store.mjs", "notification.mjs"]) {
    const src = readFileSync(new URL(`./src/${file}`, import.meta.url), "utf8");
    /* Fixed message strings are fine; any logged value must not be request data. */
    for (const [, args] of src.matchAll(/console\.\w+\(([^)]*)\)/g)) assert.doesNotMatch(args.replace(/"[^"]*"/g, ""), /body|order|customer|email|name|address|\bip\b/i, file);
  }
});

/* Freezing the inputs makes any attempt to change them throw. */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

test("variantKey: the SKU, or the option values joined when there is none", () => {
  assert.equal(variantKey({ o: ["M", "Left"], p: 1, s: "TKB-M-L" }), "TKB-M-L");
  assert.equal(variantKey({ o: ["L", "Left"], p: 1, s: "" }), "L|Left");
});

test("store changes: hidden products, prices and stock are laid over the built catalog", () => {
  const built = deepFreeze(structuredClone(CATALOG));
  const changes = deepFreeze({
    "test-knee-brace": { variants: { "TKB-M-L": { p: 89.999 }, "TKB-M-R": { a: false }, "L|Left": { p: 120, a: false } } },
    "test-sleeve": { hidden: true },
  });
  const live = applyStoreChanges(built, changes);
  assert.equal(Object.hasOwn(live, "test-sleeve"), false, "a hidden product cannot be ordered");
  const v = live["test-knee-brace"].variants;
  assert.deepEqual(v[0], { o: ["M", "Left"], p: 90, s: "TKB-M-L" }, "the price is rounded to cents");
  assert.deepEqual(v[1], { o: ["M", "Right"], p: 100, s: "TKB-M-R", a: false });
  assert.deepEqual(v[2], { o: ["L", "Left"], p: 120, s: "", a: false }, "a variant with no SKU is found by its options");
  assert.equal(live["test-knee-brace"].name, "Testbrand Knee Brace");
  assert.deepEqual(built, CATALOG, "the built catalog is not changed");
  assert.equal(built["test-knee-brace"].variants[0].p, 100);
});

test("store changes: bad prices, stock flags that are not false, and unknown products are ignored", () => {
  for (const p of [0, -5, "12", NaN, Infinity, 100000, null, undefined, {}, [], true]) {
    const live = applyStoreChanges(deepFreeze(structuredClone(CATALOG)), { "test-knee-brace": { variants: { "TKB-M-L": { p } } } });
    assert.equal(live["test-knee-brace"].variants[0].p, 100, `price ${String(p)}`);
  }
  const live = applyStoreChanges(CATALOG, {
    "test-knee-brace": { hidden: false, variants: { "TKB-M-L": { a: true }, "TKB-M-R": { a: "no" }, NOPE: { p: 1 }, "L|Left": "junk" } },
    "not-a-product": { hidden: true },
    constructor: { hidden: true },
    "test-sleeve": null,
  });
  assert.deepEqual(live, CATALOG);
  assert.equal(applyStoreChanges(CATALOG, undefined), CATALOG);
  assert.equal(applyStoreChanges(CATALOG, "junk"), CATALOG);
  assert.equal(applyStoreChanges(CATALOG, null), CATALOG);
  assert.deepEqual(applyStoreChanges(CATALOG, JSON.parse('{"__proto__": {"hidden": true}}')), CATALOG);
});

test("store changes: an order is priced from the changed catalog", () => {
  const live = applyStoreChanges(CATALOG, { "test-knee-brace": { variants: { "TKB-M-R": { p: 95 } } } });
  assert.equal(validateOrder(good(), live).subtotal, 215.5);
  assert.equal(validateOrder(good(), CATALOG).subtotal, 225.5);
});

function liveCatalogWith(reads, over = {}) {
  let clock = 0;
  const calls = { n: 0 };
  const live = createLiveCatalog({
    catalog: CATALOG,
    read: () => {
      const next = reads[Math.min(calls.n, reads.length - 1)];
      calls.n += 1;
      return typeof next === "function" ? next() : Promise.resolve(next);
    },
    now: () => clock,
    ...over,
  });
  return { live, calls, at: (ms) => (clock = ms) };
}

const quietly = async (fn) => {
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return logged;
};

test("live catalog: reads at most once a minute and applies what it read", async () => {
  const { live, calls, at } = liveCatalogWith([{ products: { "test-sleeve": { hidden: true } } }, { products: {} }]);
  assert.equal(Object.hasOwn(await live(), "test-sleeve"), false);
  at(59999);
  assert.equal(Object.hasOwn(await live(), "test-sleeve"), false);
  assert.equal(calls.n, 1, "inside the minute there is no second read");
  at(60000);
  assert.equal(Object.hasOwn(await live(), "test-sleeve"), true, "the hidden product came back");
  assert.equal(calls.n, 2);
  const none = liveCatalogWith([null]);
  assert.deepEqual(await none.live(), CATALOG, "no document means the built catalog");
});

test("live catalog: a failed read keeps the last good copy and tries again soon", async () => {
  const { live, calls, at } = liveCatalogWith([
    { products: { "test-sleeve": { hidden: true } } },
    () => Promise.reject(new Error("Test Person person1@example.test")),
    { products: {} },
  ]);
  const logged = await quietly(async () => {
    assert.equal(Object.hasOwn(await live(), "test-sleeve"), false);
    at(61000);
    assert.equal(Object.hasOwn(await live(), "test-sleeve"), false, "the failure keeps the previous copy");
    assert.equal(calls.n, 2);
    at(65000);
    await live();
    assert.equal(calls.n, 2, "not retried at once");
    at(72000);
    assert.equal(Object.hasOwn(await live(), "test-sleeve"), true, "retried after ten seconds");
    assert.equal(calls.n, 3);
  });
  assert.doesNotMatch(JSON.stringify(logged), /Test Person|example\.test/, "the failure is logged without detail");

  const first = liveCatalogWith([() => Promise.reject(new Error("down"))]);
  await quietly(async () => assert.deepEqual(await first.live(), CATALOG, "before any read, the built catalog"));
});

test("live catalog: requests that arrive together share one read", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { live, calls } = liveCatalogWith([() => gate.then(() => ({ products: { "test-sleeve": { hidden: true } } }))]);
  const all = Promise.all([live(), live(), live()]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.n, 1, "one request in flight");
  release();
  const results = await all;
  assert.equal(calls.n, 1);
  assert.ok(results.every((c) => !Object.hasOwn(c, "test-sleeve")));
  assert.equal(results[0], results[1], "the same copy for all of them");
});

test("hasUnavailable: only a product or variant that was there and is not now", () => {
  const live = applyStoreChanges(CATALOG, { "test-sleeve": { hidden: true }, "test-knee-brace": { variants: { "TKB-M-R": { a: false } } } });
  const line = (slug, sku, options = []) => ({ slug, sku, options, qty: 1 });
  assert.equal(hasUnavailable({ items: [line("test-sleeve", "")] }, live, CATALOG), true);
  assert.equal(hasUnavailable({ items: [line("test-knee-brace", "TKB-M-R", ["M", "Right"])] }, live, CATALOG), true);
  assert.equal(hasUnavailable({ items: [line("test-knee-brace", "TKB-M-L", ["M", "Left"])] }, live, CATALOG), false);
  assert.equal(hasUnavailable({ items: [line("test-knee-brace", "NOPE", [])] }, live, CATALOG), false, "an unknown variant is junk, not unavailable");
  assert.equal(hasUnavailable({ items: [line("not-a-product", "")] }, live, CATALOG), false);
  for (const junk of [null, undefined, {}, { items: "x" }, { items: [null, 5, "x", { slug: 7 }, { slug: "test-knee-brace" }] }]) assert.equal(hasUnavailable(junk, live, CATALOG), false);
});

test("store changes: a sold out, pending or coming soon product cannot be ordered, and junk statuses are ignored", () => {
  const built = deepFreeze(structuredClone(CATALOG));
  for (const status of ["sold_out", "pending", "coming_soon"]) {
    const live = applyStoreChanges(built, { "test-sleeve": { status } });
    assert.equal(Object.hasOwn(live, "test-sleeve"), false, `${status} closes the product to orders`);
    assert.equal(Object.hasOwn(live, "test-knee-brace"), true, "other products are untouched");
    const line = { slug: "test-sleeve", sku: "", options: [], qty: 1 };
    assert.equal(hasUnavailable({ items: [line] }, live, CATALOG), true, `${status}: a cart line added earlier is refused`);
  }
  for (const junk of ["", "SOLD_OUT", "hidden", 7, null, {}, ["sold_out"]]) {
    const live = applyStoreChanges(built, { "test-sleeve": { status: junk } });
    assert.equal(Object.hasOwn(live, "test-sleeve"), true, `${JSON.stringify(junk)} is not a status`);
  }
  assert.deepEqual(built, CATALOG, "the built catalog is not changed");
});

test("handler: 409 for a product hidden or a variant out of stock since it was added to the cart, 400 for junk", async () => {
  let saved = 0;
  const save = async () => (saved++, { duplicate: false });
  const hidden = applyStoreChanges(CATALOG, { "test-sleeve": { hidden: true } });
  const outOfStock = applyStoreChanges(CATALOG, { "test-knee-brace": { variants: { "TKB-M-R": { a: false } } } });

  for (const liveCatalog of [async () => hidden, async () => outOfStock]) {
    const res = await handlerWith({ save, liveCatalog })(event(good()));
    assert.equal(res.statusCode, 409);
    assert.match(json(res).error, /no longer available/);
    assert.doesNotMatch(res.body, /test-sleeve|TKB|Pat|Example/, "nothing submitted is echoed");
  }
  assert.equal(saved, 0, "nothing was saved");

  const changedPrice = applyStoreChanges(CATALOG, { "test-knee-brace": { variants: { "TKB-M-R": { p: 95 } } } });
  assert.equal((await handlerWith({ save, liveCatalog: async () => changedPrice })(event(good()))).statusCode, 200);
  assert.equal(saved, 1);

  const junk = handlerWith({ save, liveCatalog: async () => hidden });
  const wrongForm = good();
  wrongForm.customer.email = "nope";
  wrongForm.items = [{ slug: "test-knee-brace", sku: "TKB-M-R", options: ["M", "Right"], qty: 1 }];
  assert.equal((await junk(event(wrongForm))).statusCode, 400, "a bad form with available items is still a 400");
  assert.equal((await junk(event({ ...good(), items: [{ slug: "not-a-product", sku: "", options: [], qty: 1 }] }))).statusCode, 400);
  assert.equal((await junk(event({ ...good(), items: [{ slug: "test-knee-brace", sku: "NOPE", options: [], qty: 1 }] }))).statusCode, 400);
  assert.equal((await junk(event(null, { raw: "[]" }))).statusCode, 400);
  assert.equal((await junk(event(null, { raw: "{not json" }))).statusCode, 400);
  assert.equal(saved, 1);
});

test("handler: a live catalog that is down does not stop an order from the built prices", async () => {
  const live = createLiveCatalog({ catalog: CATALOG, read: async () => { throw new Error("down"); } });
  await quietly(async () => assert.equal((await handlerWith({ liveCatalog: live })(event(good()))).statusCode, 200));
});

test("stack: the orders table streams keys only, and the intake role is unchanged", () => {
  const template = readFileSync(new URL("./medville-brace-orders.yaml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const table = template.slice(template.indexOf("\n  OrdersTable:"), template.indexOf("\n  LimitsTable:"));
  assert.match(table, /StreamSpecification:\n\s*StreamViewType: KEYS_ONLY/);
  assert.doesNotMatch(template, /StreamViewType: (NEW_IMAGE|OLD_IMAGE|NEW_AND_OLD_IMAGES)/, "no stream carries an order's contents");
  assert.equal(template.match(/StreamViewType/g)?.length, 1, "only the orders table streams");

  const intakeRole = template.slice(template.indexOf("\n  OrdersRole:"), template.indexOf("\n  AdminRole:"));
  const actions = [...intakeRole.matchAll(/Action: (\[[^\]]*\]|[\w:]+)/g)].flatMap(([, a]) => a.replace(/[[\]\s]/g, "").split(","));
  assert.deepEqual(actions.sort(), [
    "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:UpdateItem",
    "kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey",
    "logs:CreateLogStream", "logs:PutLogEvents",
    "ses:SendEmail", "sts:AssumeRole",
  ]);
  assert.doesNotMatch(intakeRole, /secretsmanager|GoogleKeySecretArn|StreamArn|DescribeStream|GetRecords/, "intake cannot reach the Google key or the stream");
  const fn = template.slice(template.indexOf("\n  OrdersFunction:"), template.indexOf("\n  AdminLogGroup:"));
  assert.match(fn, /FIREBASE_PROJECT_ID: !Ref FirebaseProjectId/);
  assert.doesNotMatch(fn, /GOOGLE_KEY_SECRET|DEPLOY_HOOK/, "intake holds no Google key and no deploy hook");
});
