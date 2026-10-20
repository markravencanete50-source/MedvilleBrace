"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/seed";
import { saveProduct } from "@/lib/store";
import { PRODUCT_STATUSES, type Product, type ProductStatus } from "@/lib/types";

interface Draft {
  name: string;
  category: string;
  sku: string;
  price: string;
  comparePrice: string;
  stock: string;
  status: ProductStatus;
  summary: string;
  description: string;
  image: string;
  featured: boolean;
}

function toDraft(p?: Product): Draft {
  return {
    name: p?.name ?? "",
    category: p?.category ?? CATEGORIES[0],
    sku: p?.sku ?? "",
    price: p ? String(p.price) : "",
    comparePrice: p?.comparePrice ? String(p.comparePrice) : "",
    stock: p ? String(p.stock) : "0",
    status: p?.status ?? "draft",
    summary: p?.summary ?? "",
    description: p?.description ?? "",
    image: p?.image ?? "",
    featured: p?.featured ?? false,
  };
}

export default function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const [d, setD] = useState<Draft>(toDraft(product));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const price = Number(d.price);
          const compare = Number(d.comparePrice);
          saveProduct({
            id: product?.id,
            name: d.name.trim(),
            category: d.category,
            sku: d.sku.trim() || `MB-${Date.now().toString(36).toUpperCase()}`,
            price: Number.isFinite(price) ? price : 0,
            comparePrice: compare > 0 ? compare : undefined,
            stock: Math.max(0, Math.floor(Number(d.stock)) || 0),
            status: d.status,
            summary: d.summary.trim(),
            description: d.description.trim(),
            image: d.image.trim() || undefined,
            featured: d.featured,
          });
          onClose();
        }}
      >
        <div className="row spread">
          <h2>{product ? "Edit product" : "Add product"}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="form-grid">
          <label className="field full">Name<input required value={d.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="field">Category
            <select value={d.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">SKU<input value={d.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Auto-generated if blank" /></label>
          <label className="field">Price (USD)<input required type="number" min={0} step="0.01" value={d.price} onChange={(e) => set("price", e.target.value)} /></label>
          <label className="field">Compare-at price<input type="number" min={0} step="0.01" value={d.comparePrice} onChange={(e) => set("comparePrice", e.target.value)} /></label>
          <label className="field">Stock<input type="number" min={0} value={d.stock} onChange={(e) => set("stock", e.target.value)} /></label>
          <label className="field">Status
            <select value={d.status} onChange={(e) => set("status", e.target.value as ProductStatus)}>
              {PRODUCT_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label} — {x.hint}</option>)}
            </select>
          </label>
          <label className="field full">Short summary<input value={d.summary} onChange={(e) => set("summary", e.target.value)} /></label>
          <label className="field full">Description<textarea value={d.description} onChange={(e) => set("description", e.target.value)} /></label>
          <label className="field full">Image URL<input type="url" value={d.image} onChange={(e) => set("image", e.target.value)} placeholder="https://… (use a photo you have rights to)" /></label>
          <label className="row full" style={{ fontSize: 14 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={d.featured} onChange={(e) => set("featured", e.target.checked)} />
            Show in "Best sellers" on the home page
          </label>
        </div>
        <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn">{product ? "Save changes" : "Create product"}</button>
        </div>
      </form>
    </div>
  );
}
