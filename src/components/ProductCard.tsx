import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import ProductImage from "./ProductImage";
import { categoryName, priceLabel, type Product } from "../data/catalog";
import { useStore } from "../lib/store";

export default function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const { compare, toggleCompare } = useStore();
  const comparing = compare.includes(product.slug);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised transition-shadow duration-(--duration-base) hover:shadow-raised-hover">
      <Link to={`/product/${product.slug}`} className="block" aria-label={`${product.brand} ${product.title}`}>
        <ProductImage product={product} eager={eager} className="aspect-square w-full" />
      </Link>
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        {product.renewed && <span className="rounded-full bg-ink px-2.5 py-1 text-caption font-semibold text-on-dark">Renewed</span>}
        {!product.available && <span className="rounded-full bg-surface px-2.5 py-1 text-caption font-semibold text-ink">Ask about stock</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-brand">{product.brand}</p>
        <h3 className="clamp-2 font-display text-[1rem] font-semibold leading-snug">
          <Link to={`/product/${product.slug}`} className="hover:underline">
            {product.title}
          </Link>
        </h3>
        <p className="text-caption text-ink-subtle">{categoryName(product.category)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <p className="font-display text-[1.05rem] font-bold">{priceLabel(product)}</p>
            {product.variantCount > 1 && <p className="whitespace-nowrap text-caption text-ink-subtle">{product.variantCount} options</p>}
          </div>
          <button
            type="button"
            onClick={() => toggleCompare(product.slug)}
            aria-pressed={comparing}
            aria-label={`Compare ${product.title}`}
            title="Compare"
            className={`inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center gap-1 rounded-full text-caption font-semibold transition-colors sm:px-3 ${
              comparing ? "bg-ink text-on-dark" : "border border-ink/25 text-ink hover:bg-ink hover:text-on-dark"
            }`}
          >
            {comparing ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">Compare</span>
          </button>
        </div>
      </div>
    </article>
  );
}
