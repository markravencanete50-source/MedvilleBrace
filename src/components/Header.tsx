import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Compass, Menu, Search, ShoppingBag, X } from "lucide-react";
import Container from "./Container";
import Logo from "./Logo";
import Photo from "./Photo";
import { REGIONS } from "../data/taxonomy";
import { regionFacets } from "../data/catalog";
import { COMPANY } from "../data/site";
import { useStore } from "../lib/store";

/*
  Header: a navy strip with the shipping and fit-help promises, the main bar
  (logo, search, Fit Finder, cart) and a body-region bar whose panels list the
  device types and the common conditions for that region. On a phone the
  region bar folds into a drawer.
*/
const FACETS = Object.fromEntries(REGIONS.map((r) => [r.slug, regionFacets(r.slug)]));

function SearchBox({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        navigate(`/shop?q=${encodeURIComponent(q.trim())}`);
        onDone?.();
      }}
      className="relative w-full"
    >
      <label htmlFor={autoFocus ? "search-mobile" : "search-desktop"} className="sr-only">
        Search products
      </label>
      <input
        id={autoFocus ? "search-mobile" : "search-desktop"}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by product, brand, condition or code"
        className="h-12 w-full rounded-full border border-line-strong bg-surface-raised pl-5 pr-12 text-small text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
      />
      <button type="submit" aria-label="Search" className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-ink text-on-dark hover:bg-brand-bright hover:text-ink">
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}

