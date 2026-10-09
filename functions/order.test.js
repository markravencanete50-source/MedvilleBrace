/*
  Tests for the order intake. Invented catalog and invented people only:
  no real customer data, no network, no Google services.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrderHandler, referenceFor, resolveLine, validateOrder } from "./order.js";
import { notificationMessage } from "./notification.js";

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

function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.set = (k, v) => ((r.headers[k] = v), r);
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.send = (b) => ((r.body = b), r);
  return r;
}
const fakeReq = (body, { origin = "https://shop.test", method = "POST", type = "application/json" } = {}) => ({
  method,
  body,
  ip: "203.0.113.9",
  rawBody: Buffer.from(JSON.stringify(body ?? {})),
  get: (h) => ({ origin, "content-type": type, "content-length": String(JSON.stringify(body ?? {}).length) })[h.toLowerCase()],
});

test("handler: saves, notifies once, returns a reference", async () => {
  const saved = [];
  const notified = [];
  const handler = createOrderHandler({
    origins: ["https://shop.test"],
    catalog: CATALOG,
    save: async (o) => (saved.push(o), { duplicate: saved.length > 1 }),
    notify: async (id) => notified.push(id),
  });
  const r1 = fakeRes();
  await handler(fakeReq(good()), r1);
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.body.reference, referenceFor(ID));
  const r2 = fakeRes();
  await handler(fakeReq(good()), r2);
  assert.equal(r2.statusCode, 200, "a retry of the same submission still succeeds");
  assert.equal(notified.length, 1, "but is not notified twice");
});

test("handler: refuses other origins, wrong methods, non-JSON, invalid bodies", async () => {
  const handler = createOrderHandler({ origins: ["https://shop.test"], catalog: CATALOG, save: async () => ({}), notify: async () => {} });
  const cases = [
    [fakeReq(good(), { origin: "https://evil.test" }), 403],
    [fakeReq(good(), { method: "GET" }), 405],
    [fakeReq(good(), { type: "text/plain" }), 415],
    [fakeReq({ ...good(), agree: false }), 400],
  ];
  for (const [req, code] of cases) {
    const res = fakeRes();
    await handler(req, res);
    assert.equal(res.statusCode, code);
  }
});

test("handler: never echoes submitted values in errors", async () => {
  const handler = createOrderHandler({ origins: ["https://shop.test"], catalog: CATALOG, save: async () => ({}), notify: async () => {} });
  const res = fakeRes();
  const bad = good();
  bad.customer.email = "secret-value-123";
  await handler(fakeReq(bad), res);
  assert.equal(res.statusCode, 400);
  assert.ok(!JSON.stringify(res.body).includes("secret-value-123"));
});

test("handler: rate limit and storage failure", async () => {
  const limited = createOrderHandler({ origins: ["https://shop.test"], catalog: CATALOG, save: async () => ({ limited: true }), notify: async () => {} });
  const r1 = fakeRes();
  await limited(fakeReq(good()), r1);
  assert.equal(r1.statusCode, 429);
  const broken = createOrderHandler({ origins: ["https://shop.test"], catalog: CATALOG, save: async () => { throw new Error("down"); }, notify: async () => {} });
  const r2 = fakeRes();
  await broken(fakeReq(good()), r2);
  assert.equal(r2.statusCode, 503);
});

test("handler: a failed notification does not fail the order", async () => {
  const handler = createOrderHandler({ origins: ["https://shop.test"], catalog: CATALOG, save: async () => ({ duplicate: false }), notify: async () => { throw new Error("mail down"); } });
  const res = fakeRes();
  await handler(fakeReq(good()), res);
  assert.equal(res.statusCode, 200);
});

test("notification carries no customer details", () => {
  const m = notificationMessage("MB-3F2B8C1E", 3);
  assert.match(m.text, /MB-3F2B8C1E/);
  for (const s of ["Pat", "example.com", "Test Street", "Knee", "62701"]) assert.ok(!m.text.includes(s), s);
});
