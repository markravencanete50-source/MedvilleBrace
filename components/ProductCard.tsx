"use client";

import Link from "next/link";
import { money } from "@/lib/format";
import { addToCart, isPurchasable } from "@/lib/store";
import type { Product } from "@/lib/types";
import ProductPhoto from "./ProductPhoto";
import StatusBadge from "./StatusBadge";

export default function ProductCard({ product }: { product: Product }) {
  const buyable = isPurchasable(product);
  return (
    <div className="card product-card">
      <Link href={`/product/${product.slug}`}>
        <div style={{ position: "relative" }}>
          <ProductPhoto product={product} />
          {product.status !== "in_stock" && (
            <div style={{ position: "absolute", top: 10, left: 10 }}>
              <StatusBadge status={product.status} />
            </div>
          )}
        </div>
      </Link>
      <div className="body">
        <span className="cat">{product.category}</span>
        <Link href={`/product/${product.slug}`} style={{ fontWeight: 600 }}>
          {product.name}
        </Link>
        <span className="muted" style={{ fontSize: 13 }}>{product.summary}</span>
        <div style={{ flex: 1 }} />
        <div className="row spread">
          <span className="price">
            {money(product.price)}
            {product.comparePrice ? <s>{money(product.comparePrice)}</s> : null}
          </span>
          <button className="btn btn-sm" disabled={!buyable} onClick={() => addToCart(product.id)}>
            {buyable ? "Add to cart" : labelFor(product)}
          </button>
        </div>
      </div>
    </div>
  );
}

function labelFor(p: Product): string {
  if (p.status === "coming_soon") return "Coming soon";
  if (p.status === "pending") return "Pending";
  return "Sold out";
}
