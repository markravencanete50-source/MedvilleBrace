import type { Product, StoreState } from "./types";

export const CATEGORIES = [
  "Knee",
  "Back & Core",
  "Ankle & Foot",
  "Wrist & Hand",
  "Shoulder & Arm",
  "Elbow",
  "Neck",
];

const created = "2026-01-01T09:00:00.000Z";

// Sample catalogue so the storefront and admin have something to manage.
// Names, prices and stock are placeholders; edit or delete them from /admin/products.
// No product photos are bundled: add real, licensed image URLs per product in the admin.
const p = (
  id: string,
  name: string,
  category: string,
  price: number,
  stock: number,
  status: Product["status"],
  summary: string,
  extra: Partial<Product> = {},
): Product => ({
  id,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  name,
  category,
  sku: `MB-${id.toUpperCase()}`,
  price,
  stock,
  status,
  summary,
  description: `${summary} Sample description: replace this text from the admin dashboard.`,
  createdAt: created,
  ...extra,
});

export const SEED_PRODUCTS: Product[] = [
  p("k01", "Hinged Knee Brace", "Knee", 64.95, 24, "in_stock", "Side-hinged support for unstable or recovering knees.", { featured: true, comparePrice: 79.95 }),
  p("k02", "Knee Sleeve, Compression", "Knee", 29.95, 52, "in_stock", "Low-profile compression for everyday and sport use."),
  p("k03", "Patella Stabilizer Brace", "Knee", 44.95, 0, "sold_out", "Open-patella design that helps track the kneecap."),
  p("b01", "Lumbar Support Brace", "Back & Core", 54.95, 31, "in_stock", "Adjustable lower-back support for work and recovery.", { featured: true }),
  p("b02", "Posture Corrector", "Back & Core", 34.95, 18, "in_stock", "Gentle upper-back reminder to sit and stand tall."),
  p("b03", "Post-Surgical Abdominal Binder", "Back & Core", 49.95, 0, "pending", "Wide compression binder, awaiting new stock."),
  p("a01", "Ankle Stabilizer, Lace-Up", "Ankle & Foot", 39.95, 40, "in_stock", "Figure-8 straps for sprain protection.", { featured: true }),
  p("a02", "Plantar Fasciitis Sleeve", "Ankle & Foot", 19.95, 65, "in_stock", "Arch and heel compression for morning foot pain."),
  p("a03", "Walking Boot, Short", "Ankle & Foot", 89.95, 0, "coming_soon", "Rigid shell walking boot for fracture recovery."),
  p("w01", "Wrist Brace with Splint", "Wrist & Hand", 24.95, 36, "in_stock", "Removable splint for carpal tunnel and sprains."),
  p("w02", "Thumb Spica Brace", "Wrist & Hand", 27.95, 14, "in_stock", "Immobilizes the thumb and wrist joint."),
  p("s01", "Shoulder Immobilizer Sling", "Shoulder & Arm", 42.95, 9, "in_stock", "Padded sling with support strap for post-injury care."),
  p("e01", "Tennis Elbow Strap", "Elbow", 17.95, 60, "in_stock", "Targeted pressure strap for forearm strain."),
  p("n01", "Cervical Collar, Soft", "Neck", 22.95, 0, "coming_soon", "Soft foam collar for short-term neck support."),
  p("d01", "Hot / Cold Therapy Wrap", "Back & Core", 21.95, 0, "draft", "Draft listing, not yet visible on the storefront."),
];

export function seedState(): StoreState {
  return {
    products: SEED_PRODUCTS,
    carts: [],
    orders: [],
    visitorCartId: null,
    nextOrderNumber: 1001,
  };
}
