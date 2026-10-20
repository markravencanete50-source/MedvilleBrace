import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { adminApi, AdminApiError, CART_STATE_LABEL, CART_STATE_TONE, isAdminApiConfigured, isCartsConfigured, type Cart, type CartState } from "../api";
import { useAdminAuth } from "../auth";
import { Badge, Banner, Card, ConfirmDialog, Drawer, Empty, Field, PageHeader, Spinner, useToast } from "../ui";
import { money } from "../charts";
import { formatDateTime } from "../days";

/*
  Carts: shopping carts that were started on the website, newest first, and
  whether each one became an order request.

  A cart holds no name, email or address. It is a random id the visitor's
  browser made up, what was in the cart and when it last changed, so this
  screen can show how much is left unfinished. It cannot say who the visitor
  was, and nothing here links a cart to an order.

  Until the owner turns cart saving on (VITE_CART_SERVICE, see README.md,
  Carts) visitor carts live only in each visitor's own browser, there is
  nothing to show, and this screen makes no request.

  - Every page fetched and every removal is recorded in the access log by
    the server that serves it.
  - Removing a cart deletes it from the dashboard for good; it never touches an order.
  - The filter works in the browser on carts already fetched.
*/

type Filter = "open" | "all" | CartState;

const units = (cart: Cart) => cart.items.reduce((n, l) => n + l.qty, 0);
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export default function Carts() {
  const { getToken } = useAdminAuth();
  const toast = useToast();
  const apiReady = isAdminApiConfigured();
  const connected = isCartsConfigured();

  const [carts, setCarts] = useState<Cart[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    if (!connected) {
      setCarts([]);
      return;
    }
    setCarts(null);
    try {
      const result = await adminApi.listCarts(getToken);
      setCarts(result.carts);
      setNextCursor(result.nextCursor);
    } catch (problem) {
      setCarts([]);
      setError(problem instanceof AdminApiError ? problem.message : "That did not work.");
    }
  }, [getToken, connected]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await adminApi.listCarts(getToken, nextCursor);
      setCarts((current) => [...new Map([...(current ?? []), ...result.carts].map((c) => [c.id, c])).values()]);
      setNextCursor(result.nextCursor);
    } catch {
      toast("The next page could not be loaded. Please try again.", "danger");
    } finally {
      setLoadingMore(false);
    }
  };

  const counts = useMemo(() => {
    const out = { active: 0, abandoned: 0, converted: 0, abandonedValue: 0 };
    for (const c of carts ?? []) {
      out[c.state] += 1;
      if (c.state === "abandoned") out.abandonedValue += c.subtotal;
    }
    return out;
  }, [carts]);

  const visible = useMemo(
    () => (carts ?? []).filter((c) => (filter === "all" ? true : filter === "open" ? c.state !== "converted" : c.state === filter)),
    [carts, filter],
  );

  const open = carts?.find((c) => c.id === openId) ?? null;

  const remove = async () => {
    if (!open) return;
    setRemoving(true);
    try {
      await adminApi.removeCart(getToken, open.id);
      setCarts((current) => (current ?? []).filter((c) => c.id !== open.id));
      setOpenId(null);
      setConfirmRemove(false);
      toast("The cart was removed.");
    } catch (problem) {
      setConfirmRemove(false);
      toast(problem instanceof AdminApiError ? problem.message : "That did not work. Please try again.", "danger");
    } finally {
      setRemoving(false);
    }
  };

  const header = (
    <PageHeader
      title="Carts"
      lede="Carts started on the website, and whether they became an order request. A cart shows what was in it and when it last changed, never who the visitor was."
      actions={
        <button type="button" className="admin-btn admin-btn-quiet" disabled={!connected} onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      }
    />
  );

  if (!connected) {
    return (
      <>
        {header}
        <Card>
          <Empty>
            {!apiReady
              ? "Carts will appear here once the order service is connected."
              : "Cart saving is switched off, so there is nothing to show yet. Right now each visitor's cart lives only in their own browser. Turning cart saving on changes the privacy policy and stores shopping data in AWS, so it is the owner's decision. See README.md, Carts."}
          </Empty>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="admin-help m-0">Active now</p>
          <p className="font-display m-0 text-[24px] font-semibold tabular-nums">{counts.active}</p>
        </Card>
        <Card>
          <p className="admin-help m-0">Abandoned</p>
          <p className="font-display m-0 text-[24px] font-semibold tabular-nums">{counts.abandoned}</p>
          <p className="admin-help m-0">{money(counts.abandonedValue, true)} left unordered</p>
        </Card>
        <Card>
          <p className="admin-help m-0">Became an order request</p>
          <p className="font-display m-0 text-[24px] font-semibold tabular-nums">{counts.converted}</p>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="w-full sm:w-[260px]">
          <Field label="Show" htmlFor="cart-filter">
            <select id="cart-filter" className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
              <option value="open">Open (active and abandoned)</option>
              <option value="all">All carts</option>
              <option value="active">Active ({counts.active})</option>
              <option value="abandoned">Abandoned ({counts.abandoned})</option>
              <option value="converted">Ordered ({counts.converted})</option>
            </select>
          </Field>
        </div>
        <p className="admin-help mt-3 mb-0">A cart counts as abandoned when it has not changed for an hour and was not sent as an order request. The filter and the totals apply to loaded carts.</p>
      </Card>

      <Card pad={false}>
        {carts === null ? (
          <Spinner label="Loading carts" />
        ) : !visible.length ? (
          <Empty>{carts.length ? "No carts match that filter." : "No carts have been saved yet."}</Empty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Cart</th>
                  <th scope="col">Last changed</th>
                  <th scope="col">Items</th>
                  <th scope="col">Value</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Cart">
                      <button type="button" className="font-semibold underline underline-offset-2" style={{ color: "var(--a-brand-text)" }} onClick={() => setOpenId(c.id)}>
                        {shortId(c.id)}
                      </button>
                    </td>
                    <td data-label="Last changed" style={{ color: "var(--a-text-muted)" }}>{formatDateTime(c.updatedAt)}</td>
                    <td data-label="Items" className="tabular-nums">{units(c)}</td>
                    <td data-label="Value" className="tabular-nums">{money(c.subtotal, true)}</td>
                    <td data-label="State">
                      <Badge tone={CART_STATE_TONE[c.state]}>{CART_STATE_LABEL[c.state]}</Badge>
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
            {loadingMore ? "Loading" : "Load more carts"}
          </button>
        </div>
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open ? `Cart ${shortId(open.id)}` : "Cart"}
        footer={
          open && (
            <>
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => setConfirmRemove(true)}>
                Remove this cart
              </button>
              <button type="button" className="admin-btn admin-btn-quiet" onClick={() => setOpenId(null)}>
                Close
              </button>
            </>
          )
        }
      >
        {open && (
          <>
            <p className="m-0 mb-4 flex flex-wrap items-center gap-2">
              <Badge tone={CART_STATE_TONE[open.state]}>{CART_STATE_LABEL[open.state]}</Badge>
              <span className="admin-help m-0">
                Started {formatDateTime(open.createdAt)}. Last changed {formatDateTime(open.updatedAt)}.
              </span>
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-text">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {open.items.map((l, i) => (
                    <tr key={`${l.slug}-${l.sku}-${i}`}>
                      <td data-label="Product">
                        <span className="font-semibold">{l.name}</span>
                        {l.options.length > 0 && (
                          <span className="block text-[12.5px]" style={{ color: "var(--a-text-muted)" }}>
                            {l.options.map((o, j) => `${l.optionNames[j] ?? "Option"}: ${o}`).join(", ")}
                          </span>
                        )}
                        {l.sku && <span className="block text-[12px] break-all" style={{ color: "var(--a-text-muted)" }}>{l.sku}</span>}
                      </td>
                      <td data-label="Qty" className="tabular-nums">{l.qty}</td>
                      <td data-label="Price" className="tabular-nums">{money(l.unitPrice * l.qty, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 mb-0 font-semibold">Estimated subtotal {money(open.subtotal, true)}</p>
            <p className="admin-help mt-2">Prices are the current store prices when the cart was last changed. This cart is not linked to any order or customer.</p>
          </>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove this cart?"
        body={<p>The cart disappears from this list for good. Orders are not affected, and a visitor who still has the cart open in their browser keeps it.</p>}
        confirmLabel="Remove cart"
        busyLabel="Removing"
        busy={removing}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
