"use client";

import { useMemo, useState } from "react";
import ProductForm from "@/components/admin/ProductForm";
import StatusBadge from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { deleteProduct, setProductStatus, setProductStock, useStore } from "@/lib/store";
import { PRODUCT_STATUSES, type Product, type ProductStatus } from "@/lib/types";

export default function AdminProducts() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.products.filter(
      (p) =>
        (!status || p.status === status) &&
        (!term || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(term)),
    );
  }, [s.products, q, status]);

  return (
    <>
      <div className="row spread">
        <h1>Products</h1>
        <button className="btn" onClick={() => setEditing("new")}>+ Add product</button>
      </div>
      <div className="toolbar">
        <input placeholder="Search name, SKU, category…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {PRODUCT_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>{list.length} of {s.products.length}</span>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="empty">No products found.</td></tr>}
            {list.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    {p.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className="thumb" src={p.image} alt="" />
                      : <div className="thumb" />}
                    <div><strong>{p.name}</strong><div className="muted" style={{ fontSize: 12 }}>{p.sku}</div></div>
                  </div>
                </td>
                <td>{p.category}</td>
                <td>{money(p.price)}</td>
                <td>
                  <input type="number" min={0} value={p.stock} onChange={(e) => setProductStock(p.id, Number(e.target.value))} aria-label={`Stock for ${p.name}`} />
                </td>
                <td>
                  <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
                    <StatusBadge status={p.status} />
                    <select value={p.status} onChange={(e) => setProductStatus(p.id, e.target.value as ProductStatus)} aria-label={`Status for ${p.name}`}>
                      {PRODUCT_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  </div>
                </td>
                <td>
                  <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete "${p.name}"?`)) deleteProduct(p.id); }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <ProductForm product={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
