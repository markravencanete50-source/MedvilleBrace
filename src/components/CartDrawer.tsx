import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, X } from "lucide-react";
import Button from "./Button";
import ProductImage from "./ProductImage";
import { money, productBySlug } from "../data/catalog";
import { COMPANY } from "../data/site";
import { useStore, type CartLine } from "../lib/store";

export function LineOptions({ line }: { line: CartLine }) {
  if (!line.options.length) return null;
  return (
    <p className="text-caption text-ink-subtle">
      {line.options.map((o, i) => `${line.optionNames[i] ?? "Option"}: ${o}`).join(" · ")}
    </p>
  );
}

export function QtyStepper({ line }: { line: CartLine }) {
  const { setQty } = useStore();
  return (
    <div className="inline-flex items-center rounded-full border border-line-strong">
      <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface" aria-label="Decrease quantity" onClick={() => setQty(line.key, line.qty - 1)}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-7 text-center text-small font-semibold" aria-live="polite">
        {line.qty}
      </span>
      <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface" aria-label="Increase quantity" onClick={() => setQty(line.key, line.qty + 1)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, cartTotal, removeLine } = useStore();

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [cartOpen, setCartOpen]);

  if (!cartOpen) return null;
  const toFree = Math.max(0, COMPANY.freeShippingFrom - cartTotal);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your cart">
      <button type="button" className="anim-fade absolute inset-0 bg-brand-abyss/60" aria-label="Close cart" onClick={() => setCartOpen(false)} />
      <div className="anim-sheet-right absolute inset-y-0 right-0 flex w-[min(100vw,420px)] flex-col bg-canvas shadow-sheet">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-h3 font-bold">Your cart</h2>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface" aria-label="Close cart" onClick={() => setCartOpen(false)}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-ink-muted">Your cart is empty.</p>
            <Button to="/fit-finder" variant="primary" onClick={() => setCartOpen(false)}>
              Find the right fit
            </Button>
          </div>
        ) : (
          <>
            <div className="border-b border-line bg-brand-tint px-5 py-3 text-caption">
              {toFree > 0 ? (
                <>Add {money(toFree)} more for free standard shipping.</>
              ) : (
                <>Your order qualifies for free standard shipping.</>
              )}
            </div>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {cart.map((line) => {
                const p = productBySlug(line.slug);
                if (!p) return null;
                return (
                  <li key={line.key} className="flex gap-3 py-4">
                    <Link to={`/product/${p.slug}`} onClick={() => setCartOpen(false)} className="shrink-0 overflow-hidden rounded-md border border-line">
                      <ProductImage product={p} className="h-20 w-20" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-semibold uppercase tracking-[0.1em] text-brand">{p.brand}</p>
                      <Link to={`/product/${p.slug}`} onClick={() => setCartOpen(false)} className="clamp-2 text-small font-semibold hover:underline">
                        {p.title}
                      </Link>
                      <LineOptions line={line} />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QtyStepper line={line} />
                        <span className="font-display text-small font-bold">{money(line.price * line.qty)}</span>
                      </div>
                    </div>
                    <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-subtle hover:bg-surface hover:text-ink" aria-label={`Remove ${p.title}`} onClick={() => removeLine(line.key)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line bg-surface-raised p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-small text-ink-muted">Estimated subtotal</span>
                <span className="font-display text-h3 font-bold">{money(cartTotal)}</span>
              </div>
              <p className="mt-1 text-caption text-ink-subtle">We confirm sizes, stock and the final total before you pay.</p>
              <div className="mt-4 grid gap-2">
                <Button to="/request-order" onClick={() => setCartOpen(false)}>
                  Send order request
                </Button>
                <Button to="/cart" variant="ghost" onClick={() => setCartOpen(false)}>
                  View full cart
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
