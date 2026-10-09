import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass, LifeBuoy, Mail, Ruler, X } from "lucide-react";
import { COMPANY } from "../data/site";
import { useStore } from "../lib/store";

/*
  "Need help fitting?" A small floating button that opens a panel with the
  three ways to get a size right. It moves up when the compare tray is open.
*/
export default function FitHelp() {
  const [open, setOpen] = useState(false);
  const { compare } = useStore();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const lifted = compare.length > 0 && pathname !== "/compare";
  if (pathname === "/request-order") return null;

  return (
    <div className={`fixed right-4 z-30 transition-[bottom] duration-(--duration-base) ${lifted ? "bottom-24" : "bottom-4"}`}>
      {open && (
        <div className="anim-fade mb-3 w-[min(86vw,330px)] rounded-card border border-line bg-surface-raised p-5 shadow-overlay" role="dialog" aria-label="Fit help">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display font-semibold">Need help with a size?</p>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface" aria-label="Close fit help">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-small">
            <li>
              <Link to="/fit-finder" className="flex items-center gap-3 rounded-md p-2 hover:bg-brand-tint">
                <Compass className="h-5 w-5 text-brand" aria-hidden="true" />
                Answer four questions in the Fit Finder
              </Link>
            </li>
            <li>
              <Link to="/size-guide" className="flex items-center gap-3 rounded-md p-2 hover:bg-brand-tint">
                <Ruler className="h-5 w-5 text-brand" aria-hidden="true" />
                Read how to measure each body region
              </Link>
            </li>
            <li>
              <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent("Sizing question")}`} className="flex items-center gap-3 rounded-md p-2 hover:bg-brand-tint">
                <Mail className="h-5 w-5 text-brand" aria-hidden="true" />
                Email your measurements to our team
              </a>
            </li>
          </ul>
          <p className="mt-3 text-caption text-ink-subtle">Replies {COMPANY.hours.toLowerCase()}.</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Need help fitting?"
        className="ml-auto flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-brand-bright font-display text-small font-semibold text-ink shadow-cta hover:bg-ink hover:text-on-dark sm:px-5"
      >
        <LifeBuoy className="h-5 w-5" aria-hidden="true" />
        <span className="hidden sm:inline">Need help fitting?</span>
      </button>
    </div>
  );
}
