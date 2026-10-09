/*
  Order request intake: validation and the HTTP handler.

  Kept free of Google imports so it can be tested with plain Node and fake
  data (order.test.js). index.js wires it to Firestore and Cloud Run.

  Rules this file keeps:
  - Prices and product names come from the server's catalog copy, never from
    the browser, so a tampered request cannot change what we quote.
  - Submitted values are never echoed in errors and never logged.
  - The same submission id saved twice is one order, not two.
*/
const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" "));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const str = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max && !CONTROL.test(v);
const optional = (v, max) => v === undefined || v === "" || str(v, 1, max);

/* Finds the variant a cart line points at: by SKU when it has one, otherwise by its option values. */
export function resolveLine(catalog, line) {
  const product = catalog[line.slug];
  if (!product) return null;
  const variant = product.variants.find((v) => (line.sku ? v.s === line.sku : v.o.join("|") === line.options.join("|")));
  if (!variant) return null;
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

export const referenceFor = (id) => `MB-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export function createOrderHandler({ origins, catalog, save, notify }) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Vary", "Origin");
    const origin = req.get("Origin") || "";
    if (!origins.includes(origin)) return res.status(403).json({ error: "Request not allowed." });
    res.set("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).send("");
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    if (!(req.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return res.status(415).json({ error: "JSON required." });
    if (Number(req.get("Content-Length")) > 16384 || (req.rawBody?.length || 0) > 16384) return res.status(413).json({ error: "Request too large." });

    const order = validateOrder(req.body, catalog);
    if (!order) return res.status(400).json({ error: "Please check the form and your cart, then try again." });

    try {
      const result = await save(order, req.ip || "unknown");
      if (result.limited) {
        res.set("Retry-After", "3600");
        return res.status(429).json({ error: "Too many requests. Please try again later or email us." });
      }
      if (!result.duplicate) {
        try {
          await notify(order.submissionId);
        } catch {
          /* the order is saved; the notification status records the failure */
        }
      }
      return res.status(200).json({ ok: true, reference: referenceFor(order.submissionId) });
    } catch {
      return res.status(503).json({ error: "Your request could not be saved. Please try again." });
    }
  };
}
