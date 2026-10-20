"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { useHydrated, useStore } from "@/lib/store";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const s = useStore();
  const hydrated = useHydrated();
  const o = s.orders.find((x) => x.id === id);

  if (!o) {
    return (
      <div className="container section">
        <div className="card empty">{hydrated ? <><h2>Order not found</h2><Link href="/shop" className="btn">Back to shop</Link></> : "Loading…"}</div>
      </div>
    );
  }
  return (
    <div className="container section" style={{ maxWidth: 720 }}>
      <div className="card pad">
        <h1>Thank you, {o.customer.name.split(" ")[0]}!</h1>
        <p className="muted">Order <strong>{o.number}</strong> was received. <StatusBadge status={o.status} /></p>
        {o.lines.map((l) => (
          <div key={l.productId} className="summary-row"><span>{l.name} × {l.qty}</span><span>{money(l.price * l.qty)}</span></div>
        ))}
        <div className="summary-row"><span>Shipping</span><span>{o.shipping === 0 ? "Free" : money(o.shipping)}</span></div>
        <div className="summary-row total"><span>Total</span><span>{money(o.total)}</span></div>
        <Link href="/shop" className="btn" style={{ marginTop: 16 }}>Continue shopping</Link>
      </div>
    </div>
  );
}
