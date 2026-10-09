/*
  Browser-only shopping state: the cart, the comparison list and recently
  viewed products. Everything lives in localStorage on the visitor's own
  device; nothing is sent anywhere until they choose to send an order request.

  Storage can be unavailable (private windows, blocked site data), so every
  read and write is guarded and the site still works for the current visit.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
  key: string;
  slug: string;
  sku: string;
  options: string[];
  optionNames: string[];
  price: number;
  qty: number;
};

type Store = {
  cart: CartLine[];
  addToCart: (line: Omit<CartLine, "key" | "qty">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  compare: string[];
  toggleCompare: (slug: string) => void;
  clearCompare: () => void;
  recent: string[];
  pushRecent: (slug: string) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

export const COMPARE_LIMIT = 3;
const RECENT_LIMIT = 12;

function read<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: state still works for this visit */
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>(() => (typeof window === "undefined" ? [] : read("mb.cart", [])));
  const [compare, setCompare] = useState<string[]>(() => (typeof window === "undefined" ? [] : read("mb.compare", [])));
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : read("mb.recent", [])));
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => write("mb.cart", cart), [cart]);
  useEffect(() => write("mb.compare", compare), [compare]);
  useEffect(() => write("mb.recent", recent), [recent]);

  const addToCart = useCallback((line: Omit<CartLine, "key" | "qty">, qty = 1) => {
    const key = `${line.slug}::${line.sku || line.options.join("|")}`;
    setCart((c) => {
      const found = c.find((l) => l.key === key);
      if (found) return c.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...c, { ...line, key, qty }];
    });
    setCartOpen(true);
  }, []);
  const setQty = useCallback((key: string, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l))));
  }, []);
  const removeLine = useCallback((key: string) => setCart((c) => c.filter((l) => l.key !== key)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const toggleCompare = useCallback((slug: string) => {
    setCompare((c) => (c.includes(slug) ? c.filter((s) => s !== slug) : c.length >= COMPARE_LIMIT ? [...c.slice(1), slug] : [...c, slug]));
  }, []);
  const clearCompare = useCallback(() => setCompare([]), []);
  const pushRecent = useCallback((slug: string) => {
    setRecent((r) => [slug, ...r.filter((s) => s !== slug)].slice(0, RECENT_LIMIT));
  }, []);

  const value = useMemo<Store>(
    () => ({
      cart,
      addToCart,
      setQty,
      removeLine,
      clearCart,
      cartCount: cart.reduce((n, l) => n + l.qty, 0),
      cartTotal: cart.reduce((n, l) => n + l.qty * l.price, 0),
      compare,
      toggleCompare,
      clearCompare,
      recent,
      pushRecent,
      cartOpen,
      setCartOpen,
    }),
    [cart, addToCart, setQty, removeLine, clearCart, compare, toggleCompare, clearCompare, recent, pushRecent, cartOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
