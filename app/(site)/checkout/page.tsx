"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money, shippingFor } from "@/lib/format";
import { cartOf, cartTotal, isPurchasable, placeOrder, setCartEmail, useStore } from "@/lib/store";

const EMPTY = { name: "", email: "", phone: "", address: "", city: "", postcode: "" };

export default function CheckoutPage() {
  const s = useStore();
  const router = useRouter();
  const [c, setC] = useState(EMPTY);
  const [notes, setNotes] = useState("");
  const cart = cartOf(s, s.visitorCartId);
  const subtotal = cartTotal(s, cart);
  const shipping = shippingFor(subtotal);
  const ok = cart?.lines.every((l) => {
    const p = s.products.find((x) => x.id === l.productId);
    return p && isPurchasable(p) && p.stock >= l.qty;
  });

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="container section">
        <div className="card empty">
          <h2>Nothing to check out</h2>
          <Link href="/shop" className="btn">Browse products</Link>
        </div>
      </div>
    );
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC((v) => ({ ...v, [k]: e.target.value }));

  return (
    <div className="container section">
      <h1>Checkout</h1>
      <form
        className="split"
        onSubmit={(e) => {
          e.preventDefault();
          const order = placeOrder(c, notes);
          if (order) router.push(`/order/${order.id}`);
        }}
      >
        <div className="card pad">
          <h3>Delivery details</h3>
          <div className="form-grid">
            <label className="field">Full name<input required value={c.name} onChange={set("name")} /></label>
            <label className="field">Email<input required type="email" value={c.email} onChange={set("email")} onBlur={(e) => e.target.value && setCartEmail(e.target.value)} /></label>
            <label className="field">Phone<input value={c.phone} onChange={set("phone")} /></label>
            <label className="field full">Street address<input required value={c.address} onChange={set("address")} /></label>
            <label className="field">City<input required value={c.city} onChange={set("city")} /></label>
            <label className="field">Postcode / ZIP<input required value={c.postcode} onChange={set("postcode")} /></label>
            <label className="field full">Order notes (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </div>
          <div className="notice" style={{ marginTop: 16 }}>
            Payment isn't connected yet. Orders are saved as <strong>Pending</strong> for now.
          </div>
        </div>
        <div className="card pad">
          <h3>Summary</h3>
          {cart.lines.map((l) => {
            const p = s.products.find((x) => x.id === l.productId);
            return p ? (
              <div key={l.productId} className="summary-row">
                <span>{p.name} × {l.qty}</span><span>{money(p.price * l.qty)}</span>
              </div>
            ) : null;
          })}
          <div className="summary-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : money(shipping)}</span></div>
          <div className="summary-row total"><span>Total</span><span>{money(subtotal + shipping)}</span></div>
          {!ok && <p style={{ color: "var(--danger)", fontSize: 13 }}>Some items are unavailable. <Link href="/cart">Update your cart</Link>.</p>}
          <button className="btn" type="submit" disabled={!ok} style={{ width: "100%", marginTop: 12 }}>Place order</button>
        </div>
      </form>
    </div>
  );
}
