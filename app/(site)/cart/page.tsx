"use client";

import Link from "next/link";
import ProductPhoto from "@/components/ProductPhoto";
import { FREE_SHIPPING_OVER, money, shippingFor } from "@/lib/format";
import { cartOf, cartTotal, isPurchasable, setCartQty, useStore } from "@/lib/store";

export default function CartPage() {
  const s = useStore();
  const cart = cartOf(s, s.visitorCartId);
  const lines = (cart?.lines ?? []).flatMap((l) => {
    const p = s.products.find((x) => x.id === l.productId);
    return p ? [{ p, qty: l.qty }] : [];
  });
  const subtotal = cartTotal(s, cart);
  const shipping = shippingFor(subtotal);
  const blocked = lines.some(({ p }) => !isPurchasable(p));

  if (lines.length === 0) {
    return (
      <div className="container section">
        <div className="card empty">
          <h2>Your cart is empty</h2>
          <Link href="/shop" className="btn">Start shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <h1>Your cart</h1>
      <div className="split">
        <div className="card">
          {lines.map(({ p, qty }) => (
            <div key={p.id} className="row spread pad" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ flex: 1, minWidth: 220 }}>
                <div style={{ width: 80 }}><ProductPhoto product={p} /></div>
                <div>
                  <Link href={`/product/${p.slug}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                  <div className="muted" style={{ fontSize: 13 }}>{money(p.price)} each</div>
                  {!isPurchasable(p) && <div style={{ color: "var(--danger)", fontSize: 13 }}>No longer available. Remove to continue.</div>}
                </div>
              </div>
              <div className="qty">
                <button onClick={() => setCartQty(p.id, qty - 1)} aria-label="Decrease">−</button>
                <span>{qty}</span>
                <button onClick={() => setCartQty(p.id, qty + 1)} aria-label="Increase">+</button>
              </div>
              <div style={{ width: 80, textAlign: "right", fontWeight: 600 }}>{money(p.price * qty)}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setCartQty(p.id, 0)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="card pad">
          <h3>Order summary</h3>
          <div className="summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="summary-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : money(shipping)}</span></div>
          {shipping > 0 && <p className="muted" style={{ fontSize: 12 }}>Add {money(FREE_SHIPPING_OVER - subtotal)} more for free shipping.</p>}
          <div className="summary-row total"><span>Total</span><span>{money(subtotal + shipping)}</span></div>
          {blocked ? (
            <button className="btn" disabled style={{ width: "100%", marginTop: 12 }}>Checkout</button>
          ) : (
            <Link href="/checkout" className="btn" style={{ width: "100%", marginTop: 12 }}>Checkout</Link>
          )}
        </div>
      </div>
    </div>
  );
}
