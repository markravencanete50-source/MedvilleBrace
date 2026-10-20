import { useEffect, useRef, useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import Button from "./Button";
import QuickAddDialog from "./QuickAddDialog";
import { loadDetail, type Product } from "../data/catalog";
import { PRODUCT_STATUS_LABEL } from "../data/content";
import { useStore } from "../lib/store";

/*
  The cart action for a product shown in a list (cards, the compare table).

  - A product with one option goes into the cart straight away: its single
    size is read from the same detail file the product page uses.
  - A product with several sizes or sides cannot be added without a choice, so
    the button opens a pop-up to pick one (QuickAddDialog), with a link to the
    product page for the full details.
  - A product the dashboard has closed (sold out, pending, coming soon) shows
    that label and cannot be added.
*/
export default function AddToCartButton({ product, className = "" }: { product: Product; className?: string }) {
  const { addToCart } = useStore();
  const [state, setState] = useState<"idle" | "busy" | "added" | "failed">("idle");
  const [picking, setPicking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (product.status) {
    return (
      <Button size="sm" variant="soft" disabled className={className}>
        {PRODUCT_STATUS_LABEL[product.status]}
      </Button>
    );
  }

  if (product.variantCount > 1) {
    return (
      <>
        <Button size="sm" variant="ghost" onClick={() => setPicking(true)} className={className} ariaLabel={`Choose options for ${product.title}`}>
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Choose options
        </Button>
        {picking && <QuickAddDialog product={product} onClose={() => setPicking(false)} />}
      </>
    );
  }

  if (state === "failed") {
    return (
      <Button to={`/product/${product.slug}`} size="sm" variant="ghost" className={className} ariaLabel={`Open ${product.title}`}>
        Open product
      </Button>
    );
  }

  const add = async () => {
    setState("busy");
    const detail = await loadDetail(product.slug);
    const variant = detail?.variants[0];
    if (!detail || !variant) {
      setState("failed");
      return;
    }
    addToCart({ slug: product.slug, sku: variant.s, options: variant.o, optionNames: detail.optionNames, price: variant.p });
    setState("added");
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <Button size="sm" onClick={() => void add()} disabled={state === "busy"} className={className} ariaLabel={`Add ${product.title} to cart`}>
      {state === "added" ? <Check className="h-4 w-4" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
      {state === "added" ? "Added" : state === "busy" ? "Adding" : "Add to cart"}
    </Button>
  );
}
