/*
  Order request intake: validation and the HTTP handler.

  Kept free of AWS imports so it can be tested with plain Node and fake data
  (aws/order.test.mjs). index.mjs wires it to DynamoDB, SES and the API
  Gateway HTTP API.

  Rules this file keeps:
  - Prices and product names come from the server's catalog copy, never from
    the browser, so a tampered request cannot change what we quote. Store
    changes made in the dashboard (prices, stock, hidden products) are laid
    over that copy by content.mjs before an order is checked.
  - Submitted values are never echoed in errors and never logged.
  - The same submission id saved twice is one order, not two. A reused id with
    different answers is refused, so changed details are never reported as saved.
*/
import { createHash } from "node:crypto";

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" "));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_BODY = 16384;

const str = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max && !CONTROL.test(v);
const optional = (v, max) => v === undefined || v === "" || str(v, 1, max);

/* Finds the variant a cart line points at: by SKU when it has one, otherwise by its option values. */
const findVariant = (product, line) => product.variants.find((v) => (line.sku ? v.s === line.sku : v.o.join("|") === line.options.join("|")));

export function resolveLine(catalog, line) {
  const product = Object.hasOwn(catalog, line.slug) ? catalog[line.slug] : null;
  if (!product) return null;
  const variant = findVariant(product, line);
  if (!variant || variant.a === false) return null;
  return { slug: line.slug, name: product.name, sku: variant.s, options: variant.o, optionNames: product.optionNames, qty: line.qty, unitPrice: variant.p };
}

export function validateOrder(body, catalog) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const c = body.customer;
  const a = c?.address;
  if (body.website !== undefined && body.website !== "") return null; // filled honeypot: a bot
  if (typeof body.submissionId !== "string" || !UUID.test(body.submissionId)) return null;
  if (body.agree !== true) return null;
  if (!c || typeof c !== "object" || !a || typeof a !== "object") return null;
  if (!str(c.name, 2, 120)) return null;
  if (!str(c.email, 5, 160) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return null;
  if (!optional(c.phone, 25) || (c.phone && (!/^[0-9+() .-]+$/.test(c.phone) || c.phone.replace(/\D/g, "").length < 10))) return null;
  if (!str(a.line1, 4, 160) || !optional(a.line2, 160) || !str(a.city, 2, 80)) return null;
  if (!STATES.has(a.state) || typeof a.zip !== "string" || !/^\d{5}(-\d{4})?$/.test(a.zip.trim())) return null;
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 1000 || CONTROL.test(body.notes))) return null;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return null;

  const items = [];
  for (const it of body.items) {
    if (!it || typeof it !== "object") return null;
    if (typeof it.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,89}$/.test(it.slug)) return null;
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99) return null;
    if (typeof it.sku !== "string" || it.sku.length > 80) return null;
    if (!Array.isArray(it.options) || it.options.length > 3 || !it.options.every((o) => typeof o === "string" && o.length <= 60)) return null;
    const line = resolveLine(catalog, it);
    if (!line) return null;
    items.push(line);
  }
  const subtotal = Math.round(items.reduce((n, l) => n + l.unitPrice * l.qty, 0) * 100) / 100;

  return {
    submissionId: body.submissionId.toLowerCase(),
    customer: {
      name: c.name.trim(),
      email: c.email.trim().toLowerCase(),
      phone: (c.phone ?? "").trim(),
      address: { line1: a.line1.trim(), line2: (a.line2 ?? "").trim(), city: a.city.trim(), state: a.state, zip: a.zip.trim() },
    },
    notes: (body.notes ?? "").trim(),
    items,
    subtotal,
  };
}

/* True when a cart line names a product that has been hidden, or a variant marked out of stock, since it was added. */
export function hasUnavailable(body, catalog, built) {
  if (!Array.isArray(body?.items)) return false;
  return body.items.some((it) => {
    if (!it || typeof it.slug !== "string" || !Object.hasOwn(built, it.slug)) return false;
    if (!Object.hasOwn(catalog, it.slug)) return true;
    const line = { sku: typeof it.sku === "string" ? it.sku : "", options: Array.isArray(it.options) ? it.options : [] };
    return findVariant(catalog[it.slug], line)?.a === false;
  });
}

export const referenceFor = (id) => `MB-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

/* Identifies the exact answers saved under a submission id, to tell a retry from a changed request. */
export const fingerprint = (order) => createHash("sha256").update(JSON.stringify(order)).digest("hex");

export function reply(statusCode, origin, body, extra = {}) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  };
}

/*
  Handles an API Gateway HTTP API (payload 2.0) event. The API answers CORS
  preflight requests itself, so only POST reaches this function.

  catalog is the built catalog; liveCatalog() resolves to it with the
  dashboard's store changes applied (content.mjs).
  save(order, ip) resolves to { duplicate } | { limited } | { conflict };
  notify(order) runs once per new order and may fail without failing the order.
*/
export function createOrderHandler({ origins, enabled, catalog, liveCatalog = async () => catalog, save, notify }) {
  return async (event) => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const origin = headers.origin || "";
    if (!origins.includes(origin)) return reply(403, "", { error: "Request not allowed." });
    if (event.requestContext?.http?.method !== "POST") return reply(405, origin, { error: "Method not allowed." });
    if (!enabled) return reply(503, origin, { error: "Online order requests are not open yet. Please email us." });
    if (!(headers["content-type"] || "").toLowerCase().startsWith("application/json")) return reply(415, origin, { error: "JSON required." });

    let raw = event.body || "";
    if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
    if (Buffer.byteLength(raw) > MAX_BODY) return reply(413, origin, { error: "Request too large." });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    const current = await liveCatalog();
    const order = validateOrder(body, current);
    if (!order && hasUnavailable(body, current, catalog)) {
      return reply(409, origin, { error: "Something in your cart is no longer available. Remove it, or choose another size, and send the request again." });
    }
    if (!order) return reply(400, origin, { error: "Please check the form and your cart, then try again." });

    const ip = event.requestContext?.http?.sourceIp;
    if (!ip) return reply(503, origin, { error: "Your request could not be saved. Please try again." });
    try {
      const result = await save(order, ip);
      if (result.limited) return reply(429, origin, { error: "Too many requests. Please try again later or email us." }, { "Retry-After": "3600" });
      if (result.conflict) return reply(409, origin, { error: "This request was already sent. Refresh the page to start a new one." });
      if (!result.duplicate) {
        try {
          await notify(order);
        } catch {
          /* the order is saved; its notificationStatus records the failure */
        }
      }
      return reply(200, origin, { ok: true, reference: referenceFor(order.submissionId) });
    } catch {
      console.error("order save failed", { requestId: event.requestContext?.requestId });
      return reply(503, origin, { error: "Your request could not be saved. Please try again." });
    }
  };
}
