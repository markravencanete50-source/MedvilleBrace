import { useId, useMemo, useState } from "react";
import { addDays, prettyDay } from "./days";

/*
  Dashboard charts, the same hand-drawn set as the Medville Diabetes
  dashboard: SVG and HTML rather than a charting library, because the four
  shapes needed here weigh less than any library.

  Every chart carries a single series in --a-chart, so there is no legend: the
  labels carry identity and one hue carries magnitude. Every chart also
  offers its numbers as a table, so nothing depends on seeing colour or shape.
*/

const AXIS = "var(--a-text-faint)";
const GRID = "var(--a-line)";
const MARK = "var(--a-chart)";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number, cents = false) => (cents ? usdCents : usd).format(n);

export function ChartFrame({
  title,
  note,
  children,
  table,
  actions,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  table: { columns: string[]; rows: string[][] };
  actions?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
          {note && (
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--a-text-faint)" }}>
              {note}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {actions}
          <button
            type="button"
            className="text-[12px] font-semibold underline underline-offset-2"
            style={{ color: "var(--a-text-muted)" }}
            aria-expanded={showTable}
            aria-controls={id}
            onClick={() => setShowTable((open) => !open)}
          >
            {showTable ? "Show chart" : "Show numbers"}
          </button>
        </div>
      </figcaption>

      {showTable ? (
        <div id={id} className="admin-table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
          <table className="admin-table admin-table-keep">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

/* ---- hero numbers ---- */

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="admin-card admin-card-pad">
      <div className="admin-stat">
        <span>{label}</span>
        <b>{value}</b>
        {hint && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{hint}</span>}
      </div>
    </div>
  );
}

/* ---- change over time ----
   A line over a soft fill, markers only where the reader is pointing, and a
   crosshair that reports the exact day. Clicking a day can open it. */

export interface TrendPoint {
  day: string;
  value: number;
}

export function TrendChart({
  points,
  format = (n) => String(n),
  noun = ["order", "orders"],
  onPick,
}: {
  points: TrendPoint[];
  format?: (n: number) => string;
  noun?: [string, string];
  onPick?: (day: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const width = 720;
  const height = 220;
  const pad = { top: 14, right: 14, bottom: 26, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...points.map((p) => p.value));
  const step = max <= 5 ? 1 : Math.pow(10, Math.floor(Math.log10(max))) / 2;
  const niceMax = max <= 5 ? 5 : Math.ceil(max / step) * step;

  const x = (index: number) => pad.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => pad.top + plotH - (value / niceMax) * plotH;

  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1)},${pad.top + plotH} L${x(0)},${pad.top + plotH} Z` : "";
  const ticks = [0, niceMax / 2, niceMax];

  const indexAt = (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    if (points.length < 2) return points.length ? 0 : null;
    const index = Math.round(((px - pad.left) / plotW) * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, index));
  };

  if (!points.length) {
    return (
      <p className="py-12 text-center text-[14px]" style={{ color: "var(--a-text-faint)" }}>
        No orders yet.
      </p>
    );
  }

  const active = hover === null ? null : points[hover];
  const describe = (p: TrendPoint) => `${prettyDay(p.day, { weekday: "short", day: "numeric", month: "short" })}: ${format(p.value)}${noun[0] ? ` ${p.value === 1 ? noun[0] : noun[1]}` : ""}`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height: "auto", touchAction: "pan-y", cursor: onPick ? "pointer" : undefined }}
        role="img"
        aria-label={`${noun[1] || "Value"} per day. Highest day, ${format(max)}.`}
        onPointerMove={(event) => setHover(indexAt(event))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const index = indexAt(event);
          if (onPick && index !== null) onPick(points[index].day);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MARK} stopOpacity="0.22" />
            <stop offset="100%" stopColor={MARK} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth="1" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill={AXIS}>
              {format(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={MARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.length <= 31 &&
          points.map((point, index) => (
            <circle key={point.day} cx={x(index)} cy={y(point.value)} r="3.5" fill={MARK} stroke="var(--a-surface)" strokeWidth="2" />
          ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke={MARK} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r="5.5" fill={MARK} stroke="var(--a-surface)" strokeWidth="2" />
          </g>
        )}
        <text x={pad.left} y={height - 7} fontSize="11" fill={AXIS}>
          {prettyDay(points[0].day, { day: "numeric", month: "short" })}
        </text>
        {points.length > 1 && (
          <text x={width - pad.right} y={height - 7} fontSize="11" fill={AXIS} textAnchor="end">
            {prettyDay(points[points.length - 1].day, { day: "numeric", month: "short" })}
          </text>
        )}
      </svg>
      <p className="mt-1 text-center text-[12.5px]" style={{ color: "var(--a-text-muted)", minHeight: "1.2em" }} aria-live="polite">
        {active ? describe(active) : onPick ? "Point at the chart to read a day. Click to open it in the calendar." : "Point at the chart to read a day."}
      </p>
    </div>
  );
}

/* ---- ordered buckets ----
   Upright columns for things with a natural order, such as the hours of a
   day or the days of a week. Labels are thinned so they never collide. */

export function ColumnChart({ values, labels, every = 1, highlight }: { values: number[]; labels: string[]; every?: number; highlight?: number }) {
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? highlight ?? null;
  return (
    <div>
      <div className="admin-columns" style={{ "--cols": values.length } as React.CSSProperties} onPointerLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={labels[i]} className="admin-column" onPointerEnter={() => setHover(i)} aria-hidden="true">
            <span className="admin-column-bar" data-active={shown === i} style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="admin-columns admin-columns-labels" style={{ "--cols": values.length } as React.CSSProperties} aria-hidden="true">
        {labels.map((l, i) => (
          <span key={l}>{i % every === 0 ? l : ""}</span>
        ))}
      </div>
      <p className="mt-1 text-center text-[12.5px]" style={{ color: "var(--a-text-muted)", minHeight: "1.2em" }} aria-live="polite">
        {shown !== null ? `${labels[shown]}: ${values[shown]} ${values[shown] === 1 ? "order" : "orders"}` : "Point at a column to read it."}
      </p>
    </div>
  );
}

/* ---- magnitude across named categories ---- */

export interface BarItem {
  label: string;
  value: number;
  display?: string;
}

export function BarList({ items }: { items: BarItem[] }) {
  const max = useMemo(() => Math.max(1, ...items.map((item) => item.value)), [items]);
  if (!items.length) {
    return (
      <p className="py-10 text-center text-[14px]" style={{ color: "var(--a-text-faint)" }}>
        Nothing to show yet.
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map((item) => (
        <li key={item.label} className="py-[3px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13.5px] font-medium" title={item.label}>{item.label}</span>
            <span className="flex-none text-[13px] font-semibold tabular-nums">{item.display ?? item.value}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden" style={{ background: "var(--a-surface-2)", borderRadius: "0 4px 4px 0" }}>
            <div style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, height: "100%", background: MARK, borderRadius: "0 4px 4px 0" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Turns a count map into the ordered list a BarList wants, folding a long tail into one row. */
export function toBarItems(counts: Record<string, number>, options: { limit?: number; label?: (key: string) => string; display?: (n: number) => string } = {}) {
  const { limit = 8, label = (key: string) => key, display } = options;
  const sorted = Object.entries(counts)
    .map(([key, value]) => ({ label: label(key), value, display: display?.(value) }))
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit).reduce((sum, item) => sum + item.value, 0);
  return tail ? [...head, { label: "All others", value: tail, display: display?.(tail) }] : head;
}

/* Every day of the range, quiet days included, so a gap reads as a dip rather than vanishing from the axis. */
export function toTrendPoints(byDay: Record<string, { orders: number; value: number }>, from: string, to: string, metric: "orders" | "value"): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let d = from; d <= to && points.length < 400; d = addDays(d, 1)) points.push({ day: d, value: byDay[d]?.[metric] ?? 0 });
  return points;
}
