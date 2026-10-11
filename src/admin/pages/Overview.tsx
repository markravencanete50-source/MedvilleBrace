import { useEffect, useMemo, useState } from "react";
import { ORDER_STATUS_LABEL, type OrderStats } from "../api";
import { fetchFigures, FiguresError } from "../figures";
import { isFirebaseConfigured } from "../../lib/firebaseConfig";
import { Banner, Card, Empty, PageHeader, Spinner } from "../ui";
import { BarList, ChartFrame, ColumnChart, money, StatTile, toBarItems, toTrendPoints, TrendChart } from "../charts";
import DateRangeFilter, { rangeLabel, recentRange, type DateRange } from "../DateRangeFilter";
import { formatDateTime, HOUR_LABELS, prettyDay, WEEKDAY_LABELS, ZONE_LABEL } from "../days";
import { categoryName, productBySlug } from "../../data/catalog";

/*
  How order requests are arriving: totals for a range, a line per day, and
  where the requests come from. The figures are read from Firestore, where
  the AWS figures function keeps one document per day holding counts and sums
  only. No names or addresses are read to draw this page, and it never asks
  the order service for anything.
*/

export default function Overview({ openDay }: { openDay: (day: string) => void }) {
  const [range, setRange] = useState<DateRange>(() => recentRange(30));
  const [metric, setMetric] = useState<"orders" | "value">("orders");
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const connected = isFirebaseConfigured();

  useEffect(() => {
    if (!connected || !range.from || !range.to) return;
    let live = true;
    setStats(null);
    setError("");
    fetchFigures({ from: range.from, to: range.to })
      .then((result) => {
        if (!live) return;
        setStats(result.stats);
        setUpdatedAt(result.updatedAt);
      })
      .catch((problem: unknown) => live && setError(problem instanceof FiguresError ? problem.message : "That did not work."));
    return () => {
      live = false;
    };
  }, [connected, range]);

  const trend = useMemo(() => (stats ? toTrendPoints(stats.byDay, range.from, range.to, metric) : []), [stats, range, metric]);

  /* Brand and category come from the site's own catalog, keyed by the product address the order stored. */
  const { brands, categories } = useMemo(() => {
    const brands: Record<string, number> = {};
    const categories: Record<string, number> = {};
    for (const p of stats?.products ?? []) {
      const product = productBySlug(p.slug);
      const brand = product?.brand ?? "Other";
      const category = product ? categoryName(product.category) : "Other";
      brands[brand] = (brands[brand] ?? 0) + p.units;
      categories[category] = (categories[category] ?? 0) + p.units;
    }
    return { brands, categories };
  }, [stats]);

  const header = <PageHeader title="Overview" lede="How order requests are arriving, what people ask for, and where each request stands." />;
  if (!connected) {
    return (
      <>
        {header}
        <Card>
          <Empty>Figures will appear here once Firebase is connected. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID, then rebuild.</Empty>
        </Card>
      </>
    );
  }

  const rangeControl = (
    <Card className="mb-5">
      <DateRangeFilter value={range} onChange={setRange} allTime={false} />
    </Card>
  );
  if (error) {
    return (
      <>
        {header}
        {rangeControl}
        <Banner tone="warn">{error}</Banner>
      </>
    );
  }
  if (!stats) {
    return (
      <>
        {header}
        {rangeControl}
        <Card>
          <Spinner label="Counting orders" />
        </Card>
      </>
    );
  }

  const selected = rangeLabel(range);
  const busiest = Object.entries(stats.byDay).sort((a, b) => b[1].orders - a[1].orders)[0];
  const statusItems = toBarItems(stats.byStatus, { limit: 6, label: (key) => ORDER_STATUS_LABEL[key as keyof typeof ORDER_STATUS_LABEL] ?? key });
  const productItems = stats.products.slice(0, 8).map((p) => ({ label: p.name || p.slug, value: p.units, display: `${p.units} (${money(p.value)})` }));
  const stateItems = toBarItems(stats.byState, { limit: 8 });
  const brandItems = toBarItems(brands, { limit: 8 });
  const categoryItems = toBarItems(categories, { limit: 8 });
  const waiting = (stats.byStatus.new ?? 0) + (stats.byStatus.contacted ?? 0);

  return (
    <>
      {header}
      {rangeControl}

      <p className="admin-help mb-3 mt-0">{updatedAt ? `Figures updated ${formatDateTime(updatedAt.toISOString())}.` : "No order requests have been recorded in this range yet."}</p>

      <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <StatTile label="Order requests" value={stats.totals.orders} hint={selected} />
        <StatTile label="Value quoted" value={money(stats.totals.value)} hint="Cancelled requests left out" />
        <StatTile label="Average request" value={money(stats.totals.averageValue, true)} />
        <StatTile label="Items requested" value={stats.totals.units} />
        <StatTile label="Waiting on us" value={waiting} hint="New or contacted" />
        <StatTile label="Busiest day" value={busiest ? busiest[1].orders : 0} hint={busiest ? prettyDay(busiest[0]) : "No orders yet"} />
      </div>

      <Card className="mb-4">
        <ChartFrame
          title={metric === "orders" ? "Order requests per day" : "Value quoted per day"}
          note={`${selected}, ${ZONE_LABEL}`}
          actions={
            <div className="admin-segment" role="group" aria-label="Measure">
              <button type="button" aria-pressed={metric === "orders"} onClick={() => setMetric("orders")}>
                Requests
              </button>
              <button type="button" aria-pressed={metric === "value"} onClick={() => setMetric("value")}>
                Value
              </button>
            </div>
          }
          table={{
            columns: ["Day", "Requests", "Items", "Value"],
            rows: trend.map((p) => {
              const d = stats.byDay[p.day];
              return [prettyDay(p.day), String(d?.orders ?? 0), String(d?.units ?? 0), money(d?.value ?? 0, true)];
            }),
          }}
        >
          <TrendChart points={trend} format={metric === "value" ? (n) => money(n) : (n) => String(n)} noun={metric === "value" ? ["", ""] : ["request", "requests"]} onPick={openDay} />
        </ChartFrame>
      </Card>

      <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        <Card>
          <ChartFrame title="Time of day" note={`When requests arrive, ${ZONE_LABEL}.`} table={{ columns: ["Hour", "Requests"], rows: stats.byHour.map((n, h) => [HOUR_LABELS[h], String(n)]) }}>
            <ColumnChart values={stats.byHour} labels={HOUR_LABELS} every={6} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Day of the week" table={{ columns: ["Day", "Requests"], rows: stats.byWeekday.map((n, d) => [WEEKDAY_LABELS[d], String(n)]) }}>
            <ColumnChart values={stats.byWeekday} labels={WEEKDAY_LABELS.map((d) => d.slice(0, 3))} />
          </ChartFrame>
        </Card>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Card>
          <ChartFrame title="Where requests stand" table={{ columns: ["Status", "Requests"], rows: statusItems.map((i) => [i.label, String(i.value)]) }}>
            <BarList items={statusItems} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Most requested products" note="Items requested, with the value quoted." table={{ columns: ["Product", "Items", "Value"], rows: stats.products.map((p) => [p.name || p.slug, String(p.units), money(p.value, true)]) }}>
            <BarList items={productItems} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Brands" note="Items requested." table={{ columns: ["Brand", "Items"], rows: brandItems.map((i) => [i.label, String(i.value)]) }}>
            <BarList items={brandItems} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Categories" note="Items requested." table={{ columns: ["Category", "Items"], rows: categoryItems.map((i) => [i.label, String(i.value)]) }}>
            <BarList items={categoryItems} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Ship-to states" note="The eight states with the most requests." table={{ columns: ["State", "Requests"], rows: stateItems.map((i) => [i.label, String(i.value)]) }}>
            <BarList items={stateItems} />
          </ChartFrame>
        </Card>
      </div>
    </>
  );
}
