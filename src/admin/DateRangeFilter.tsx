import { CalendarDays } from "lucide-react";
import { Field } from "./ui";
import { addDays, monthBounds, prettyDay, today, ZONE_LABEL } from "./days";

export interface DateRange {
  from: string;
  to: string;
}

/* The last n days, today included, in the business time zone. */
export function recentRange(days: number): DateRange {
  const to = today();
  return { from: addDays(to, -Math.max(0, days - 1)), to };
}

export const thisMonth = (): DateRange => monthBounds(today().slice(0, 7));

export function rangeLabel(range: DateRange) {
  if (!range.from && !range.to) return "All time";
  if (range.from && range.to) return range.from === range.to ? prettyDay(range.from) : `${prettyDay(range.from)} to ${prettyDay(range.to)}`;
  return range.from ? `From ${prettyDay(range.from)}` : `Through ${prettyDay(range.to)}`;
}

export default function DateRangeFilter({
  value,
  onChange,
  allTime = true,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  allTime?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-line)", background: "var(--a-surface)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={17} aria-hidden="true" style={{ color: "var(--a-brand-text)" }} />
          <div>
            <p className="admin-label m-0">Calendar range</p>
            <p className="admin-help m-0">
              {rangeLabel(value)}. Days are counted in {ZONE_LABEL}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Date range shortcuts">
          <button type="button" className="admin-btn admin-btn-quiet admin-btn-sm" onClick={() => onChange({ from: today(), to: today() })}>
            Today
          </button>
          {[7, 30, 90].map((days) => (
            <button key={days} type="button" className="admin-btn admin-btn-quiet admin-btn-sm" onClick={() => onChange(recentRange(days))}>
              {days} days
            </button>
          ))}
          <button type="button" className="admin-btn admin-btn-quiet admin-btn-sm" onClick={() => onChange(thisMonth())}>
            This month
          </button>
          {allTime && (
            <button type="button" className="admin-btn admin-btn-quiet admin-btn-sm" onClick={() => onChange({ from: "", to: "" })}>
              All time
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From" htmlFor="date-range-from">
          <input id="date-range-from" className="admin-input" type="date" value={value.from} max={value.to || undefined} required={!allTime} onChange={(event) => (event.target.value || allTime) && onChange({ ...value, from: event.target.value })} />
        </Field>
        <Field label="To" htmlFor="date-range-to">
          <input id="date-range-to" className="admin-input" type="date" value={value.to} min={value.from || undefined} required={!allTime} onChange={(event) => (event.target.value || allTime) && onChange({ ...value, to: event.target.value })} />
        </Field>
      </div>
    </div>
  );
}
