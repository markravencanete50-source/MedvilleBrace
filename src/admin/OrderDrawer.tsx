import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { adminApi, AdminApiError, itemCount, ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type Order, type OrderStatus } from "./api";
import { useAdminAuth } from "./auth";
import { Badge, Banner, Drawer, Field, Spinner, useToast } from "./ui";
import { money } from "./charts";
import { formatDateTime } from "./days";

/*
  One order, in a panel rather than at its own address, so a customer's order
  never becomes a link that could be copied or logged. Opening it reads a
  fresh copy from the server, which records the read in the access log.
*/

export default function OrderDrawer({
  orderId,
  onClose,
  onChange,
}: {
  orderId: string | null;
  onClose: () => void;
  onChange?: (order: Order) => void;
}) {
  const { getToken } = useAdminAuth();
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let live = true;
    setOrder(null);
    setError("");
    adminApi
      .getOrder(getToken, orderId)
      .then((r) => live && setOrder(r.order))
      .catch((problem: unknown) => live && setError(problem instanceof AdminApiError ? problem.message : "The order could not be opened."));
    return () => {
      live = false;
    };
  }, [orderId, getToken]);

  const update = async (patch: { status?: OrderStatus; note?: string }) => {
    if (!order) return;
    setSaving(true);
    try {
      const r = await adminApi.updateOrder(getToken, order.id, patch);
      const next = { ...order, ...patch, updatedAt: r.updatedAt, updatedBy: r.updatedBy };
      setOrder(next);
      onChange?.(next);
      toast(patch.status ? `Order marked ${ORDER_STATUS_LABEL[patch.status].toLowerCase()}.` : "Note saved.");
    } catch (problem) {
      toast(problem instanceof AdminApiError ? problem.message : "That did not work.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const a = order?.customer.address;

  return (
    <Drawer open={Boolean(orderId)} onClose={onClose} title={order ? `Order ${order.reference}` : "Order"}>
      {error ? (
        <Banner tone="warn">{error}</Banner>
      ) : !order ? (
        <Spinner label="Opening the order" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <span className="admin-help m-0">Received {formatDateTime(order.createdAt)}</span>
          </div>

          <section>
            <h3 className="admin-label">Customer</h3>
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[14px]">
              <Detail label="Name">{order.customer.name || "Not given"}</Detail>
              <Detail label="Email">
                <a href={`mailto:${order.customer.email}`} style={{ color: "var(--a-brand-text)" }}>
                  {order.customer.email}
                </a>
              </Detail>
              <Detail label="Phone">
                {order.customer.phone ? (
                  <a href={`tel:${order.customer.phone.replace(/[^0-9+]/g, "")}`} style={{ color: "var(--a-brand-text)" }}>
                    {order.customer.phone}
                  </a>
                ) : (
                  "Not given"
                )}
              </Detail>
              <Detail label="Ship to">
                <span className="block">{a?.line1}</span>
                {a?.line2 && <span className="block">{a.line2}</span>}
                <span className="block">
                  {a?.city}, {a?.state} {a?.zip}
                </span>
              </Detail>
            </dl>
          </section>

          <section>
            <h3 className="admin-label">
              {itemCount(order)} {itemCount(order) === 1 ? "item" : "items"}
            </h3>
            <div className="admin-table-wrap rounded-lg border" style={{ borderColor: "var(--a-line)" }}>
              <table className="admin-table admin-table-keep admin-table-text">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="text-right">Qty</th>
                    <th scope="col" className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((line, i) => (
                    <tr key={`${line.slug}-${line.sku}-${i}`}>
                      <td>
                        <a href={`/product/${line.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 font-semibold underline-offset-2 hover:underline">
                          {line.name || line.slug}
                          <ExternalLink size={12} aria-hidden="true" className="mt-1 flex-none" />
                        </a>
                        <span className="block text-[12.5px]" style={{ color: "var(--a-text-muted)" }}>
                          {line.options.map((o, j) => `${line.optionNames[j] ? `${line.optionNames[j]}: ` : ""}${o}`).join(", ") || "One size"}
                          {line.sku ? ` · SKU ${line.sku}` : ""}
                        </span>
                        <span className="block text-[12.5px]" style={{ color: "var(--a-text-faint)" }}>
                          {money(line.unitPrice, true)} each
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{line.qty}</td>
                      <td className="text-right tabular-nums">{money(line.unitPrice * line.qty, true)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="font-semibold">Subtotal quoted</td>
                    <td className="text-right font-semibold tabular-nums">{money(order.subtotal, true)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="admin-help">Prices are the catalog prices when the request was sent. Confirm shipping and the final total with the customer.</p>
          </section>

          {order.notes && (
            <section className="rounded-lg p-4" style={{ background: "var(--a-brand-soft)" }}>
              <h3 className="admin-label">Note from the customer</h3>
              <p className="m-0 mt-1 whitespace-pre-wrap text-[14px] leading-relaxed">{order.notes}</p>
            </section>
          )}

          <Field label="Status" htmlFor="order-status" help="Change it as the order moves along. Every change is recorded in the access log.">
            <select id="order-status" className="admin-select" value={order.status} disabled={saving} onChange={(event) => void update({ status: event.target.value as OrderStatus })}>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </Field>

          <NoteEditor order={order} saving={saving} onSave={(note) => void update({ note })} />

          <p className="admin-help m-0">
            {order.updatedAt ? `Last changed ${formatDateTime(order.updatedAt)} by ${order.updatedBy || "a team member"}. ` : ""}
            New-order email: {order.notificationStatus === "sent" ? "sent" : order.notificationStatus === "failed" ? "failed to send" : "not set up"}.
            Opening and changing this order is recorded in the access log with your name and the time.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--a-text-faint)" }}>{label}</dt>
      <dd className="m-0 min-w-0 break-words font-medium">{children}</dd>
    </>
  );
}

function NoteEditor({ order, saving, onSave }: { order: Order; saving: boolean; onSave: (note: string) => void }) {
  const [note, setNote] = useState(order.note);
  useEffect(() => setNote(order.note), [order.id, order.note]);
  return (
    <Field label="Internal note" htmlFor="order-note" help="Seen only by the team. Keep it factual: sizes confirmed, tracking number, what was agreed.">
      <textarea id="order-note" className="admin-textarea" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
      <button type="button" className="admin-btn admin-btn-quiet mt-2" disabled={saving || note === order.note} onClick={() => onSave(note)}>
        Save note
      </button>
    </Field>
  );
}
