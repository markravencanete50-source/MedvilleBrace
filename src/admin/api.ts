/*
  Client for the dashboard API (aws/src/admin.mjs, POST /admin).

  Everything that touches customer orders goes through here, and the shape of
  these calls is deliberate:

  - Always POST. An order id never appears in a URL, because URLs reach
    browser history, proxy logs and referrer headers.
  - Always a current Cognito ID token in the Authorization header. API Gateway
    checks it before the Lambda runs.
  - Responses never enter the browser HTTP cache. A small in-memory cache
    only spares repeat reads of the figures while this tab is open. It is
    cleared on sign-out, token changes and every change.
  - Errors surface as plain sentences. The server never sends detail back and
    this never invents any.
*/
import { ADMIN_ENDPOINT } from "./cognito";
import { BUSINESS_TIME_ZONE } from "./days";

export const isAdminApiConfigured = () => Boolean(ADMIN_ENDPOINT);

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
  status: string;
  createdAt: string | null;
}

export class AdminApiError extends Error {}

type GetToken = () => Promise<string | null>;

const READ_TTL_MS: Record<string, number> = { "orders.stats": 30_000 };
const CHANGES = new Set(["orders.update", "admins.invite", "admins.setRole", "admins.setEnabled", "admins.delete"]);

const readCache = new Map<string, { expiresAt: number; request: Promise<unknown> }>();

export function clearAdminApiCache() {
  readCache.clear();
}

async function call<T>(getToken: GetToken, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const ttl = READ_TTL_MS[action] ?? 0;
  const key = ttl ? `${action}:${JSON.stringify(payload)}` : "";
  const now = Date.now();
  if (ttl) {
    const hit = readCache.get(key);
    if (hit && hit.expiresAt > now) return hit.request as Promise<T>;
    for (const [k, v] of readCache) if (v.expiresAt <= now) readCache.delete(k);
  }
  const request = callNetwork<T>(getToken, action, payload);
  if (ttl) {
    readCache.set(key, { expiresAt: now + ttl, request });
    request.catch(() => readCache.get(key)?.request === request && readCache.delete(key));
  } else if (CHANGES.has(action)) {
    request.then(clearAdminApiCache, () => undefined);
  }
  return request;
}

async function callNetwork<T>(getToken: GetToken, action: string, payload: Record<string, unknown>): Promise<T> {
  if (!ADMIN_ENDPOINT) throw new AdminApiError("The order service is not connected yet. See README.md, Order dashboard.");
  const token = await getToken();
  if (!token) throw new AdminApiError("Please sign in again.");

  let res: Response;
  try {
    res = await fetch(ADMIN_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
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
  stats: (getToken: GetToken, range: { from: string; to: string }) =>
    call<OrderStats>(getToken, "orders.stats", { ...range, timeZone: BUSINESS_TIME_ZONE }),
  recordExport: (getToken: GetToken, ids: string[]) => call<{ ok: true }>(getToken, "orders.export", { ids }),
  listAudit: (getToken: GetToken, cursor?: string) => call<{ entries: AuditEntry[]; nextCursor: string | null }>(getToken, "audit.list", cursor ? { cursor } : {}),
  listAdmins: (getToken: GetToken) => call<{ admins: AdminUser[] }>(getToken, "admins.list"),
  inviteAdmin: (getToken: GetToken, email: string, role: "owner" | "staff") => call<{ ok: true; created: boolean }>(getToken, "admins.invite", { email, role }),
  setAdminRole: (getToken: GetToken, id: string, role: "owner" | "staff" | "none") => call<{ ok: true }>(getToken, "admins.setRole", { id, role }),
  setAdminEnabled: (getToken: GetToken, id: string, enabled: boolean) => call<{ ok: true }>(getToken, "admins.setEnabled", { id, enabled }),
  deleteAdmin: (getToken: GetToken, id: string) => call<{ ok: true }>(getToken, "admins.delete", { id }),
  resendInvite: (getToken: GetToken, id: string) => call<{ ok: true }>(getToken, "admins.resend", { id }),
};

export const itemCount = (order: Order) => order.items.reduce((n, l) => n + l.qty, 0);
