import { Link } from "react-router-dom";

/*
  Medville Brace logo: an original mark (two brace uprights, two straps and a
  hinge) beside a two-line wordmark. It shares only the family palette and
  type with the Medville Diabetes logo, never its artwork.
*/
export function Mark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="13" className="fill-ink" />
      <path d="M16 9c-4 5-4 25 0 30" fill="none" className="stroke-brand-bright" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M32 9c4 5 4 25 0 30" fill="none" className="stroke-brand-bright" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M15.5 15.5h17M15.5 32.5h17" className="stroke-on-dark" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="24" r="4.6" className="fill-on-dark" />
      <circle cx="24" cy="24" r="1.8" className="fill-ink" />
    </svg>
  );
}

export default function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Medville Brace home">
      <Mark className="h-10 w-10 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className={`font-display text-[1.32rem] font-bold tracking-tight ${onDark ? "text-on-dark" : "text-ink"}`}>Medville</span>
        <span className={`mt-1 font-display text-[0.68rem] font-semibold tracking-[0.34em] ${onDark ? "text-on-dark-accent" : "text-brand"}`}>BRACE</span>
      </span>
    </Link>
  );
}
