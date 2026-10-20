"use client";

import Link from "next/link";
import { cartCount, cartOf, useStore } from "@/lib/store";

export default function SiteHeader() {
  const s = useStore();
  const count = cartCount(cartOf(s, s.visitorCartId));
  return (
    <>
      <div className="announce">Free shipping on orders over $75</div>
      <header className="site-header">
        <div className="container inner">
          <Link href="/" className="wordmark">
            Medville <span>Brace</span>
          </Link>
          <nav className="nav">
            <Link href="/shop">Shop all</Link>
            <Link href="/shop?category=Knee">Knee</Link>
            <Link href="/shop?category=Back%20%26%20Core">Back</Link>
            <Link href="/shop?category=Ankle%20%26%20Foot">Ankle</Link>
            <Link href="/shop?category=Wrist%20%26%20Hand">Wrist</Link>
          </nav>
          <Link href="/cart" className="btn btn-ghost btn-sm cart-pill">
            Cart
            {count > 0 && <span className="count">{count}</span>}
          </Link>
        </div>
      </header>
    </>
  );
}