export default function Header() {
  const { cartCount, setCartOpen } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerRegion, setDrawerRegion] = useState<string | null>(null);
  const location = useLocation();
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setOpen(null);
    setDrawer(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const openPanel = (slug: string) => {
    window.clearTimeout(closeTimer.current);
    setOpen(slug);
  };
  const closeSoon = () => {
    closeTimer.current = window.setTimeout(() => setOpen(null), 140);
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-ink text-on-dark-brand">
        <Container className="flex h-9 items-center justify-between gap-4 text-caption">
          <p className="truncate">
            Free standard shipping on confirmed orders over ${COMPANY.freeShippingFrom}
            <span className="hidden sm:inline"> · Sizing checked by a person before you pay</span>
          </p>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Help">
            <Link to="/policies/how-ordering-works" className="hover:text-on-dark">How ordering works</Link>
            <Link to="/clinicians" className="hover:text-on-dark">For clinicians</Link>
            <Link to="/contact" className="hover:text-on-dark">Contact</Link>
          </nav>
        </Container>
      </div>

      <div className="border-b border-line bg-canvas/95 backdrop-blur">
        <Container className="flex h-[72px] items-center gap-4">
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-surface lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
          <Logo />
          <div className="mx-auto hidden w-full max-w-xl lg:block">
            <SearchBox />
          </div>
          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <Link to="/fit-finder" className="hidden min-h-[44px] items-center gap-2 rounded-full px-4 font-display text-small font-semibold text-ink hover:bg-surface md:inline-flex">
              <Compass className="h-5 w-5" aria-hidden="true" />
              Fit Finder
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-4 font-display text-small font-semibold text-on-dark hover:bg-brand-bright hover:text-ink"
              aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            >
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-bright px-1.5 text-caption text-ink">{cartCount}</span>
            </button>
          </div>
        </Container>

        <nav aria-label="Shop by body region" className="relative hidden border-t border-line lg:block" onMouseLeave={closeSoon}>
          <Container className="flex items-center gap-1">
            {REGIONS.map((r) => (
              <div key={r.slug} onMouseEnter={() => openPanel(r.slug)}>
                <button
                  type="button"
                  aria-expanded={open === r.slug}
                  aria-controls={`panel-${r.slug}`}
                  onClick={() => setOpen(open === r.slug ? null : r.slug)}
                  onFocus={() => openPanel(r.slug)}
                  className={`inline-flex h-12 items-center gap-1 rounded-t-md px-3 font-display text-small font-semibold ${open === r.slug ? "text-brand" : "text-ink hover:text-brand"}`}
                >
                  {r.name}
                  <ChevronDown className={`h-4 w-4 transition-transform ${open === r.slug ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
              </div>
            ))}
            <NavLink to="/brands" className="ml-auto inline-flex h-12 items-center px-3 font-display text-small font-semibold text-ink hover:text-brand">Brands</NavLink>
            <NavLink to="/guides" className="inline-flex h-12 items-center px-3 font-display text-small font-semibold text-ink hover:text-brand">Guides</NavLink>
          </Container>

          {open && (
            <div id={`panel-${open}`} className="anim-fade absolute inset-x-0 top-full border-y border-line bg-surface-raised shadow-overlay" onMouseEnter={() => openPanel(open)}>
              {(() => {
                const r = REGIONS.find((x) => x.slug === open)!;
                const f = FACETS[open];
                return (
                  <Container className="grid grid-cols-[1.1fr_1fr_0.9fr] gap-10 py-8">
                    <div>
                      <p className="font-display text-caption font-semibold uppercase tracking-[0.16em] text-brand">Device type</p>
                      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
                        {f.categories.slice(0, 12).map((c) => (
                          <li key={c.slug}>
                            <Link to={`/shop/${r.slug}?type=${c.slug}`} className="flex justify-between gap-2 rounded-md py-1.5 text-small text-ink hover:text-brand">
                              <span>{c.name}</span>
                              <span className="text-ink-subtle">{c.count}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <Link to={`/shop/${r.slug}`} className="mt-4 inline-flex font-display text-small font-semibold text-brand hover:underline">
                        All {r.name.toLowerCase()} products ({f.count})
                      </Link>
                    </div>
                    <div>
                      <p className="font-display text-caption font-semibold uppercase tracking-[0.16em] text-brand">Common conditions</p>
                      <ul className="mt-3 space-y-1">
                        {f.conditions.slice(0, 8).map((c) => (
                          <li key={c.slug}>
                            <Link to={`/shop/${r.slug}?condition=${c.slug}`} className="block py-1.5 text-small text-ink hover:text-brand">
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link to={`/shop/${r.slug}`} className="group relative block overflow-hidden rounded-card">
                      <Photo name={r.photo} decorative className="h-full max-h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <div className="bg-photo-fade absolute inset-0" />
                      <p className="absolute inset-x-4 bottom-4 text-small text-on-dark">{r.short}</p>
                    </Link>
                  </Container>
                );
              })()}
            </div>
          )}
        </nav>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="anim-fade absolute inset-0 bg-brand-abyss/60" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div className="anim-sheet-left absolute inset-y-0 left-0 flex w-[min(88vw,380px)] flex-col overflow-y-auto bg-canvas shadow-sheet">
            <div className="flex items-center justify-between border-b border-line p-4">
              <Logo />
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface" aria-label="Close menu" onClick={() => setDrawer(false)}>
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4">
              <SearchBox autoFocus onDone={() => setDrawer(false)} />
            </div>
            <Link to="/fit-finder" className="mx-4 mb-2 flex items-center gap-3 rounded-lg bg-ink p-4 text-on-dark">
              <Compass className="h-5 w-5 text-brand-bright" aria-hidden="true" />
              <span>
                <span className="block font-display font-semibold">Fit Finder</span>
                <span className="text-caption text-on-dark-muted">Four questions to a short list</span>
              </span>
            </Link>
            <p className="px-4 pt-4 font-display text-caption font-semibold uppercase tracking-[0.16em] text-brand">Shop by body region</p>
            <ul className="px-2 pb-2">
              {REGIONS.map((r) => (
                <li key={r.slug} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    aria-expanded={drawerRegion === r.slug}
                    onClick={() => setDrawerRegion(drawerRegion === r.slug ? null : r.slug)}
                    className="flex min-h-[52px] w-full items-center justify-between px-2 font-display font-semibold"
                  >
                    {r.name}
                    <ChevronDown className={`h-5 w-5 transition-transform ${drawerRegion === r.slug ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {drawerRegion === r.slug && (
                    <ul className="pb-3 pl-2">
                      <li>
                        <Link to={`/shop/${r.slug}`} className="block py-2 text-small font-semibold text-brand">
                          All {r.name.toLowerCase()} products
                        </Link>
                      </li>
                      {FACETS[r.slug].categories.slice(0, 10).map((c) => (
                        <li key={c.slug}>
                          <Link to={`/shop/${r.slug}?type=${c.slug}`} className="block py-2 text-small text-ink">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <ul className="mt-auto space-y-1 border-t border-line p-4 text-small">
              {[
                ["/brands", "Brands"],
                ["/guides", "Recovery guides"],
                ["/size-guide", "Size guide"],
                ["/compare", "Compare products"],
                ["/clinicians", "For clinicians"],
                ["/policies/how-ordering-works", "How ordering works"],
                ["/contact", "Contact"],
              ].map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="block py-2 text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
