"use client";

import { Fragment, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { dateTime, money } from "@/lib/format";
import { deleteOrder, setOrderNotes, setOrderStatus, useStore } from "@/lib/store";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

export default function AdminOrders() {
  const s = useStore();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.orders.filter(
      (o) =>
        (!status || o.status === status) &&
        (!term || `${o.number} ${o.customer.name} ${o.customer.email}`.toLowerCase().includes(term)),
    );
  }, [s.orders, status, q]);

  return (
    <>
      <h1>Orders</h1>
      <div className="toolbar">
        <input placeholder="Search order #, name, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Items</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="empty">No orders yet. Place a test order from the storefront.</td></tr>}
            {list.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td><strong>{o.number}</strong></td>
                  <td>{o.customer.name}<div className="muted" style={{ fontSize: 12 }}>{o.customer.email}</div></td>
                  <td>{dateTime(o.createdAt)}</td>
                  <td>{o.lines.reduce((n, l) => n + l.qty, 0)}</td>
                  <td>{money(o.total)}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
                      <StatusBadge status={o.status} />
                      <select value={o.status} onChange={(e) => setOrderStatus(o.id, e.target.value as OrderStatus)} aria-label={`Status for ${o.number}`}>
                        {ORDER_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    </div>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? "Hide" : "Details"}</button></td>
                </tr>
                {open === o.id && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--bg)" }}>
                      <div className="grid grid-2">
                        <div>
                          <strong>Items</strong>
                          {o.lines.map((l) => <div key={l.productId} className="summary-row"><span>{l.name} <span className="muted">({l.sku}) × {l.qty}</span></span><span>{money(l.price * l.qty)}</span></div>)}
                          <div className="summary-row"><span>Shipping</span><span>{money(o.shipping)}</span></div>
                          <div className="summary-row total"><span>Total</span><span>{money(o.total)}</span></div>
                        </div>
                        <div>
                          <strong>Ship to</strong>
                          <p style={{ margin: "6px 0" }}>{o.customer.name}<br />{o.customer.address}<br />{o.customer.city} {o.customer.postcode}<br />{o.customer.phone}</p>
                          <label className="field">Internal notes
                            <textarea value={o.notes} onChange={(e) => setOrderNotes(o.id, e.target.value)} />
                          </label>
                          <button className="btn btn-danger btn-sm" style={{ marginTop: 10 }} onClick={() => { if (window.confirm(`Delete order ${o.number}? This cannot be undone.`)) deleteOrder(o.id); }}>Delete order</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
