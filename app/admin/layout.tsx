"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { resetDemoData } from "@/lib/store";

/**
 * PLACEHOLDER front-end gate only. The passcode below ships in the client bundle and
 * is not security. Replace with real authentication when the backend is connected.
 */
const DEMO_PASSCODE = "medville-admin";
const SESSION_KEY = "mb:admin";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/carts", label: "Carts" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let ok = false;
    try {
      ok = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    setAuthed(ok);
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: 96 }}>
        <form
          className="card pad"
          onSubmit={(e) => {
            e.preventDefault();
            if (code === DEMO_PASSCODE) {
              try {
                window.sessionStorage.setItem(SESSION_KEY, "1");
              } catch {
                /* ignore */
              }
              setAuthed(true);
            } else setError(true);
          }}
        >
          <div className="wordmark" style={{ marginBottom: 8 }}>Medville <span>Brace</span></div>
          <h2>Admin sign in</h2>
          <label className="field">
            Passcode
            <input type="password" value={code} onChange={(e) => { setCode(e.target.value); setError(false); }} autoFocus />
          </label>
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>Incorrect passcode.</p>}
          <button className="btn" type="submit" style={{ width: "100%", marginTop: 14 }}>Sign in</button>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Development passcode: <code>{DEMO_PASSCODE}</code>. Real login comes with the backend.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <aside>
        <Link href="/admin" className="wordmark">Medville <span>Brace</span></Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>{l.label}</Link>
        ))}
        <div className="spacer" />
        <Link href="/">View storefront ↗</Link>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (window.confirm("Reset all products, orders and carts to the sample data?")) resetDemoData();
          }}
        >
          Reset sample data
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
            setAuthed(false);
            setCode("");
          }}
        >
          Sign out
        </a>
      </aside>
      <main>{children}</main>
    </div>
  );
}
