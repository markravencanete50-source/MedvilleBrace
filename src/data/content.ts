/*
  Store content the team edits in the dashboard: contact details, the
  questions page and changes to products (prices, stock, hidden products).

  The dashboard saves it to Firestore (store/settings, store/faqs,
  store/catalog). scripts/pull-content.mjs copies it into content.json at the
  start of every build, so the website itself never calls Firebase: a change
  goes live when the site is rebuilt (the dashboard's Publish button).
  Without a Firebase project, content.json holds content-defaults.json.
*/
import raw from "./content.json";

export type StoreSettings = {
  email: string;
  phone: string;
  hours: string;
  freeShippingFrom: number;
  returnDays: number;
  /* A short line shown at the top of every page. Empty shows nothing. */
  notice: string;
};
export type Faq = { q: string; a: string };
export type VariantChange = { p?: number; a?: false };
export type ProductChange = {
  hidden?: true;
  variants?: Record<string, VariantChange>;
  /* Filled in by the build from the product's variants with the changes applied. */
  index?: { priceMin: number; priceMax: number; available: boolean };
};

export type StoreContent = {
  source: "firebase" | "defaults";
  pulledAt: string;
  settings: StoreSettings;
  faqs: Faq[];
  products: Record<string, ProductChange>;
};

export const CONTENT = raw as StoreContent;

/* How a variant is named in store/catalog: its SKU, or its option values when it has none. */
export const variantKey = (v: { s: string; o: string[] }) => v.s || v.o.join("|");

export const productChange = (slug: string): ProductChange | undefined =>
  Object.hasOwn(CONTENT.products, slug) ? CONTENT.products[slug] : undefined;
