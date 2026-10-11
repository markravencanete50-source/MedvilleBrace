import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import CompareTray from "./CompareTray";
import FitHelp from "./FitHelp";
import { productBySlug } from "../data/catalog";
import { useStore } from "../lib/store";

/* A product the team has hidden since the visitor saved it leaves their cart and comparison list. */
function DropRemovedProducts() {
  const { cart, compare, removeLine, toggleCompare } = useStore();
  useEffect(() => {
    for (const line of cart) if (!productBySlug(line.slug)) removeLine(line.key);
    for (const slug of compare) if (!productBySlug(slug)) toggleCompare(slug);
  }, [cart, compare, removeLine, toggleCompare]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-on-dark focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <ScrollToTop />
      <DropRemovedProducts />
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <CompareTray />
      <FitHelp />
    </div>
  );
}
