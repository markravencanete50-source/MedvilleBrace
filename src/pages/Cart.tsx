import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import Container from "../components/Container";
import PageHero from "../components/PageHero";
import Button from "../components/Button";
import ProductImage from "../components/ProductImage";
import { LineOptions, QtyStepper } from "../components/CartDrawer";
import { money, productBySlug } from "../data/catalog";
import { COMPANY } from "../data/site";
import { useStore } from "../lib/store";
import { usePageMeta } from "../lib/usePageMeta";

export default function Cart() {
  usePageMeta({ title: "Your cart", noindex: true });
  const { cart, cartTotal, removeLine } = useStore();
  const toFree = Math.max(0, COMPANY.freeShippingFrom - cartTotal);

  return (
    <>
      <PageHero title="Your cart" crumbs={[{ label: "Cart" }]} />
      <Container className="py-10">
        {cart.length === 0 ? (
          <div className="rounded-card border border-line bg-surface-raised p-10 text-center">
            <p className="font-display text-h3 font-semibold">Your cart is empty.</p>
            <p className="mt-2 text-ink-muted">Start with a body region, or answer four questions in the Fit Finder.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button to="/fit-finder">Open the Fit Finder</Button>
              <Button to="/shop" variant="ghost">
                Browse products
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
              {cart.map((line) => {
                const p = productBySlug(line.slug);
                if (!p) return null;
                return (
                  <li key={line.key} className="flex gap-4 p-4 sm:p-5">
                    <Link to={`/product/${p.slug}`} className="shrink-0 overflow-hidden rounded-md border border-line">
                      <ProductImage product={p} className="h-24 w-24 sm:h-28 sm:w-28" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-semibold uppercase tracking-[0.1em] text-brand">{p.brand}</p>
                      <Link to={`/product/${p.slug}`} className="font-display font-semibold hover:underline">
                        {p.title}
                      </Link>
                      <LineOptions line={line} />
                      {line.sku && <p className="text-caption text-ink-subtle">SKU {line.sku}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <QtyStepper line={line} />
                        <span className="text-small text-ink-muted">{money(line.price)} each</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <span className="font-display font-bold">{money(line.price * line.qty)}</span>
                      <button type="button" onClick={() => removeLine(line.key)} className="inline-flex items-center gap-1 text-caption text-ink-subtle hover:text-ink">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <aside className="h-fit rounded-card border border-line bg-surface-raised p-6 lg:sticky lg:top-[180px]">
              <h2 className="font-display text-h3 font-bold">Summary</h2>
              <dl className="mt-4 space-y-2 text-small">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Estimated subtotal</dt>
                  <dd className="font-semibold">{money(cartTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Standard shipping</dt>
                  <dd>{toFree > 0 ? "Confirmed by email" : "Free"}</dd>
                </div>
              </dl>
              {toFree > 0 && <p className="mt-3 rounded-md bg-brand-tint p-3 text-caption">Add {money(toFree)} more for free standard shipping.</p>}
              <p className="mt-4 text-caption text-ink-subtle">Sending a request does not charge you. We confirm sizes, stock, shipping and the final total by email first.</p>
              <Button to="/request-order" className="mt-5 w-full">
                Send order request
              </Button>
              <Link to="/policies/how-ordering-works" className="mt-3 block text-center text-caption text-brand underline">
                How ordering works
              </Link>
            </aside>
          </div>
        )}
      </Container>
    </>
  );
}
