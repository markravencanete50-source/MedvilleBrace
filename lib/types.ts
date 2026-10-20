export type ProductStatus = "in_stock" | "sold_out" | "pending" | "coming_soon" | "draft";

export const PRODUCT_STATUSES: { value: ProductStatus; label: string; hint: string }[] = [
  { value: "in_stock", label: "In stock", hint: "Visible and purchasable" },
  { value: "sold_out", label: "Sold out", hint: "Visible, purchase disabled" },
  { value: "pending", label: "Pending", hint: "Visible, awaiting restock or approval" },
  { value: "coming_soon", label: "Coming soon", hint: "Visible as an upcoming product" },
  { value: "draft", label: "Draft / hidden", hint: "Not shown on the storefront" },
];

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  sku: string;
  price: number;
  comparePrice?: number;
  stock: number;
  status: ProductStatus;
  summary: string;
  description: string;
  /** Image URL. Left empty until real, licensed product photos are added. */
  image?: string;
  featured?: boolean;
  createdAt: string;
}

export interface CartLine {
  productId: string;
  qty: number;
}

export type CartStatus = "active" | "abandoned" | "converted";

export interface Cart {
  id: string;
  lines: CartLine[];
  status: CartStatus;
  customerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

export interface OrderLine {
  productId: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
}

export interface Order {
  id: string;
  number: string;
  customer: Customer;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreState {
  products: Product[];
  carts: Cart[];
  orders: Order[];
  visitorCartId: string | null;
  nextOrderNumber: number;
}
