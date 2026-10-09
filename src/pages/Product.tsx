import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Info, Plus, Ruler, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import Container from "../components/Container";
import Breadcrumbs from "../components/Breadcrumbs";
import Button from "../components/Button";
import ProductImage from "../components/ProductImage";
import ProductCard from "../components/ProductCard";
import NotFound from "./NotFound";
import { categoryName, imageSrc, loadDetail, money, priceLabel, productBySlug, related, slugifyCondition, type ProductDetail } from "../data/catalog";
import { regionBySlug } from "../data/taxonomy";
import { COMPANY } from "../data/site";
import { useStore } from "../lib/store";
import { usePageMeta } from "../lib/usePageMeta";

export default function ProductPage() {
  const { slug = "" } = useParams();
  const product = productBySlug(slug);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(1);
  const [added, setAdded] = useState(false);
  const { addToCart, compare, toggleCompare, pushRecent, recent } = useStore();

  usePageMeta({
    title: product ? `${product.brand} ${product.title}` : "Product not found",
    description: product?.summary,
    image: product && product.images ? imageSrc(product, 1, "lg") : undefined,
    noindex: !product,
  });

  useEffect(() => {
    if (!product) return;
    let live = true;
    setDetail(null);
    setFailed(false);
    setPhoto(1);
    setQty(1);
    pushRecent(product.slug);
    loadDetail(product.slug).then((d) => {
      if (!live) return;
      if (!d) return setFailed(true);
      setDetail(d);
      const first = d.variants.find((v) => v.a) ?? d.variants[0];
      setPicked(first ? [...first.o] : []);
    });
    return () => {
      live = false;
    };
  }, [product, pushRecent]);

  const variant = useMemo(() => {
    if (!detail) return undefined;
    if (!detail.optionNames.length) return detail.variants[0];
    return detail.variants.find((v) => v.o.every((x, i) => x === picked[i]));
  }, [detail, picked]);

  const relatedList = useMemo(() => (product ? related(product) : []), [product]);

  if (!product) return <NotFound />;

  const region = regionBySlug(product.region);
  const comparing = compare.includes(product.slug);

  /* An option value is offered when some variant has it alongside the values already picked for earlier options. */
  const valuesFor = (i: number) => {
    if (!detail) return [];
    const seen = new Map<string, boolean>();
    for (const v of detail.variants) {
      const fits = v.o.slice(0, i).every((x, j) => x === picked[j]);
      if (!fits) continue;
      seen.set(v.o[i], (seen.get(v.o[i]) ?? false) || v.a);
    }
    return [...seen.entries()];
  };

  const choose = (i: number, value: string) => {
    if (!detail) return;
    const next = [...picked];
    next[i] = value;
    /* Keep later choices when they still exist with this value; otherwise take the first that does. */
    for (let j = i + 1; j < detail.optionNames.length; j++) {
      const ok = detail.variants.some((v) => v.o.slice(0, j).every((x, k) => x === next[k]) && v.o[j] === next[j]);
      if (!ok) {
        const v = detail.variants.find((x) => x.o.slice(0, j).every((y, k) => y === next[k]));
        next[j] = v?.o[j] ?? next[j];
      }
    }
    setPicked(next);
  };

  const add = () => {
    if (!detail || !variant) return;
    addToCart({ slug: product.slug, sku: variant.s, options: variant.o, optionNames: detail.optionNames, price: variant.p }, qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  const recentList = recent.filter((s) => s !== product.slug).map(productBySlug).filter(Boolean).slice(0, 4);

  return (
    <>
      <div className="border-b border-line bg-surface-raised">
        <Container className="py-4">
          <Breadcrumbs
            items={[
              { label: region?.name ?? "Shop", to: `/shop/${product.region}` },
              { label: categoryName(product.category), to: `/category/${product.category}` },
              { label: product.title },
            ]}
          />
        </Container>
      </div>

      <Container className="grid gap-10 py-8 lg:grid-cols-[1.05fr_1fr] lg:py-12">
        <section aria-label="Photos" className="lg:sticky lg:top-[180px] lg:self-start">
          <div className="overflow-hidden rounded-card border border-line">
            <ProductImage product={product} n={photo} size="lg" eager className="aspect-square w-full" />
          </div>
          {product.images > 1 && (
            <ul className="mt-3 flex gap-3">
              {Array.from({ length: product.images }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                  <button type="button" onClick={() => setPhoto(n)} aria-label={`Show photo ${n}`} aria-pressed={photo === n} className={`overflow-hidden rounded-md border-2 ${photo === n ? "border-ink" : "border-line hover:border-line-strong"}`}>
                    <ProductImage product={product} n={n} className="h-20 w-20" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Product details">
          <Link to={`/brands/${product.brandSlug}`} className="font-display text-caption font-semibold uppercase tracking-[0.16em] text-brand hover:underline">
            {product.brand}
          </Link>
          <h1 className="mt-2 text-h2 font-bold leading-tight">{product.title}</h1>
          {product.subtitle && <p className="mt-2 text-body-lg text-ink-muted">{product.subtitle}</p>}

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <p className="font-display text-h2 font-bold">{variant ? money(variant.p) : priceLabel(product)}</p>
            {product.renewed && <span className="rounded-full bg-ink px-3 py-1 text-caption font-semibold text-on-dark">Renewed</span>}
            {variant && !variant.a && <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold">We will confirm stock</span>}
          </div>

          <p className="mt-4 max-w-prose text-ink-muted">{product.summary}</p>

          <div className="mt-6 space-y-5">
            {!detail && !failed && <div className="h-24 animate-pulse rounded-lg bg-surface" aria-label="Loading options" />}
            {failed && <p className="rounded-lg bg-brand-tint p-4 text-small">The options for this product could not load. Refresh the page, or email us and we will help.</p>}
            {detail?.optionNames.map((name, i) => (
              <fieldset key={name + i}>
                <legend className="text-small font-semibold">
                  {name}: <span className="font-normal text-ink-muted">{picked[i]}</span>
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {valuesFor(i).map(([value, inStock]) => {
                    const on = picked[i] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => choose(i, value)}
                        aria-pressed={on}
                        className={`min-h-[42px] rounded-md px-3.5 text-small ${on ? "bg-ink text-on-dark" : "border border-line-strong bg-surface-raised hover:border-ink"} ${inStock ? "" : "opacity-60"}`}
                        title={inStock ? undefined : "Stock to be confirmed"}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          {detail?.measurement && (
            <details className="mt-5 rounded-lg border border-line bg-surface-raised p-4">
              <summary className="flex cursor-pointer items-center gap-2 font-display text-small font-semibold">
                <Ruler className="h-4 w-4 text-brand" aria-hidden="true" />
                How to measure for this product
              </summary>
              <p className="mt-3 text-small leading-relaxed text-ink-muted">{detail.measurement}</p>
              <Link to="/size-guide" className="mt-2 inline-block text-small text-brand underline">
                Read the full size guide
              </Link>
            </details>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="sr-only" htmlFor="qty">
              Quantity
            </label>
            <select id="qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="min-h-[48px] rounded-full border border-line-strong bg-surface-raised px-4 text-small">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Qty {n}
                </option>
              ))}
            </select>
            <Button onClick={add} disabled={!variant} className="min-w-[200px] flex-1 sm:flex-none">
              {added ? <Check className="h-5 w-5" aria-hidden="true" /> : <ShoppingBag className="h-5 w-5" aria-hidden="true" />}
              {added ? "Added to cart" : "Add to cart"}
            </Button>
            <Button variant="ghost" onClick={() => toggleCompare(product.slug)}>
              {comparing ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {comparing ? "In comparison" : "Compare"}
            </Button>
          </div>

          <ul className="mt-6 grid gap-3 rounded-card bg-brand-tint p-5 text-small sm:grid-cols-3">
            <li className="flex gap-2.5">
              <Ruler className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              Size checked by a person before you pay
            </li>
            <li className="flex gap-2.5">
              <Truck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              Free shipping over ${COMPANY.freeShippingFrom}
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              Manufacturer warranty
            </li>
          </ul>

          {detail && detail.features.length > 0 && (
            <section className="mt-10">
              <h2 className="text-h3 font-bold">Features</h2>
              <ul className="mt-4 space-y-3">
                {detail.features.map((f, i) => (
                  <li key={i} className="flex gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <p className="text-small leading-relaxed text-ink-muted">
                      {f.label && <strong className="font-semibold text-ink">{f.label}. </strong>}
                      {f.text}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail && (detail.indications.length > 0 || detail.conditions.length > 0) && (
            <section className="mt-10">
              <h2 className="text-h3 font-bold">Commonly used for</h2>
              {detail.conditions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.conditions.slice(0, 14).map((c) => (
                    <Link key={c} to={`/shop/${product.region}?condition=${slugifyCondition(c)}`} className="rounded-full border border-line-strong px-3 py-1.5 text-caption hover:border-ink">
                      {c}
                    </Link>
                  ))}
                </div>
              )}
              {detail.indications.length > 0 && (
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-small text-ink-muted">
                  {detail.indications.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
              <p className="mt-4 flex gap-2 text-caption text-ink-subtle">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                These are typical uses, not a recommendation for you. Ask your clinician which device suits your recovery.
              </p>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-h3 font-bold">Details</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-small">
              <dt className="text-ink-subtle">Brand</dt>
              <dd>{product.brand}</dd>
              <dt className="text-ink-subtle">Type</dt>
              <dd>{categoryName(product.category)}</dd>
              <dt className="text-ink-subtle">Body region</dt>
              <dd>{region?.name}</dd>
              {variant?.s && (
                <>
                  <dt className="text-ink-subtle">SKU</dt>
                  <dd className="break-all">{variant.s}</dd>
                </>
              )}
              {(detail?.hcpcs.length ?? 0) > 0 && (
                <>
                  <dt className="text-ink-subtle">Billing code</dt>
                  <dd>
                    {detail!.hcpcs.join(", ")}{" "}
                    <Link to="/policies/insurance" className="text-brand underline">
                      What this means
                    </Link>
                  </dd>
                </>
              )}
            </dl>
          </section>
        </section>
      </Container>

      {relatedList.length > 0 && (
        <section className="border-t border-line bg-soft-band py-14">
          <Container>
            <h2 className="text-h2 font-bold">Often considered alongside</h2>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
              {relatedList.slice(0, 4).map((p) => (
                <li key={p.slug}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {recentList.length > 0 && (
        <section className="py-14">
          <Container>
            <h2 className="text-h3 font-bold">Recently viewed</h2>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
              {recentList.map((p) => (
                <li key={p!.slug}>
                  <ProductCard product={p!} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}
    </>
  );
}
