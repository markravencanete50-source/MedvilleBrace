import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAdminAuth } from "../auth";
import { ALL_PRODUCTS, categoryName, money, type Product, type ProductDetail } from "../../data/catalog";
import { isProductStatus, PRODUCT_STATUSES, PRODUCT_STATUS_LABEL, variantKey, type ProductChange, type ProductStatus } from "../../data/content";
import { isFirebaseConfigured } from "../../lib/firebaseConfig";
import PublishBar from "../PublishBar";
import { LIMITS, readChanges, readStoreDoc, StoreError, writeProductChange, type StoreDoc } from "../storeContent";
import { Badge, Banner, Card, Drawer, Empty, Field, PageHeader, Spinner, Switch, useToast } from "../ui";

/*
  Products: hide a product, set its availability (sold out, pending or coming
  soon), change a variant's price, or mark a variant out of stock, without
  touching the supplier's feed.

  Search runs over the whole catalog (ALL_PRODUCTS), including products that
  are already hidden, so a hidden product can always be brought back. Opening
  one loads its variants from the same file the product page reads
  (/data/p/<slug>.json) and the live changes from Firestore (store/catalog).

  Only what differs from the feed is saved. A product with no differences left
  is removed from the document, so the list "Products with changes" is exactly
  what the website will change at the next publish.
*/

const SHOWN = 30;

const byTitle = (a: Product, b: Product) => a.title.localeCompare(b.title);
const catalogBySlug = new Map(ALL_PRODUCTS.map((p) => [p.slug, p]));

function searchable(p: Product) {
  return `${p.title} ${p.brand} ${p.slug}`.toLowerCase();
}

function describe(change: ProductChange) {
  const variants = Object.values(change.variants ?? {});
  const prices = variants.filter((v) => v.p !== undefined).length;
  const stock = variants.filter((v) => v.a === false).length;
  const parts: string[] = [];
  if (change.hidden) parts.push("Hidden");
  if (change.status) parts.push(PRODUCT_STATUS_LABEL[change.status]);
  if (prices) parts.push(`${prices} ${prices === 1 ? "price" : "prices"} changed`);
  if (stock) parts.push(`${stock} out of stock`);
  return parts;
}

export default function Products() {
  const connected = isFirebaseConfigured();
  const [doc, setDoc] = useState<StoreDoc | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await readStoreDoc("catalog");
      setDoc(next);
      return next;
    } catch (problem) {
      setError(problem instanceof StoreError ? problem.message : "That did not work.");
      return null;
    }
  }, []);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const changes = useMemo(() => readChanges(doc?.data ?? {}), [doc]);
  const index = useMemo(() => ALL_PRODUCTS.map((p) => ({ p, text: searchable(p) })), []);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => (words.length ? index.filter((i) => words.every((w) => i.text.includes(w))).map((i) => i.p).sort(byTitle) : []), [index, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = useMemo(
    () =>
      Object.keys(changes)
        .map((slug) => ({ slug, product: catalogBySlug.get(slug), change: changes[slug] }))
        .sort((a, b) => (a.product?.title ?? a.slug).localeCompare(b.product?.title ?? b.slug)),
    [changes],
  );

  const header = <PageHeader title="Products" lede="Hide a product, mark it sold out, pending or coming soon, change a price or mark a size out of stock. Changes reach the website when you publish." />;
  if (!connected) {
    return (
      <>
        {header}
        <Card>
          <Empty>Products can be changed once Firebase is connected. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID, then rebuild.</Empty>
        </Card>
      </>
    );
  }

  const row = (product: Product | undefined, slug: string, change?: ProductChange) => (
    <li key={slug}>
      <button type="button" className="admin-row-btn" onClick={() => setOpenSlug(slug)}>
        <span className="min-w-0">
          <span className="admin-row-title">{product?.title ?? slug}</span>
          <span className="admin-row-sub">{product ? `${product.brand}, ${categoryName(product.category)}` : "No longer in the catalog"}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {change ? describe(change).map((text) => <Badge key={text} tone={text === "Hidden" || text === PRODUCT_STATUS_LABEL.sold_out ? "danger" : text === PRODUCT_STATUS_LABEL.coming_soon ? "new" : "warn"}>{text}</Badge>) : null}
        </span>
      </button>
    </li>
  );

  return (
    <>
      {header}
      <PublishBar savedAt={doc?.updatedAt ?? null} />

      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}

      <Card className="mb-4">
        <Field label="Find a product" htmlFor="product-search" help="Search by name, brand or product address.">
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--a-text-faint)" }} />
            <input id="product-search" type="search" className="admin-input" style={{ paddingLeft: 36 }} autoComplete="off" value={query} placeholder="For example: walker boot" onChange={(event) => setQuery(event.target.value)} />
          </div>
        </Field>
      </Card>

      {words.length > 0 && (
        <Card pad={false} className="mb-4">
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--a-line)" }}>
            <h2 className="font-display m-0 text-[15px] font-semibold">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </h2>
            {matches.length > SHOWN && <p className="admin-help m-0">Showing the first {SHOWN}. Type more to narrow the list.</p>}
          </div>
          {matches.length ? <ul className="admin-row-list">{matches.slice(0, SHOWN).map((p) => row(p, p.slug, changes[p.slug]))}</ul> : <Empty>No product matches that search.</Empty>}
        </Card>
      )}

      <Card pad={false}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--a-line)" }}>
          <h2 className="font-display m-0 text-[15px] font-semibold">Products with changes</h2>
          <p className="admin-help m-0">What the website will change at the next publish.</p>
        </div>
        {doc === null && !error ? <Spinner label="Loading the changes" /> : changed.length ? <ul className="admin-row-list">{changed.map((c) => row(c.product, c.slug, c.change))}</ul> : <Empty>No product has changes. Search above to change one.</Empty>}
      </Card>

      {openSlug && (
        <Editor
          key={openSlug}
          slug={openSlug}
          product={catalogBySlug.get(openSlug)}
          entry={changes[openSlug]}
          docExists={Boolean(doc?.exists)}
          docReady={doc !== null}
          loadFailed={Boolean(error)}
          onClose={() => setOpenSlug(null)}
          onSaved={async () => {
            await load();
            setOpenSlug(null);
          }}
        />
      )}
    </>
  );
}

