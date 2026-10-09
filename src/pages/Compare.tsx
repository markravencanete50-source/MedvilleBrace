import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import Button from "../components/Button";
import ProductImage from "../components/ProductImage";
import { categoryName, loadDetail, priceLabel, productBySlug, type ProductDetail } from "../data/catalog";
import { regionBySlug } from "../data/taxonomy";
import { useStore } from "../lib/store";
import { usePageMeta } from "../lib/usePageMeta";

export default function Compare() {
  usePageMeta({ title: "Compare products", noindex: true });
  const { compare, toggleCompare } = useStore();
  const items = compare.map(productBySlug).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const [details, setDetails] = useState<Record<string, ProductDetail | null>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    for (const slug of compare) {
      if (requested.current.has(slug)) continue;
      requested.current.add(slug);
      loadDetail(slug).then((d) => setDetails((x) => ({ ...x, [slug]: d })));
    }
  }, [compare]);

  const sizes = (slug: string) => {
    const d = details[slug];
    if (!d) return "Loading";
    const i = d.optionNames.findIndex((n) => /size/i.test(n));
    if (i < 0) return "One size";
    return [...new Set(d.variants.map((v) => v.o[i]))].join(", ");
  };

  const rows: [string, (slug: string) => React.ReactNode][] = [
    ["Price", (s) => priceLabel(productBySlug(s)!)],
    ["Brand", (s) => productBySlug(s)!.brand],
    ["Type", (s) => categoryName(productBySlug(s)!.category)],
    ["Body region", (s) => regionBySlug(productBySlug(s)!.region)?.name],
    ["Sizes", sizes],
    ["Commonly used for", (s) => (details[s]?.conditions ?? productBySlug(s)!.conditions).slice(0, 6).join(", ") || "Not listed"],
    ["Billing code", (s) => productBySlug(s)!.hcpcs.join(", ") || "None listed"],
    [
      "Key features",
      (s) =>
        details[s] ? (
          <ul className="list-disc space-y-1 pl-4">
            {details[s]!.features.slice(0, 4).map((f, i) => (
              <li key={i}>{f.label ?? f.text}</li>
            ))}
          </ul>
        ) : (
          "Loading"
        ),
    ],
  ];

  return (
    <>
      <PageHero title="Compare products" intro="Side by side, up to three at a time." crumbs={[{ label: "Compare" }]} />
      <Container className="py-10">
        {items.length < 2 ? (
          <div className="rounded-card border border-line bg-surface-raised p-10 text-center">
            <p className="font-display text-h3 font-semibold">{items.length ? "Add one more product to compare." : "Nothing to compare yet."}</p>
            <p className="mt-2 text-ink-muted">Use the Compare button on any product card or product page.</p>
            <Button to="/shop" className="mt-6">
              Browse products
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-small">
              <thead>
                <tr>
                  <th className="w-40" />
                  {items.map((p) => (
                    <th key={p.slug} className="px-3 pb-4 text-left align-top font-normal">
                      <div className="relative">
                        <button type="button" onClick={() => toggleCompare(p.slug)} aria-label={`Remove ${p.title}`} className="absolute right-1 top-1 z-10 grid h-8 w-8 place-items-center rounded-full bg-ink text-on-dark">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <Link to={`/product/${p.slug}`} className="block overflow-hidden rounded-card border border-line">
                          <ProductImage product={p} className="aspect-square w-full" />
                        </Link>
                        <Link to={`/product/${p.slug}`} className="mt-3 block font-display font-semibold hover:underline">
                          {p.title}
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fn]) => (
                  <tr key={label}>
                    <th scope="row" className="border-t border-line py-3 pr-3 text-left align-top font-semibold">
                      {label}
                    </th>
                    {items.map((p) => (
                      <td key={p.slug} className="border-t border-line px-3 py-3 align-top text-ink-muted">
                        {fn(p.slug)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </>
  );
}
