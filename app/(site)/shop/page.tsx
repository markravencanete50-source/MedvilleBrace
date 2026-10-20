"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { CATEGORIES } from "@/lib/seed";
import { useStore, visibleProducts } from "@/lib/store";
import { PRODUCT_STATUSES } from "@/lib/types";

function Shop() {
  const s = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return visibleProducts(s).filter(
      (p) =>
        (!category || p.category === category) &&
        (!status || p.status === status) &&
        (!term || `${p.name} ${p.summary} ${p.category}`.toLowerCase().includes(term)),
    );
  }, [s, category, q, status]);

  return (
    <div className="container section">
      <h1>{category || "All products"}</h1>
      <div className="chips" style={{ marginBottom: 16 }}>
        <button className={`chip ${!category ? "on" : ""}`} onClick={() => router.push("/shop")}>All</button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`chip ${category === c ? "on" : ""}`}
            onClick={() => router.push(`/shop?category=${encodeURIComponent(c)}`)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input placeholder="Search braces…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any availability</option>
          {PRODUCT_STATUSES.filter((x) => x.value !== "draft").map((x) => (
            <option key={x.value} value={x.value}>{x.label}</option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>{list.length} products</span>
      </div>
      {list.length === 0 ? (
        <div className="card empty">No products match your filters.</div>
      ) : (
        <div className="grid grid-4">
          {list.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="container section muted">Loading…</div>}>
      <Shop />
    </Suspense>
  );
}
