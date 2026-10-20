"use client";

import { useSyncExternalStore } from "react";
import { seedState } from "./seed";
import { shippingFor, slugify } from "./format";
import type {
  Cart,
  Customer,
  Order,
  OrderStatus,
  Product,
  ProductStatus,
  StoreState,
} from "./types";

/**
 * Front-end-only data layer. State lives in localStorage so the storefront and the
 * admin dashboard share it within one browser. Every mutation goes through the
 * functions below, so swapping this for real API calls later only touches this file.
 */
const KEY = "mb:data:v1";
const SERVER_STATE = seedState();

let state: StoreState = SERVER_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw) as StoreState;
  } catch {
    /* storage unavailable or corrupt: fall back to seed data */
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue) as StoreState;
      listeners.forEach((l) => l());
    } catch {
      /* ignore */
    }
  });
}

function commit(next: StoreState) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: changes stay in memory for this tab */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  load();
  return state;
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/** True once the client has hydrated, so pages can avoid flashing "not found". */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const now = () => new Date().toISOString();
const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

/* ---------- selectors ---------- */

export function isPurchasable(p: Product): boolean {
  return p.status === "in_stock" && p.stock > 0;
}

export function visibleProducts(s: StoreState): Product[] {
  return s.products.filter((p) => p.status !== "draft");
}

export function cartOf(s: StoreState, id: string | null): Cart | undefined {
  return id ? s.carts.find((c) => c.id === id) : undefined;
}

export function cartCount(c?: Cart): number {
  return c ? c.lines.reduce((n, l) => n + l.qty, 0) : 0;
}

export function cartTotal(s: StoreState, c?: Cart): number {
  if (!c) return 0;
  return c.lines.reduce((sum, l) => {
    const p = s.products.find((x) => x.id === l.productId);
    return sum + (p ? p.price * l.qty : 0);
  }, 0);
}

/** A cart left idle this long without checking out counts as abandoned. */
const ABANDON_AFTER_MS = 60 * 60 * 1000;
export function effectiveCartStatus(c: Cart): Cart["status"] {
  if (c.status === "active" && Date.now() - new Date(c.updatedAt).getTime() > ABANDON_AFTER_MS) {
    return "abandoned";
  }
  return c.status;
}

/* ---------- storefront cart ---------- */

function mutateVisitorCart(fn: (c: Cart) => Cart) {
  let carts = state.carts;
  let id = state.visitorCartId;
  let cart = cartOf(state, id);
  if (!cart || cart.status === "converted") {
    cart = { id: uid("cart"), lines: [], status: "active", createdAt: now(), updatedAt: now() };
    id = cart.id;
    carts = [...carts, cart];
  }
  const updated = { ...fn(cart), updatedAt: now(), status: "active" as const };
  commit({
    ...state,
    visitorCartId: id,
    carts: carts.map((c) => (c.id === cart!.id ? updated : c)),
  });
}

export function addToCart(productId: string, qty = 1) {
  const p = state.products.find((x) => x.id === productId);
  if (!p || !isPurchasable(p)) return;
  mutateVisitorCart((c) => {
    const existing = c.lines.find((l) => l.productId === productId);
    const lines = existing
      ? c.lines.map((l) =>
          l.productId === productId ? { ...l, qty: Math.min(p.stock, l.qty + qty) } : l,
        )
      : [...c.lines, { productId, qty: Math.min(p.stock, qty) }];
    return { ...c, lines };
  });
}

export function setCartQty(productId: string, qty: number) {
  const p = state.products.find((x) => x.id === productId);
  const max = p ? Math.max(p.stock, 1) : 1;
  mutateVisitorCart((c) => ({
    ...c,
    lines:
      qty <= 0
        ? c.lines.filter((l) => l.productId !== productId)
        : c.lines.map((l) => (l.productId === productId ? { ...l, qty: Math.min(qty, max) } : l)),
  }));
}

export function setCartEmail(email: string) {
  if (!state.visitorCartId) return;
  commit({
    ...state,
    carts: state.carts.map((c) =>
      c.id === state.visitorCartId ? { ...c, customerEmail: email, updatedAt: now() } : c,
    ),
  });
}

/* ---------- checkout ---------- */

