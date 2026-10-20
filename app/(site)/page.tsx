"use client";

import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { CATEGORIES } from "@/lib/seed";
import { useStore, visibleProducts } from "@/lib/store";

export default function HomePage() {
  const s = useStore();
  const products = visibleProducts(s);
  const featured = products.filter((p) => p.featured).slice(0, 4);
  const upcoming = products.filter((p) => p.status === "coming_soon").slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Support that keeps you moving.</h1>
          <p>
            Braces and supports for recovery, work and sport, chosen for fit and comfort and shipped
            straight to your door.
          </p>
          <div className="row" style={{ marginTop: 24 }}>
            <Link href="/shop" className="btn">Shop all braces</Link>
            <Link href="/shop?category=Knee" className="btn btn-ghost">Knee supports</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Shop by area</h2>
          <div className="chips" style={{ marginTop: 12 }}>
            {CATEGORIES.map((c) => (
              <Link key={c} href={`/shop?category=${encodeURIComponent(c)}`} className="chip">
                {c}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="row spread">
              <h2>Best sellers</h2>
              <Link href="/shop" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            <div className="grid grid-4">
              {featured.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <h2>Coming soon</h2>
            <div className="grid grid-4">
              {upcoming.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container grid grid-2">
          {[
            ["Free shipping over $75", "Flat $7.95 on smaller orders."],
            ["Easy sizing help", "Not sure of your size? Check each product page before you order."],
            ["Clinician-minded picks", "Everyday supports and post-injury options in one catalogue."],
          ].map(([t, d]) => (
            <div key={t} className="card pad">
              <h3>{t}</h3>
              <p className="muted" style={{ margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
