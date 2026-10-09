import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import ProductCard from "../components/ProductCard";
import Photo from "../components/Photo";
import Button from "../components/Button";
import NotFound from "./NotFound";
import { BRANDS, PRODUCTS, brandBySlug, categoryName, pluralCategory, slugifyCondition, sortProducts, type Product, type SortKey } from "../data/catalog";
import { CATEGORY_NOTES, REGIONS, regionBySlug } from "../data/taxonomy";
import { searchSlugs } from "../lib/search";
import { usePageMeta } from "../lib/usePageMeta";

/*
  One listing page for every way into the catalog:
    /shop                 everything, or search results with ?q=
    /shop/:region         a body region
    /category/:slug       a device type
    /brands/:slug         a manufacturer
  Filters live in the address (?type, ?condition, ?brand, ?price, ?stock,
  ?sort) so a filtered view can be shared and the back button works.
*/
const PAGE = 24;
const PRICES = [
  { id: "under-50", label: "Under $50", test: (p: Product) => p.priceMin < 50 },
  { id: "50-150", label: "$50 to $150", test: (p: Product) => p.priceMin >= 50 && p.priceMin < 150 },
  { id: "150-300", label: "$150 to $300", test: (p: Product) => p.priceMin >= 150 && p.priceMin < 300 },
  { id: "300-plus", label: "$300 and up", test: (p: Product) => p.priceMin >= 300 },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price, low to high" },
  { id: "price-desc", label: "Price, high to low" },
  { id: "name", label: "Name, A to Z" },
  { id: "newest", label: "Newest" },
];

type Mode = "all" | "region" | "category" | "brand";