export function placeOrder(customer: Customer, notes = ""): Order | null {
  const cart = cartOf(state, state.visitorCartId);
  if (!cart || cart.lines.length === 0) return null;

  const lines = cart.lines.flatMap((l) => {
    const p = state.products.find((x) => x.id === l.productId);
    return p ? [{ productId: p.id, name: p.name, sku: p.sku, price: p.price, qty: l.qty }] : [];
  });
  if (lines.length === 0) return null;

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = shippingFor(subtotal);
  const order: Order = {
    id: uid("ord"),
    number: `MB-${state.nextOrderNumber}`,
    customer,
    lines,
    subtotal,
    shipping,
    total: subtotal + shipping,
    status: "pending",
    notes,
    createdAt: now(),
    updatedAt: now(),
  };

  const products = state.products.map((p) => {
    const line = lines.find((l) => l.productId === p.id);
    if (!line) return p;
    const stock = Math.max(0, p.stock - line.qty);
    return { ...p, stock, status: stock === 0 && p.status === "in_stock" ? ("sold_out" as const) : p.status };
  });

  commit({
    ...state,
    products,
    orders: [order, ...state.orders],
    nextOrderNumber: state.nextOrderNumber + 1,
    visitorCartId: null,
    carts: state.carts.map((c) =>
      c.id === cart.id ? { ...c, status: "converted", customerEmail: customer.email, updatedAt: now() } : c,
    ),
  });
  return order;
}

/* ---------- admin: products ---------- */

export type ProductInput = Omit<Product, "id" | "slug" | "createdAt"> & { id?: string };

export function saveProduct(input: ProductInput): Product {
  const existing = input.id ? state.products.find((p) => p.id === input.id) : undefined;
  const base = slugify(input.name) || "product";
  let slug = existing && slugify(existing.name) === base ? existing.slug : base;
  const taken = (s: string) => state.products.some((p) => p.slug === s && p.id !== existing?.id);
  for (let i = 2; taken(slug); i++) slug = `${base}-${i}`;

  const product: Product = existing
    ? { ...existing, ...input, id: existing.id, slug }
    : { ...input, id: uid("p"), slug, createdAt: now() };
  commit({
    ...state,
    products: existing
      ? state.products.map((p) => (p.id === existing.id ? product : p))
      : [product, ...state.products],
  });
  return product;
}

export function setProductStatus(id: string, status: ProductStatus) {
  commit({ ...state, products: state.products.map((p) => (p.id === id ? { ...p, status } : p)) });
}

export function setProductStock(id: string, stock: number) {
  const next = Math.max(0, Math.floor(stock) || 0);
  commit({
    ...state,
    products: state.products.map((p) => {
      if (p.id !== id) return p;
      // Hitting zero flips an in-stock item to sold out; restocking does not auto-publish.
      const status = next === 0 && p.status === "in_stock" ? ("sold_out" as const) : p.status;
      return { ...p, stock: next, status };
    }),
  });
}

export function deleteProduct(id: string) {
  commit({
    ...state,
    products: state.products.filter((p) => p.id !== id),
    carts: state.carts.map((c) => ({ ...c, lines: c.lines.filter((l) => l.productId !== id) })),
  });
}

/* ---------- admin: orders ---------- */

export function setOrderStatus(id: string, status: OrderStatus) {
  const order = state.orders.find((o) => o.id === id);
  if (!order || order.status === status) return;

  // Cancelling or refunding an order puts the units back on the shelf (once).
  const releases = (s: OrderStatus) => s === "cancelled" || s === "refunded";
  const restock = !releases(order.status) && releases(status);
  const reopen = releases(order.status) && !releases(status);
  const products = state.products.map((p) => {
    const line = order.lines.find((l) => l.productId === p.id);
    if (!line || (!restock && !reopen)) return p;
    const stock = restock ? p.stock + line.qty : Math.max(0, p.stock - line.qty);
    return { ...p, stock };
  });

  commit({
    ...state,
    products,
    orders: state.orders.map((o) => (o.id === id ? { ...o, status, updatedAt: now() } : o)),
  });
}

export function setOrderNotes(id: string, notes: string) {
  commit({
    ...state,
    orders: state.orders.map((o) => (o.id === id ? { ...o, notes, updatedAt: now() } : o)),
  });
}

export function deleteOrder(id: string) {
  commit({ ...state, orders: state.orders.filter((o) => o.id !== id) });
}

/* ---------- admin: carts ---------- */

export function setCartStatus(id: string, status: Cart["status"]) {
  commit({
    ...state,
    carts: state.carts.map((c) => (c.id === id ? { ...c, status, updatedAt: now() } : c)),
  });
}

export function removeCartLine(cartId: string, productId: string) {
  commit({
    ...state,
    carts: state.carts.map((c) =>
      c.id === cartId
        ? { ...c, lines: c.lines.filter((l) => l.productId !== productId), updatedAt: now() }
        : c,
    ),
  });
}

export function deleteCart(id: string) {
  commit({
    ...state,
    carts: state.carts.filter((c) => c.id !== id),
    visitorCartId: state.visitorCartId === id ? null : state.visitorCartId,
  });
}

export function resetDemoData() {
  commit(seedState());
}
