export function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const FREE_SHIPPING_OVER = 75;
export const FLAT_SHIPPING = 7.95;

export function shippingFor(subtotal: number): number {
  return subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : FLAT_SHIPPING;
}
