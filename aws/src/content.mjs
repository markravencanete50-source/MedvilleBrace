/*
  Store changes made in the dashboard, as order intake applies them.

  The team edits prices, stock and hidden products in the dashboard, which
  saves them to Firestore (store/catalog, a public document with no customer
  data). The website shows them after its next build. Order intake must not
  wait for that build, so it reads the document itself, at most once a
  minute, and lays it over the built catalog (aws/catalog.json):

    products.<slug>.hidden            the product cannot be ordered
    products.<slug>.status            "sold_out", "pending" or "coming_soon":
                                      the product is shown but cannot be ordered
    products.<slug>.variants.<key>.p  the price for that variant
    products.<slug>.variants.<key>.a  false: that variant is out of stock

  <key> is the variant's SKU, or its option values joined with "|" when it
  has no SKU (the same key src/data/catalog.ts uses).

  If Firestore cannot be read, the last good copy is used, and before any
  copy has been read, the built catalog alone. No order is refused because
  Google was slow; the team confirms every price before an order ships.
*/
export const variantKey = (v) => v.s || v.o.join("|");

/* The same three words as ProductStatus in src/data/content.ts and STATUSES in scripts/pull-content.mjs. */
const STATUSES = new Set(["sold_out", "pending", "coming_soon"]);

const price = (n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100000;

/* The built catalog with the store changes applied. Never changes the catalog passed in. */
export function applyStoreChanges(catalog, products) {
  if (!products || typeof products !== "object") return catalog;
  const out = { ...catalog };
  for (const [slug, change] of Object.entries(products)) {
    if (!Object.hasOwn(out, slug) || !change || typeof change !== "object") continue;
    if (change.hidden === true || (typeof change.status === "string" && STATUSES.has(change.status))) {
      delete out[slug];
      continue;
    }
    const variants = change.variants && typeof change.variants === "object" ? change.variants : {};
    out[slug] = {
      ...out[slug],
      variants: out[slug].variants.map((v) => {
        const c = Object.hasOwn(variants, variantKey(v)) ? variants[variantKey(v)] : null;
        if (!c || typeof c !== "object") return v;
        return { ...v, ...(price(c.p) ? { p: Math.round(c.p * 100) / 100 } : {}), ...(c.a === false ? { a: false } : {}) };
      }),
    };
  }
  return out;
}

/* read() resolves to the store/catalog document's fields, or null when there is none. */
export function createLiveCatalog({ catalog, read, ttlMs = 60000, now = () => Date.now() }) {
  let current = catalog;
  let checkedAt = -Infinity;
  let pending = null;
  return async () => {
    if (now() - checkedAt < ttlMs) return current;
    pending ??= read()
      .then((doc) => {
        current = applyStoreChanges(catalog, doc?.products);
        checkedAt = now();
      })
      .catch(() => {
        /* keep the last good copy; try again on a later request */
        checkedAt = now() - ttlMs + 10000;
        console.error("store changes unavailable");
      })
      .finally(() => {
        pending = null;
      });
    await pending;
    return current;
  };
}
