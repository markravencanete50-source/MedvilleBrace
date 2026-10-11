import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { adminApi, AdminApiError, isAdminApiConfigured, itemCount, ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type Order, type OrderStatus } from "../api";
import { useAdminAuth } from "../auth";
import { Badge, Banner, Card, ConfirmDialog, Empty, Field, PageHeader, Spinner, useToast } from "../ui";
import { money } from "../charts";
import DateRangeFilter, { recentRange, type DateRange } from "../DateRangeFilter";
import { formatDateTime } from "../days";
import OrderDrawer from "../OrderDrawer";

/*
  The order list: every order request, newest first, with its status.

  - Every page fetched and every order opened is recorded in the access log
    by the server that serves it.
  - An order opens in a panel, never at its own address.
  - Searching and the status filter work in the browser on orders already
    fetched, so a search term never travels anywhere.
  - The export is made in the browser, after the server has recorded it.
*/

export default function Orders() {
  const { getToken } = useAdminAuth();
  const toast = useToast();
  const connected = isAdminApiConfigured();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRange>(() => recentRange(90));
  const [filter, setFilter] = useState<OrderStatus | "all" | "open">("open");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    if (!connected) {
      setOrders([]);
      return;
    }
    setOrders(null);
    try {
      const result = await adminApi.listOrders(getToken, range);
      setOrders(result.orders);
      setNextCursor(result.nextCursor);
    } catch (problem) {
      setOrders([]);
      setError(problem instanceof AdminApiError ? problem.message : "That did not work.");
    }
  }, [getToken, connected, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await adminApi.listOrders(getToken, { ...range, cursor: nextCursor });
      setOrders((current) => [...new Map([...(current ?? []), ...result.orders].map((o) => [o.id, o])).values()]);
      setNextCursor(result.nextCursor);
    } catch {
      toast("The next page could not be loaded. Please try again.", "danger");
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (filter === "open" && !["new", "contacted", "confirmed"].includes(o.status)) return false;
      if (filter !== "all" && filter !== "open" && o.status !== filter) return false;
      if (!term) return true;
      const c = o.customer;
      return [o.reference, c.name, c.email, c.phone, c.address.city, c.address.state, c.address.zip, ...o.items.map((l) => l.name)].some((v) => v.toLowerCase().includes(term));
    });
  }, [orders, filter, search]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const o of orders ?? []) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  }, [orders]);

  /* A spreadsheet of customers on a laptop is outside every safeguard the hosting gives, so the export asks first and is logged. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      await adminApi.recordExport(getToken, visible.map((o) => o.id));
    } catch {
      setExporting(false);
      setExportOpen(false);
      toast("The export could not be recorded, so nothing was downloaded. Please try again.", "danger");
      return;
    }
    const rows = [
      ["Reference", "Received", "Status", "Name", "Email", "Phone", "Address line 1", "Address line 2", "City", "State", "ZIP", "Items", "Products", "Subtotal quoted", "Customer note", "Internal note"],
      ...visible.map((o) => [
        o.reference,
        o.createdAt ?? "",
        ORDER_STATUS_LABEL[o.status],
        o.customer.name,
        o.customer.email,
        o.customer.phone,
        o.customer.address.line1,
        o.customer.address.line2,
        o.customer.address.city,
        o.customer.address.state,
        o.customer.address.zip,
        String(itemCount(o)),
        o.items.map((l) => `${l.qty} x ${l.name}${l.options.length ? ` (${l.options.join(", ")})` : ""}`).join("; "),
        o.subtotal.toFixed(2),
        o.notes,
        o.note,
      ]),
    ];
    /* A cell starting with =, +, - or @ would run as a formula in a spreadsheet; an apostrophe keeps it text. */
    const cell = (value: string) => {
      const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `medville-brace-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    setExportOpen(false);
    toast("Downloaded. This file holds customer details; store it securely and delete it when done.");
  };

  return (
    <>
      <PageHeader
        title="Orders"
        lede="Every order request from the website, newest first. Open one to see the customer, the items and the total quoted."
        actions={
          <>
            <button type="button" className="admin-btn admin-btn-quiet" disabled={!connected} onClick={() => void load()}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" className="admin-btn admin-btn-quiet" disabled={!visible.length || visible.length > 1000} onClick={() => setExportOpen(true)}>
              <Download size={16} /> Export shown
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}

      <Card className="mb-4">
        <div className="mb-4">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-[220px]">
            <Field label="Search" htmlFor="order-search">
              <div className="relative">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--a-text-faint)" }} />
                <input id="order-search" className="admin-input" style={{ paddingLeft: 32 }} placeholder="Reference, name, email, phone, city or product" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </Field>
          </div>
          <div className="w-full sm:w-[220px]">
            <Field label="Status" htmlFor="order-filter">
              <select id="order-filter" className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                <option value="open">Open (new, contacted, confirmed)</option>
                <option value="all">All statuses</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABEL[status]} ({counts[status] ?? 0})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card pad={false}>
        {orders === null ? (
          <Spinner label="Loading orders" />
        ) : !visible.length ? (
          <Empty>{!connected ? "Orders will appear here once the order service is connected." : orders.length ? "No orders match that search and status." : "No order requests in this range yet."}</Empty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Received</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Items</th>
                  <th scope="col">Value</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Order">
                      <button type="button" className="font-semibold underline underline-offset-2" style={{ color: "var(--a-brand-text)" }} onClick={() => setOpenId(o.id)}>
                        {o.reference}
                      </button>
                    </td>
                    <td data-label="Received" style={{ color: "var(--a-text-muted)" }}>{formatDateTime(o.createdAt)}</td>
                    <td data-label="Customer">
                      <span className="font-medium">{o.customer.name}</span>
                      <span className="block text-[12.5px]" style={{ color: "var(--a-text-muted)" }}>
                        {o.customer.address.city}, {o.customer.address.state}
                      </span>
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
      </Card>
      {nextCursor && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="admin-btn admin-btn-quiet" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading" : "Load more orders"}
          </button>
          <p className="admin-help m-0">Search, the status filter and the export apply to loaded orders.</p>
        </div>
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} onChange={(next) => setOrders((current) => (current ?? []).map((o) => (o.id === next.id ? next : o)))} />
      <ConfirmDialog
        open={exportOpen}
        title={`Download ${visible.length} ${visible.length === 1 ? "order" : "orders"}?`}
        body={<p>This file holds customer names, contact details, addresses and what they ordered. Continue only if you can store it securely and keep it to the people who handle orders. The download is recorded in the access log.</p>}
        confirmLabel="Download orders"
        busyLabel="Preparing download"
        busy={exporting}
        onCancel={() => setExportOpen(false)}
        onConfirm={() => void exportCsv()}
      />
    </>
  );
}
