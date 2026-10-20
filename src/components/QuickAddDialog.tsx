import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ShoppingBag, X } from "lucide-react";
import Button from "./Button";
import ProductImage from "./ProductImage";
import { loadDetail, money, priceLabel, type Product, type ProductDetail } from "../data/catalog";
import { useStore } from "../lib/store";
import { useVariantPicker } from "../lib/useVariantPicker";

/*
  Pick a size, side or colour for a product without leaving the list it was
  found in, then put it in the cart. It offers the same choices as the product
  page (useVariantPicker) and loads the same detail file, only when opened.
*/
export default function QuickAddDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addToCart } = useStore();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [qty, setQty] = useState(1);
  const { picked, variant, valuesFor, choose } = useVariantPicker(detail);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let live = true;
    loadDetail(product.slug).then((d) => {
      if (!live) return;
      if (d) setDetail(d);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [product.slug]);

  /* Escape closes it, the page behind stays still, and focus returns to the button that opened it. */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, []);

  const add = () => {
    if (!detail || !variant) return;
    addToCart({ slug: product.slug, sku: variant.s, options: variant.o, optionNames: detail.optionNames, price: variant.p }, qty);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Choose options for ${product.title}`}>
      <button type="button" className="anim-fade absolute inset-0 bg-brand-abyss/60" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="anim-sheet-up relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-canvas p-5 shadow-sheet sm:rounded-card">
        <div className="flex items-start gap-4">
          <div className="w-20 shrink-0 overflow-hidden rounded-md border border-line">
            <ProductImage product={product} className="aspect-square w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold uppercase tracking-[0.12em] text-brand">{product.brand}</p>
            <h2 className="clamp-2 font-display text-[1.05rem] font-semibold leading-snug">{product.title}</h2>
            <p className="mt-1 font-display text-h3 font-bold">{variant ? money(variant.p) : priceLabel(product)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-surface">
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {!detail && !failed && <div className="h-24 animate-pulse rounded-lg bg-surface" aria-label="Loading options" />}
          {failed && (
            <p className="rounded-lg bg-brand-tint p-4 text-small">
              The options for this product could not load. <Link to={`/product/${product.slug}`} onClick={onClose} className="underline">Open the product page</Link> to choose them there.
            </p>
          )}
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
          {variant && !variant.a && <p className="text-caption font-semibold">We will confirm stock for this one before you pay.</p>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="quick-qty">
            Quantity
          </label>
          <select id="quick-qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="min-h-[48px] rounded-full border border-line-strong bg-surface-raised px-4 text-small">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Qty {n}
              </option>
            ))}
          </select>
          <Button onClick={add} disabled={!variant} className="min-w-[180px] flex-1">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            Add to cart
          </Button>
        </div>
        <Link to={`/product/${product.slug}`} onClick={onClose} className="mt-4 inline-block text-small text-brand underline">
          See the full details
        </Link>
      </div>
    </div>,
    document.body,
  );
}
