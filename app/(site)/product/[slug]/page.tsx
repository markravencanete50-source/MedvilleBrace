"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import ProductPhoto from "@/components/ProductPhoto";
import StatusBadge from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { addToCart, isPurchasable, useHydrated, useStore } from "@/lib/store";

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const s = useStore();
  const hydrated = useHydrated();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const p = s.products.find((x) => x.slug === slug && x.status !== "draft");
  if (!p) {
    return (
      <div className="container section">
        {hydrated ? (
          <div className="card empty">
            <h2>Product not found</h2>
            <Link href="/shop" className="btn">Back to shop</Link>
          </div>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    );
  }

  const buyable = isPurchasable(p);
  const max = Math.max(p.stock, 1);
  const lowStock = buyable && p.stock <= 5;

  return (
    <div className="container section">
      <p className="muted" style={{ fontSize: 13 }}>
        <Link href="/shop">Shop</Link> / <Link href={`/shop?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
      </p>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <ProductPhoto product={p} />
        </div>
        <div>
          <div className="row"><StatusBadge status={p.status} />{lowStock && <span className="badge b-pending">Only {p.stock} left</span>}</div>
          <h1 style={{ marginTop: 10 }}>{p.name}</h1>
          <div className="price" style={{ fontSize: 26 }}>
            {money(p.price)}
            {p.comparePrice ? <s>{money(p.comparePrice)}</s> : null}
          </div>
          <p>{p.description}</p>
          <p className="muted" style={{ fontSize: 13 }}>SKU {p.sku}</p>

          {buyable ? (
            <div className="row" style={{ marginTop: 16 }}>
              <div className="qty">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                <span>{qty}</span>
                <button onClick={() => setQty((q) => Math.min(max, q + 1))} aria-label="Increase">+</button>
              </div>
              <button
                className="btn"
                onClick={() => {
                  addToCart(p.id, qty);
                  setAdded(true);
                }}
              >
                Add to cart
              </button>
              {added && <Link href="/cart" className="btn btn-ghost">View cart</Link>}
            </div>
          ) : (
            <div className="notice" style={{ marginTop: 16 }}>
              {p.status === "coming_soon" && "This product is coming soon and can't be ordered yet."}
              {p.status === "pending" && "This product is pending and can't be ordered right now."}
              {(p.status === "sold_out" || p.status === "in_stock") && "This product is sold out."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
