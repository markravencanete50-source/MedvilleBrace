import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; to?: string };

export default function Breadcrumbs({ items, onDark = false }: { items: Crumb[]; onDark?: boolean }) {
  const tone = onDark ? "text-on-dark-muted" : "text-ink-subtle";
  return (
    <nav aria-label="Breadcrumb" className={`text-caption ${tone}`}>
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link to="/" className="hover:underline">
            Home
          </Link>
        </li>
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            {c.to ? (
              <Link to={c.to} className="hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className={onDark ? "text-on-dark" : "text-ink"}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