interface Row {
  key: string;
  price: string;
  inStock: boolean;
}

/* Prices are typed as dollars and cents. */
function parsePrice(text: string) {
  const t = text.trim().replace(/^\$/, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= LIMITS.price ? n : null;
}

const same = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

function Editor({
  slug,
  product,
  entry,
  docExists,
  docReady,
  loadFailed,
  onClose,
  onSaved,
}: {
  slug: string;
  product: Product | undefined;
  entry: ProductChange | undefined;
  docExists: boolean;
  docReady: boolean;
  loadFailed: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { session } = useAdminAuth();
  const toast = useToast();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [problem, setProblem] = useState("");
  const [hidden, setHidden] = useState(Boolean(entry?.hidden));
  const [status, setStatus] = useState<ProductStatus | "">(entry?.status ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/data/p/${encodeURIComponent(slug)}.json`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ProductDetail>) : Promise.reject(new Error("missing"))))
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch(() => live && setProblem("This product's sizes and prices could not be loaded. You can still hide or show the product."));
    return () => {
      live = false;
    };
  }, [slug]);

  /* The fields start from what is live now: the feed, with the saved changes on top. */
  useEffect(() => {
    if (!detail || !docReady) return;
    setHidden(Boolean(entry?.hidden));
    setStatus(entry?.status ?? "");
    setRows(
      detail.variants.map((v) => {
        const key = variantKey(v);
        const change = entry?.variants?.[key];
        return { key, price: String(change?.p ?? v.p), inStock: v.a !== false && change?.a !== false };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, docReady]);

  const built = useMemo(() => {
    const out: ProductChange = {};
    let invalid = false;
    if (hidden) out.hidden = true;
    if (status) out.status = status;
    if (detail && rows) {
      const variants: NonNullable<ProductChange["variants"]> = {};
      detail.variants.forEach((v, i) => {
        const row = rows[i];
        if (!row) return;
        const price = parsePrice(row.price);
        if (price === null) invalid = true;
        const change: { p?: number; a?: false } = {};
        if (price !== null && !same(price, v.p)) change.p = Math.round(price * 100) / 100;
        if (v.a !== false && !row.inStock) change.a = false;
        if (change.p !== undefined || change.a === false) variants[row.key] = change;
      });
      if (Object.keys(variants).length) out.variants = variants;
    } else if (entry?.variants) {
      /* The variants could not be loaded: keep what is saved. */
      out.variants = entry.variants;
    }
    return { entry: out.hidden || out.status || out.variants ? out : null, invalid };
  }, [hidden, status, rows, detail, entry]);

  const saved = JSON.stringify(entry ?? null);
  const dirty = JSON.stringify(built.entry) !== saved;
  const ready = docReady && (rows !== null || Boolean(problem));

  const save = async () => {
    if (built.invalid) return toast("Fix the prices marked below first.", "danger");
    setBusy(true);
    try {
      await writeProductChange(slug, built.entry, session!.email, docExists);
      toast(built.entry ? "Saved. Publish to put the change on the website." : "Saved. This product matches the supplier again.");
      await onSaved();
    } catch (failure) {
      toast(failure instanceof StoreError ? failure.message : "That did not work.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    setHidden(false);
    setStatus("");
    setRows((current) => (current && detail ? current.map((r, i) => ({ ...r, price: String(detail.variants[i].p), inStock: detail.variants[i].a !== false })) : current));
  };

  const optionNames = detail?.optionNames ?? [];

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={product?.title ?? slug}
      footer={
        <>
          <button type="button" className="admin-btn admin-btn-primary" disabled={busy || !ready || !dirty || built.invalid} onClick={() => void save()}>
            {busy ? "Saving" : "Save changes"}
          </button>
          <button type="button" className="admin-btn admin-btn-quiet" disabled={busy || !ready} onClick={clearAll}>
            Clear all changes
          </button>
          <button type="button" className="admin-btn admin-btn-quiet" disabled={busy} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {product && (
        <p className="admin-help m-0 mb-4">
          {product.brand}, {categoryName(product.category)}. Supplier price {product.priceMin === product.priceMax ? money(product.priceMin) : `${money(product.priceMin)} to ${money(product.priceMax)}`}.
        </p>
      )}
      {problem && (
        <div className="mb-4">
          <Banner tone="warn">{problem}</Banner>
        </div>
      )}
      {!docReady && loadFailed ? (
        <Banner tone="warn">The saved changes could not be loaded, so nothing can be changed safely. Close this and try again.</Banner>
      ) : !ready ? (
        <Spinner label="Loading the product" />
      ) : (
        <>
          <div className="mb-5">
            <Switch checked={hidden} onChange={setHidden} label="Hide this product" help="A hidden product is removed from the website at the next publish. Orders already placed are not affected." />
          </div>

          <div className="mb-5">
            <Field label="Availability" htmlFor="product-status" help="Sold out, pending and coming soon products stay on the website with a label, but cannot be added to the cart or ordered. Clear it to open the product again.">
              <select id="product-status" className="admin-select" value={status} onChange={(event) => setStatus(isProductStatus(event.target.value) ? event.target.value : "")}>
                <option value="">Available to order</option>
                {PRODUCT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {PRODUCT_STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {detail && rows && (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-text">
                <thead>
                  <tr>
                    <th scope="col">{optionNames.length ? optionNames.join(" / ") : "Option"}</th>
                    <th scope="col">Supplier price</th>
                    <th scope="col">Your price</th>
                    <th scope="col">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.variants.map((v, i) => {
                    const row = rows[i];
                    if (!row) return null;
                    const price = parsePrice(row.price);
                    const label = v.o.join(" / ") || v.s;
                    const supplierOut = v.a === false;
                    return (
                      <tr key={`${row.key}-${i}`}>
                        <td data-label={optionNames.join(" / ") || "Option"}>
                          <span className="font-semibold">{label}</span>
                          {v.s && <span className="block text-[12px] break-all" style={{ color: "var(--a-text-muted)" }}>{v.s}</span>}
                        </td>
                        <td data-label="Supplier price" className="tabular-nums">{money(v.p)}</td>
                        <td data-label="Your price">
                          <input
                            className="admin-input tabular-nums"
                            style={{ maxWidth: 130 }}
                            inputMode="decimal"
                            aria-label={`Price for ${label}`}
                            aria-invalid={price === null}
                            value={row.price}
                            onChange={(event) => setRows((current) => (current ?? []).map((r, j) => (j === i ? { ...r, price: event.target.value } : r)))}
                          />
                          {price === null && <span className="admin-help block" style={{ color: "var(--a-danger)" }}>Use dollars and cents, such as 49.99.</span>}
                        </td>
                        <td data-label="Stock">
                          <Switch
                            checked={row.inStock}
                            disabled={supplierOut}
                            ariaLabel={`In stock: ${label}`}
                            label="In stock"
                            onChange={(next) => setRows((current) => (current ?? []).map((r, j) => (j === i ? { ...r, inStock: next } : r)))}
                            help={supplierOut ? "The supplier lists this one as out of stock." : undefined}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="admin-help mt-4">Only differences from the supplier are saved. Setting a price back to the supplier price, or switching a size back to in stock, removes that change.</p>
        </>
      )}
    </Drawer>
  );
}
