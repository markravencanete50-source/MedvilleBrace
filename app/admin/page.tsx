"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { dateTime, money } from "@/lib/format";
import { cartTotal, effectiveCartStatus, useStore } from "@/lib/store";
import { PRODUCT_STATUSES } from "@/lib/types";

export default function Dashboard() {
  const s = useStore();
  const live = s.orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded");
  const revenue = live.reduce((n, o) => n + o.total, 0);
  const toFulfil = s.orders.filter((o) => ["pending", "paid", "processing"].includes(o.status)).length;
  const openCarts = s.carts.filter((c) => c.lines.length > 0 && effectiveCartStatus(c) !== "converted");
  const lowStock = s.products.filter((p) => p.status === "in_stock" && p.stock <= 5);

  return (
    <>
      <h1>Dashboard</h1>
      <div className="stats">
        <div className="card stat"><div className="n">{money(revenue)}</div><div className="l">Revenue (excl. cancelled/refunded)</div></div>
        <div className="card stat"><div className="n">{s.orders.length}</div><div className="l">Total orders</div></div>
        <div className="card stat"><div className="n">{toFulfil}</div><div className="l">Orders to fulfil</div></div>
        <div className="card stat"><div className="n">{openCarts.length}</div><div className="l">Open carts ({money(openCarts.reduce((n, c) => n + cartTotal(s, c), 0))})</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card pad">
          <div className="row spread"><h3>Catalogue by status</h3><Link href="/admin/products" className="btn btn-ghost btn-sm">Manage</Link></div>
          {PRODUCT_STATUSES.map((st) => (
            <div key={st.value} className="summary-row">
              <StatusBadge status={st.value} />
              <strong>{s.products.filter((p) => p.status === st.value).length}</strong>
            </div>
          ))}
        </div>
        <div className="card pad">
          <h3>Low stock (5 or fewer)</h3>
          {lowStock.length === 0 ? <p className="muted">Nothing running low.</p> : lowStock.map((p) => (
            <div key={p.id} className="summary-row"><span>{p.name}</span><strong>{p.stock} left</strong></div>
          ))}
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 20 }}>
        <div className="row spread"><h3>Recent orders</h3><Link href="/admin/orders" className="btn btn-ghost btn-sm">All orders</Link></div>
        {s.orders.length === 0 ? <p className="muted">No orders yet. Place a test order from the storefront.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {s.orders.slice(0, 5).map((o) => (
                <tr key={o.id}><td>{o.number}</td><td>{o.customer.name}</td><td>{dateTime(o.createdAt)}</td><td>{money(o.total)}</td><td><StatusBadge status={o.status} /></td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
