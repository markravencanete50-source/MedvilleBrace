"use client";

import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { dateTime, money } from "@/lib/format";
import { cartCount, cartTotal, deleteCart, effectiveCartStatus, removeCartLine, setCartStatus, useStore } from "@/lib/store";

export default function AdminCarts() {
  const s = useStore();
  const [filter, setFilter] = useState("");
  const carts = [...s.carts]
    .filter((c) => !filter || effectiveCartStatus(c) === filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <h1>Carts</h1>
      <p className="muted">Carts idle for over an hour without checking out show as abandoned.</p>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All carts</option>
          <option value="active">Active</option>
          <option value="abandoned">Abandoned</option>
          <option value="converted">Converted to order</option>
        </select>
      </div>
      {carts.length === 0 ? (
        <div className="card empty">No carts yet. Add a product to the cart on the storefront to see it here.</div>
      ) : (
        <div className="grid">
          {carts.map((c) => (
            <div key={c.id} className="card pad">
              <div className="row spread">
                <div className="row">
                  <strong>{c.customerEmail ?? "Anonymous visitor"}</strong>
                  <StatusBadge status={effectiveCartStatus(c)} />
                </div>
                <span className="muted" style={{ fontSize: 13 }}>Updated {dateTime(c.updatedAt)}</span>
              </div>
              {c.lines.length === 0 ? <p className="muted">Empty cart.</p> : c.lines.map((l) => {
                const p = s.products.find((x) => x.id === l.productId);
                return (
                  <div key={l.productId} className="summary-row">
                    <span>{p?.name ?? "Removed product"} × {l.qty}</span>
                    <span className="row" style={{ gap: 10 }}>
                      {p ? money(p.price * l.qty) : "—"}
                      <button className="btn btn-ghost btn-sm" onClick={() => removeCartLine(c.id, l.productId)}>Remove</button>
                    </span>
                  </div>
                );
              })}
              <div className="row spread" style={{ marginTop: 10 }}>
                <strong>{cartCount(c)} items · {money(cartTotal(s, c))}</strong>
                <div className="row">
                  {c.status !== "converted" && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setCartStatus(c.id, effectiveCartStatus(c) === "abandoned" ? "active" : "abandoned")}>
                      {effectiveCartStatus(c) === "abandoned" ? "Mark active" : "Mark abandoned"}
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("Delete this cart?")) deleteCart(c.id); }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