function count<T extends string>(list: Product[], key: (p: Product) => T | T[]) {
  const m = new Map<T, number>();
  for (const p of list) {
    const k = key(p);
    for (const v of Array.isArray(k) ? k : [k]) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Shop({ mode }: { mode: Mode }) {
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const [sheet, setSheet] = useState(false);

  const region = mode === "region" ? regionBySlug(params.region ?? "") : undefined;
  const fixedCategory = mode === "category" ? params.slug : undefined;
  const brand = mode === "brand" ? brandBySlug(params.slug ?? "") : undefined;
  const q = sp.get("q") ?? "";
  const type = fixedCategory ?? sp.get("type") ?? "";
  const condition = sp.get("condition") ?? "";
  const brands = (sp.get("brand") ?? "").split(",").filter(Boolean);
  const price = sp.get("price") ?? "";
  const stock = sp.get("stock") === "1";
  const sort = (sp.get("sort") as SortKey) || (q ? ("relevance" as SortKey) : "featured");

  const invalid =
    (mode === "region" && !region) ||
    (mode === "category" && !PRODUCTS.some((p) => p.category === fixedCategory)) ||
    (mode === "brand" && !brand);

  /* Base set: the page's own scope plus the search, before any filter. */
  const base = useMemo(() => {
    let list = PRODUCTS;
    if (region) list = list.filter((p) => p.region === region.slug);
    if (fixedCategory) list = list.filter((p) => p.category === fixedCategory);
    if (brand) list = list.filter((p) => p.brandSlug === brand.slug);
    if (q) {
      const order = searchSlugs(q);
      const rank = new Map(order.map((s, i) => [s, i]));
      list = list.filter((p) => rank.has(p.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!);
    }
    return list;
  }, [region, fixedCategory, brand, q]);

  const results = useMemo(() => {
    let list = base;
    if (type && !fixedCategory) list = list.filter((p) => p.category === type);
    if (condition) list = list.filter((p) => p.conditions.some((c) => slugifyCondition(c) === condition));
    if (brands.length && !brand) list = list.filter((p) => brands.includes(p.brandSlug));
    const pr = PRICES.find((x) => x.id === price);
    if (pr) list = list.filter(pr.test);
    if (stock) list = list.filter((p) => p.available);
    if (sort === ("relevance" as SortKey)) return list;
    return sortProducts(list, sort);
  }, [base, type, condition, brands.join(","), price, stock, sort, fixedCategory, brand]);

  const facets = useMemo(
    () => ({
      types: count(base, (p) => p.category),
      conditions: count(base, (p) => p.conditions.filter((c) => !/^post-surgical/i.test(c))).slice(0, 18),
      brands: count(base, (p) => p.brandSlug),
    }),
    [base],
  );

  const title = region
    ? `${region.name} braces and supports`
    : fixedCategory
      ? pluralCategory(categoryName(fixedCategory))
      : brand
        ? `${brand.name} products`
        : q
          ? `Results for "${q}"`
          : "Shop all products";
  const intro = region ? region.blurb : fixedCategory ? CATEGORY_NOTES[fixedCategory] : brand ? `${brand.count} ${brand.name} products, with sizes and prices.` : q ? undefined : "Every brace, support and recovery product we carry, in one place.";

  usePageMeta({
    title: invalid ? "Page not found" : title,
    description: intro ?? `Search results for ${q} at Medville Brace.`,
    noindex: Boolean(q) || invalid,
  });

  if (invalid) return <NotFound />;

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
    setShown(PAGE);
  };
  const toggleBrand = (slug: string) => {
    const next = brands.includes(slug) ? brands.filter((b) => b !== slug) : [...brands, slug];
    set("brand", next.join(","));
  };
  const active: { label: string; clear: () => void }[] = [];
  if (type && !fixedCategory) active.push({ label: categoryName(type), clear: () => set("type", null) });
  if (condition) active.push({ label: facets.conditions.find(([c]) => slugifyCondition(c) === condition)?.[0] ?? condition.replace(/-/g, " "), clear: () => set("condition", null) });
  if (!brand) for (const b of brands) active.push({ label: brandBySlug(b)?.name ?? b, clear: () => toggleBrand(b) });
  if (price) active.push({ label: PRICES.find((x) => x.id === price)?.label ?? price, clear: () => set("price", null) });
  if (stock) active.push({ label: "In stock", clear: () => set("stock", null) });

  const crumbs = region
    ? [{ label: "Shop", to: "/shop" }, { label: region.name }]
    : fixedCategory
      ? [{ label: "Shop", to: "/shop" }, { label: categoryName(fixedCategory) }]
      : brand
        ? [{ label: "Brands", to: "/brands" }, { label: brand.name }]
        : [{ label: "Shop" }];

  const Rail = (
    <div className="space-y-7">
      {!fixedCategory && (
        <fieldset>
          <legend className="font-display text-small font-semibold">Device type</legend>
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
            {facets.types.map(([slug, n]) => (
              <li key={slug}>
                <button type="button" onClick={() => set("type", type === slug ? null : slug)} aria-pressed={type === slug} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-small ${type === slug ? "bg-ink text-on-dark" : "hover:bg-surface"}`}>
                  <span>{categoryName(slug)}</span>
                  <span className={type === slug ? "text-on-dark-muted" : "text-ink-subtle"}>{n}</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {facets.conditions.length > 0 && (
        <fieldset>
          <legend className="font-display text-small font-semibold">Condition</legend>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {facets.conditions.map(([name]) => {
              const s = slugifyCondition(name);
              const on = condition === s;
              return (
                <button key={s} type="button" onClick={() => set("condition", on ? null : s)} aria-pressed={on} className={`rounded-full px-3 py-1.5 text-caption ${on ? "bg-ink text-on-dark" : "border border-line-strong text-ink hover:border-ink"}`}>
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      {!brand && facets.brands.length > 1 && (
        <fieldset>
          <legend className="font-display text-small font-semibold">Brand</legend>
          <ul className="mt-3 space-y-1">
            {facets.brands.map(([slug, n]) => (
              <li key={slug}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-small hover:bg-surface">
                  <input type="checkbox" checked={brands.includes(slug)} onChange={() => toggleBrand(slug)} className="h-4 w-4 accent-[#00293b]" />
                  <span className="flex-1">{BRANDS.find((b) => b.slug === slug)?.name}</span>
                  <span className="text-ink-subtle">{n}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <fieldset>
        <legend className="font-display text-small font-semibold">Price</legend>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {PRICES.map((p) => (
            <button key={p.id} type="button" onClick={() => set("price", price === p.id ? null : p.id)} aria-pressed={price === p.id} className={`rounded-md px-2.5 py-2 text-caption ${price === p.id ? "bg-ink text-on-dark" : "border border-line-strong hover:border-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2.5 text-small">
        <input type="checkbox" checked={stock} onChange={() => set("stock", stock ? null : "1")} className="h-4 w-4 accent-[#00293b]" />
        In stock only
      </label>
    </div>
  );

  return (
    <>
      <PageHero eyebrow={region ? "Shop by body region" : fixedCategory ? "Device type" : brand ? "Brand" : undefined} title={title} intro={intro} crumbs={crumbs}>
        {region && (
          <div className="mt-6 flex flex-wrap gap-2">
            {REGIONS.filter((r) => r.slug !== region.slug).map((r) => (
              <Link key={r.slug} to={`/shop/${r.slug}`} className="rounded-full border border-on-dark/30 px-3.5 py-1.5 text-caption text-on-dark-brand hover:border-brand-bright hover:text-on-dark">
                {r.name}
              </Link>
            ))}
          </div>
        )}
      </PageHero>

      {region && (
        <Container className="-mt-2 hidden lg:block">
          <div className="relative -mt-6 overflow-hidden rounded-card">
            <Photo name={region.photo} className="h-44 w-full object-cover object-[50%_40%]" priority />
            <div className="bg-banner-fade absolute inset-0" />
            <p className="absolute left-8 top-1/2 max-w-md -translate-y-1/2 font-display text-h3 font-semibold text-on-dark">{region.short}</p>
          </div>
        </Container>
      )}

      <Container className="grid gap-8 py-10 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-[170px] max-h-[calc(100vh-190px)] overflow-y-auto pb-6">{Rail}</div>
        </aside>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-small text-ink-muted" aria-live="polite">
              {results.length} product{results.length === 1 ? "" : "s"}
            </p>
            <button type="button" onClick={() => setSheet(true)} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-line-strong px-4 text-small font-semibold lg:hidden">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters{active.length ? ` (${active.length})` : ""}
            </button>
            <label className="ml-auto flex items-center gap-2 text-small">
              <span className="text-ink-muted">Sort</span>
              <select value={sort === ("relevance" as SortKey) ? "" : sort} onChange={(e) => set("sort", e.target.value || null)} className="min-h-[40px] rounded-full border border-line-strong bg-surface-raised px-3 text-small">
                {q && <option value="">Best match</option>}
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {active.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {active.map((a) => (
                <button key={a.label} type="button" onClick={a.clear} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-caption font-semibold text-ink hover:bg-ink hover:text-on-dark">
                  {a.label}
                  <X className="h-3.5 w-3.5" aria-label="Remove filter" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams();
                  if (q) next.set("q", q);
                  setSp(next, { replace: true });
                }}
                className="px-2 text-caption text-brand underline"
              >
                Clear all
              </button>
            </div>
          )}

          {results.length === 0 ? (
            <div className="mt-10 rounded-card border border-line bg-surface-raised p-8 text-center">
              <p className="font-display text-h3 font-semibold">No products match these filters.</p>
              <p className="mt-2 text-ink-muted">Try removing a filter, or let the Fit Finder suggest a starting point.</p>
              <div className="mt-5 flex justify-center gap-3">
                <Button to="/fit-finder">Open the Fit Finder</Button>
              </div>
            </div>
          ) : (
            <>
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {results.slice(0, shown).map((p, i) => (
                  <li key={p.slug} className="flex">
                    <div className="w-full">
                      <ProductCard product={p} eager={i < 4} />
                    </div>
                  </li>
                ))}
              </ul>
              {shown < results.length && (
                <div className="mt-10 flex flex-col items-center gap-2">
                  <p className="text-caption text-ink-subtle">
                    Showing {shown} of {results.length}
                  </p>
                  <Button variant="ghost" onClick={() => setShown((s) => s + PAGE * 2)}>
                    Show more products
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Container>

      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" className="anim-fade absolute inset-0 bg-brand-abyss/60" aria-label="Close filters" onClick={() => setSheet(false)} />
          <div className="anim-sheet-up absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-sheet bg-canvas shadow-sheet">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-h3 font-bold">Filters</p>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface" aria-label="Close filters" onClick={() => setSheet(false)}>
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">{Rail}</div>
            <div className="border-t border-line p-4">
              <Button className="w-full" onClick={() => setSheet(false)}>
                Show {results.length} products
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
