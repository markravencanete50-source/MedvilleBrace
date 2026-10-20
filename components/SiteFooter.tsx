import Link from "next/link";
import { CATEGORIES } from "@/lib/seed";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <div>
            <h4>Medville Brace</h4>
            <p style={{ margin: 0 }}>Supports and braces for recovery, work and sport.</p>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              {CATEGORIES.map((c) => (
                <li key={c}>
                  <Link href={`/shop?category=${encodeURIComponent(c)}`}>{c}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              <li><Link href="/cart">Your cart</Link></li>
              <li><Link href="/shop">All products</Link></li>
              <li><Link href="/admin">Admin</Link></li>
            </ul>
          </div>
        </div>
        <p style={{ marginTop: 28, fontSize: 12, opacity: 0.7 }}>
          Braces are not a substitute for professional medical advice. Consult your clinician before use.
        </p>
      </div>
    </footer>
  );
}
