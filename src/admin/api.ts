/*
  Client for the dashboard API (aws/src/admin.mjs, POST /admin).

  Everything that touches customer orders goes through here, and the shape of
  these calls is deliberate:

  - Always POST. An order id never appears in a URL, because URLs reach
    browser history, proxy logs and referrer headers.
  - Always a current Firebase ID token in the Authorization header. API
    Gateway checks it before the Lambda runs, and the Lambda looks the role up
    again for every request.
  - Responses never enter the browser HTTP cache, and nothing is kept in
    memory either: an order is read when it is asked for and forgotten after.
  - Errors surface as plain sentences. The server never sends detail back and
    this never invents any.

  The figures on the Overview and the Calendar do not come from here. They
  are read from Firestore (src/admin/figures.ts) and hold no customer data.
*/
import { ORDER_ENDPOINT } from "../data/site";
import { BUSINESS_TIME_ZONE } from "./days";

/* The dashboard API sits on the same API Gateway as the order form, at /admin. */
export const ADMIN_ENDPOINT: string = import.meta.env?.VITE_ADMIN_ENDPOINT || (ORDER_ENDPOINT ? ORDER_ENDPOINT.replace(/\/orders\/?$/, "/admin") : "");

export const isAdminApiConfigured = () => Boolean(ADMIN_ENDPOINT);

/*
  Visitor carts live only in each visitor's own browser until the owner turns
  cart saving on (it changes the privacy policy and puts shopping data in AWS).
  Until VITE_CART_SERVICE is "true" the Carts screen makes no request at all.
*/
export const CART_SERVICE: boolean = import.meta.env?.VITE_CART_SERVICE === "true";
export const isCartsConfigured = () => isAdminApiConfigured() && CART_SERVICE;

export type OrderStatus = "new" | "contacted" | "confirmed" | "shipped" | "completed" | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = ["new", "contacted", "confirmed", "shipped", "completed", "cancelled"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  contacted: "Contacted",
  confirmed: "Confirmed",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "new" | "ok" | "warn" | "danger" | "quiet"> = {
  new: "new",
  contacted: "warn",
  confirmed: "ok",
  shipped: "ok",
  completed: "quiet",
  cancelled: "danger",
};

export interface OrderLine {
  slug: string;
  name: string;
  sku: string;
  options: string[];
  optionNames: string[];
  qty: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  reference: string;
  createdAt: string | null;
  status: OrderStatus;
  note: string;
  notes: string;
  notificationStatus: string;
  updatedAt: string | null;
  updatedBy: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: { line1: string; line2: string; city: string; state: string; zip: string };
  };
  items: OrderLine[];
  subtotal: number;
  currency: string;
}

/* A cart is "abandoned" when it has sat unchanged for an hour without becoming an order request. */
export type CartState = "active" | "abandoned" | "converted";

export const CART_STATE_LABEL: Record<CartState, string> = { active: "Active", abandoned: "Abandoned", converted: "Ordered" };
export const CART_STATE_TONE: Record<CartState, "new" | "ok" | "warn" | "danger" | "quiet"> = { active: "new", abandoned: "warn", converted: "ok" };

/* Holds no name, email or address: only a random id the visitor's browser made, what is in the cart and when. */
export interface Cart {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  state: CartState;
  items: OrderLine[];
  subtotal: number;
}

export interface DayFigures {
  orders: number;
  units: number;
  value: number;
}

export interface ProductFigures {
  slug: string;
  name: string;
  units: number;
  value: number;
  orders: number;
}

/* The shape the Overview and Calendar draw from. src/admin/figures.ts builds it from the daily Firestore documents. */
export interface OrderStats {
  timeZone: string;
  from: string;
  to: string;
  totals: DayFigures & { cancelled: number; averageValue: number };
  byDay: Record<string, DayFigures>;
  byStatus: Record<string, number>;
  byState: Record<string, number>;
  byHour: number[];
  byWeekday: number[];
  products: ProductFigures[];
  truncated: boolean;
}

export interface AuditEntry {
  id: string;
  at: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  orderId: string;
  target: string;
  detail: string;
  count: number | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: "owner" | "staff" | "none";
  enabled: boolean;
  /* True until the person has signed in for the first time. */
  invited: boolean;
  createdAt: string | null;
}

export class AdminApiError extends Error {}

type GetToken = () => Promise<string | null>;

async function call<T>(getToken: GetToken, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!ADMIN_ENDPOINT) throw new AdminApiError("The order service is not connected yet. See README.md, Order dashboard.");
  const token = await getToken();
  if (!token) throw new AdminApiError("Please sign in again.");

  let res: Response;
  try {
    res = await fetch(ADMIN_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(action === "site.publish" ? 30000 : 20000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new AdminApiError("The order service could not be reached.");
  }
  if (res.status === 401) throw new AdminApiError("Your session has expired. Please sign in again.");
  if (res.status === 403) throw new AdminApiError("You do not have access to that.");
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminApiError("The order service returned an incomplete response. Please try again.");
  if (!res.ok || typeof body.error === "string") {
    throw new AdminApiError(typeof body.error === "string" ? body.error : "That did not work. Please try again.");
  }
  return body as T;
}

export const adminApi = {
  listOrders: (getToken: GetToken, options: { from?: string; to?: string; cursor?: string } = {}) =>
    call<{ orders: Order[]; nextCursor: string | null }>(getToken, "orders.list", { ...options, timeZone: BUSINESS_TIME_ZONE }),
  getOrder: (getToken: GetToken, id: string) => call<{ order: Order }>(getToken, "orders.get", { id }),
  updateOrder: (getToken: GetToken, id: string, patch: { status?: OrderStatus; note?: string }) =>
    call<{ ok: true; updatedAt: string; updatedBy: string }>(getToken, "orders.update", { id, ...patch }),
  listCarts: (getToken: GetToken, cursor?: string) => call<{ carts: Cart[]; nextCursor: string | null }>(getToken, "carts.list", cursor ? { cursor } : {}),
  removeCart: (getToken: GetToken, id: string) => call<{ ok: true }>(getToken, "carts.remove", { id }),
  publish: (getToken: GetToken) => call<{ ok: true; already?: boolean }>(getToken, "site.publish"),
  recordExport: (getToken: GetToken, ids: string[]) => call<{ ok: true }>(getToken, "orders.export", { ids }),
  listAudit: (getToken: GetToken, cursor?: string) => call<{ entries: AuditEntry[]; nextCursor: string | null }>(getToken, "audit.list", cursor ? { cursor } : {}),
  listAdmins: (getToken: GetToken) => call<{ admins: AdminUser[] }>(getToken, "admins.list"),
  inviteAdmin: (getToken: GetToken, email: string, role: "owner" | "staff") => call<{ ok: true; created: boolean; email: string }>(getToken, "admins.invite", { email, role }),
  setAdminRole: (getToken: GetToken, id: string, role: "owner" | "staff" | "none") => call<{ ok: true }>(getToken, "admins.setRole", { id, role }),
  setAdminEnabled: (getToken: GetToken, id: string, enabled: boolean) => call<{ ok: true }>(getToken, "admins.setEnabled", { id, enabled }),
  deleteAdmin: (getToken: GetToken, id: string) => call<{ ok: true }>(getToken, "admins.delete", { id }),
  resendInvite: (getToken: GetToken, id: string) => call<{ ok: true; email: string }>(getToken, "admins.resend", { id }),
};

export const itemCount = (order: Order) => order.items.reduce((n, l) => n + l.qty, 0);
