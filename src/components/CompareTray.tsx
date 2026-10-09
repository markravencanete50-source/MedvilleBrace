import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import ProductImage from "./ProductImage";
import { productBySlug } from "../data/catalog";
import { COMPARE_LIMIT, useStore } from "../lib/store";

/* A slim tray along the bottom edge while products are picked for comparison. */
export default function CompareTray() {
  const { compare, toggleCompare, clearCompare } = useStore();
  const { pathname } = useLocation();
  if (!compare.length || pathname === "/compare") return null;
  const items = compare.map((s) => productBySlug(s)).filter(Boolean);
  return (
    <div className="anim-sheet-up fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 shadow-overlay backdrop-blur" role="region" aria-label="Products to compare">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <p className="hidden font-display text-small font-semibold sm:block">
          Compare ({compare.length}/{COMPARE_LIMIT})
        </p>
        <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto no-scrollbar">
          {items.map((p) => (
            <li key={p!.slug} className="relative shrink-0">
              <ProductImage product={p!} className="h-14 w-14 rounded-md border border-line" />
              <button type="button" onClick={() => toggleCompare(p!.slug)} aria-label={`Remove ${p!.title} from comparison`} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-on-dark">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={clearCompare} className="min-h-[40px] px-3 text-small text-ink-muted hover:text-ink">
          Clear
        </button>
        <Link
          to="/compare"
          className={`inline-flex min-h-[44px] items-center rounded-full px-5 font-display text-small font-semibold ${compare.length > 1 ? "bg-ink text-on-dark hover:bg-brand-bright hover:text-ink" : "pointer-events-none bg-surface text-ink-subtle"}`}
          aria-disabled={compare.length < 2}
        >
          Compare now
        </Link>
      </div>
    </div>
  );
}
