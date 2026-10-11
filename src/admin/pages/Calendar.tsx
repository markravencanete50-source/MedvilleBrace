import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminApi, AdminApiError, isAdminApiConfigured, itemCount, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type Order, type OrderStats } from "../api";
import { useAdminAuth } from "../auth";
import { fetchFigures, FiguresError } from "../figures";
import { isFirebaseConfigured } from "../../lib/firebaseConfig";
import { Badge, Banner, Card, Empty, PageHeader, Spinner } from "../ui";
import { BarList, ChartFrame, ColumnChart, money, StatTile, toBarItems } from "../charts";
import { addMonths, formatDateTime, formatTime, HOUR_LABELS, monthBounds, monthGrid, prettyDay, prettyMonth, today, WEEKDAY_LABELS, ZONE_LABEL } from "../days";
import OrderDrawer from "../OrderDrawer";

/*
  The calendar: one month at a time, each day showing how many order
  requests arrived and what they were worth, shaded by how busy it was. Pick
  a day to see that day's figures and the orders themselves.

  Days are business-zone days (src/admin/days.ts), the same days the AWS
  figures function counts, so a number here always matches the Overview and
  the order list. The figures are read from Firestore (src/admin/figures.ts);
  only the list of that day's orders comes from the order service.
*/

export default function Calendar({ initialDay }: { initialDay?: string | null }) {
  const connected = isFirebaseConfigured();
  const now = today();
  const [day, setDay] = useState<string>(initialDay || now);
  const [month, setMonth] = useState(() => (initialDay || now).slice(0, 7));
  const [monthStats, setMonthStats] = useState<OrderStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [monthError, setMonthError] = useState("");

  useEffect(() => {
    if (initialDay) {
      setDay(initialDay);
      setMonth(initialDay.slice(0, 7));
    }
  }, [initialDay]);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    setMonthStats(null);
    setMonthError("");
    fetchFigures(monthBounds(month))
      .then((r) => {
        if (!live) return;
        setMonthStats(r.stats);
        setUpdatedAt(r.updatedAt);
      })
      .catch((problem: unknown) => live && setMonthError(problem instanceof FiguresError ? problem.message : "That did not work."));
    return () => {
      live = false;
    };
  }, [connected, month]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const busiest = useMemo(() => Math.max(0, ...Object.values(monthStats?.byDay ?? {}).map((d) => d.orders)), [monthStats]);
  const level = (orders: number) => (!orders || !busiest ? 0 : Math.min(4, Math.max(1, Math.ceil((orders / busiest) * 4))));
  const busiestDay = Object.entries(monthStats?.byDay ?? {}).sort((a, b) => b[1].orders - a[1].orders)[0];

  const header = <PageHeader title="Calendar" lede="Each day's order requests at a glance. Pick a day to see its figures and its orders." />;
  if (!connected) {
    return (
      <>
        {header}
        <Card>
          <Empty>The calendar will fill in once Firebase is connected. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID, then rebuild.</Empty>
        </Card>
      </>
    );
  }

  const pick = (d: string) => {
    setDay(d);
    if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7));
  };

  return (
    <>
      {header}
      <div className="admin-cal-layout">
        <div className="min-w-0">
          <Card className="mb-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <button type="button" className="admin-icon-btn" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
                  <ChevronLeft size={20} />
                </button>
                <h2 className="admin-page-title m-0 min-w-[10ch] text-center" style={{ fontSize: "1.2rem" }} aria-live="polite">
                  {prettyMonth(month)}
                </h2>
                <button type="button" className="admin-icon-btn" aria-label="Next month" disabled={month >= now.slice(0, 7)} onClick={() => setMonth((m) => addMonths(m, 1))}>
                  <ChevronRight size={20} />
                </button>
              </div>
              <button type="button" className="admin-btn admin-btn-quiet admin-btn-sm" onClick={() => pick(now)}>
                Today
              </button>
            </div>

            {monthError && (
              <div className="mb-3">
                <Banner tone="warn">{monthError}</Banner>
              </div>
            )}

            <div className="admin-cal" role="grid" aria-label={`Order requests in ${prettyMonth(month)}`} aria-busy={!monthStats && !monthError}>
              <div className="admin-cal-row admin-cal-head" role="row">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w} role="columnheader" aria-label={w}>
                    <span aria-hidden="true">{w.slice(0, 3)}</span>
                  </span>
                ))}
              </div>
              {grid.map((week, wi) => (
                <div key={wi} className="admin-cal-row" role="row">
                  {week.map((d, di) => {
                    if (!d) return <span key={`blank-${wi}-${di}`} className="admin-cal-blank" role="gridcell" />;
                    const figures = monthStats?.byDay[d];
                    const orders = figures?.orders ?? 0;
                    const future = d > now;
                    return (
                      <span key={d} role="gridcell">
                        <button
                          type="button"
                          className="admin-cal-day"
                          data-level={level(orders)}
                          data-today={d === now || undefined}
                          aria-pressed={d === day}
                          disabled={future}
                          aria-label={`${prettyDay(d, { weekday: "long", day: "numeric", month: "long" })}: ${orders} ${orders === 1 ? "request" : "requests"}${orders ? `, ${money(figures!.value)}` : ""}`}
                          onClick={() => pick(d)}
                        >
                          <span className="admin-cal-num">{Number(d.slice(8))}</span>
                          {monthStats && !future && (
                            <>
                              <span className="admin-cal-count">{orders || ""}</span>
                              <span className="admin-cal-value">{orders ? money(figures!.value) : ""}</span>
                            </>
                          )}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="admin-cal-legend" aria-hidden="true">
                <span>Fewer</span>
                {[0, 1, 2, 3, 4].map((l) => (
                  <i key={l} data-level={l} />
                ))}
                <span>More</span>
              </div>
              <p className="admin-help m-0">Days in {ZONE_LABEL}. The number is requests that day. On a wider screen, the value quoted shows below it.</p>
            </div>
          </Card>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
            <StatTile label="Requests this month" value={monthStats ? monthStats.totals.orders : "..."} />
            <StatTile label="Value quoted" value={monthStats ? money(monthStats.totals.value) : "..."} />
            <StatTile label="Items requested" value={monthStats ? monthStats.totals.units : "..."} />
            <StatTile label="Busiest day" value={busiestDay ? busiestDay[1].orders : monthStats ? 0 : "..."} hint={busiestDay ? prettyDay(busiestDay[0], { weekday: "short", day: "numeric", month: "short" }) : undefined} />
          </div>
          {monthStats && <p className="admin-help mt-3">{updatedAt ? `Figures updated ${formatDateTime(updatedAt.toISOString())}.` : "No order requests have been recorded this month yet."}</p>}
        </div>

        <DayPanel day={day} />
      </div>
    </>
  );
}

function DayPanel({ day }: { day: string }) {
  const { getToken } = useAdminAuth();
  const ordersConnected = isAdminApiConfigured();
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [figuresError, setFiguresError] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStats(null);
    setOrders(null);
    setError("");
    setFiguresError("");
    /* The figures and the orders come from different services, so one failing leaves the other on screen. */
    const [figures, list] = await Promise.allSettled([
      fetchFigures({ from: day, to: day }),
      ordersConnected ? adminApi.listOrders(getToken, { from: day, to: day }) : Promise.resolve(null),
    ]);
    if (figures.status === "fulfilled") {
      setStats(figures.value.stats);
      setUpdatedAt(figures.value.updatedAt);
    } else {
      setFiguresError(figures.reason instanceof FiguresError ? figures.reason.message : "That day's figures could not be loaded.");
    }
    if (list.status === "fulfilled") {
      setOrders(list.value?.orders ?? []);
      setNextCursor(list.value?.nextCursor ?? null);
    } else {
      setError(list.reason instanceof AdminApiError ? list.reason.message : "That day's orders could not be loaded.");
    }
  }, [getToken, day, ordersConnected]);

  useEffect(() => {
    void load();
  }, [load]);

  const more = async () => {
    if (!nextCursor) return;
    const list = await adminApi.listOrders(getToken, { from: day, to: day, cursor: nextCursor }).catch(() => null);
    if (!list) return;
    setOrders((current) => [...(current ?? []), ...list.orders]);
    setNextCursor(list.nextCursor);
  };

  const statusItems = stats ? toBarItems(stats.byStatus, { limit: 6, label: (k) => ORDER_STATUS_LABEL[k as keyof typeof ORDER_STATUS_LABEL] ?? k }) : [];
  const productItems = (stats?.products ?? []).slice(0, 6).map((p) => ({ label: p.name || p.slug, value: p.units }));
  const firstHour = stats ? stats.byHour.findIndex((n) => n > 0) : -1;

  return (
    <section className="min-w-0" aria-label={`Figures for ${prettyDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}>
      <Card className="mb-4">
        <p className="admin-label m-0">Selected day</p>
        <h2 className="admin-page-title m-0 mt-1" style={{ fontSize: "1.25rem" }}>
          {prettyDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h2>
        {figuresError && (
          <div className="mt-3">
            <Banner tone="warn">{figuresError}</Banner>
          </div>
        )}
        {!stats && !figuresError && <Spinner label="Loading the day" />}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Figure label="Requests" value={String(stats.totals.orders)} />
            <Figure label="Value quoted" value={money(stats.totals.value, true)} />
            <Figure label="Items" value={String(stats.totals.units)} />
            <Figure label="Cancelled" value={String(stats.totals.cancelled)} />
          </div>
        )}
        {stats && <p className="admin-help mb-0">{updatedAt ? `Figures updated ${formatDateTime(updatedAt.toISOString())}.` : "No figures recorded for this day."}</p>}
      </Card>

      {stats && stats.totals.orders > 0 && (
        <>
          <Card className="mb-4">
            <ChartFrame title="Through the day" note={firstHour >= 0 ? `First request at ${HOUR_LABELS[firstHour]}, ${ZONE_LABEL}.` : undefined} table={{ columns: ["Hour", "Requests"], rows: stats.byHour.map((n, h) => [HOUR_LABELS[h], String(n)]) }}>
              <ColumnChart values={stats.byHour} labels={HOUR_LABELS} every={6} />
            </ChartFrame>
          </Card>
          <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <Card>
              <ChartFrame title="Status" table={{ columns: ["Status", "Requests"], rows: statusItems.map((i) => [i.label, String(i.value)]) }}>
                <BarList items={statusItems} />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame title="Products" note="Items requested." table={{ columns: ["Product", "Items"], rows: (stats.products ?? []).map((p) => [p.name || p.slug, String(p.units)]) }}>
                <BarList items={productItems} />
              </ChartFrame>
            </Card>
          </div>
        </>
      )}

      <Card pad={false}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--a-line)" }}>
          <h3 className="font-display m-0 text-[15px] font-semibold">Orders that day</h3>
        </div>
        {error && (
          <div className="px-4 py-3">
            <Banner tone="warn">{error}</Banner>
          </div>
        )}
        {orders === null ? (
          error ? null : <Spinner label="Loading orders" />
        ) : !ordersConnected ? (
          <Empty>The list of orders will appear once the order service is connected. Set VITE_ORDER_ENDPOINT (or VITE_ADMIN_ENDPOINT) and rebuild.</Empty>
        ) : !orders.length ? (
          <Empty>No order requests arrived this day.</Empty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Order</th>
                  <th scope="col">Items</th>
                  <th scope="col">Value</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Time" style={{ color: "var(--a-text-muted)" }}>{formatTime(o.createdAt)}</td>
                    <td data-label="Order">
                      <button type="button" className="text-left font-semibold underline underline-offset-2" style={{ color: "var(--a-brand-text)" }} onClick={() => setOpenId(o.id)}>
                        {o.reference}
                      </button>
                      <span className="block text-[12.5px]" style={{ color: "var(--a-text-muted)" }}>{o.customer.name}</span>
                    </td>
                    <td data-label="Items" className="tabular-nums">{itemCount(o)}</td>
                    <td data-label="Value" className="tabular-nums">{money(o.subtotal, true)}</td>
                    <td data-label="Status">
                      <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextCursor && (
          <div className="px-4 py-3">
            <button type="button" className="admin-btn admin-btn-quiet" onClick={() => void more()}>
              Load more orders
            </button>
          </div>
        )}
      </Card>

      <OrderDrawer
        orderId={openId}
        onClose={() => setOpenId(null)}
        onChange={(o) => setOrders((current) => (current ?? []).map((x) => (x.id === o.id ? o : x)))}
      />
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--a-surface-2)", border: "1px solid var(--a-line)" }}>
      <div className="admin-stat">
        <span>{label}</span>
        <b style={{ fontSize: "1.35rem" }}>{value}</b>
      </div>
    </div>
  );
}
