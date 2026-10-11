/*
  Reading and writing the editable store content in Firestore.

  Three documents, all public to read (the build copies them into the site)
  and writable only by a signed-in person with a role (firestore.rules):

    store/settings  contact details and shop terms      owner only
    store/faqs      the questions page                   owner or staff
    store/catalog   product changes: hidden, price, stock owner or staff

  Every write stamps updatedAt (the server's clock) and updatedBy (the
  person's email). The rules refuse a write that does not, so the dashboard
  can always say who changed what last, and when.

  The limits below are the same numbers firestore.rules enforces. Keep the two
  in step.
*/
import { deleteField, doc, FieldPath, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore/lite";
import defaults from "../data/content-defaults.json";
import type { Faq, ProductChange, StoreSettings } from "../data/content";
import { getFirestoreLite } from "./firebase";

export const LIMITS = {
  email: 254,
  phone: 40,
  hours: 200,
  notice: 200,
  freeShippingFrom: 100000,
  returnDays: 365,
  faqs: 40,
  question: 200,
  answer: 2000,
  price: 100000,
  products: 5000,
};

export const DEFAULT_SETTINGS: StoreSettings = defaults.settings;
export const DEFAULT_FAQS: Faq[] = defaults.faqs;

export type StoreDocName = "settings" | "faqs" | "catalog";

export interface StoreDoc {
  exists: boolean;
  data: Record<string, unknown>;
  updatedAt: Date | null;
  updatedBy: string;
}

export class StoreError extends Error {}

/* What Firestore says, in words that never name a document or a person. */
export function plainStoreProblem(problem: unknown) {
  const code = typeof (problem as { code?: unknown })?.code === "string" ? (problem as { code: string }).code : "";
  if (code.includes("permission-denied")) return "You do not have permission to change that. Ask an owner.";
  if (code.includes("unauthenticated")) return "Please sign in again.";
  if (code.includes("unavailable") || code.includes("deadline") || /network|fetch|Failed to load/i.test(String((problem as Error)?.message ?? ""))) {
    return "The store database could not be reached. Check the connection and try again.";
  }
  if (code.includes("resource-exhausted")) return "Too many changes just now. Wait a moment and try again.";
  if (code.includes("invalid-argument") || code.includes("failed-precondition")) return "That change was not accepted. Check what you entered and try again.";
  return "That did not work. Please try again.";
}

async function reference(name: StoreDocName) {
  return doc(await getFirestoreLite(), "store", name);
}

export async function readStoreDoc(name: StoreDocName): Promise<StoreDoc> {
  try {
    const snap = await getDoc(await reference(name));
    const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
    const stamp = data.updatedAt as { toDate?: () => Date } | undefined;
    return {
      exists: snap.exists(),
      data,
      updatedAt: typeof stamp?.toDate === "function" ? stamp.toDate() : null,
      updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
    };
  } catch (problem) {
    throw new StoreError(plainStoreProblem(problem));
  }
}

const stamp = (email: string) => ({ updatedAt: serverTimestamp(), updatedBy: email });

export async function writeSettings(settings: StoreSettings, email: string) {
  try {
    await setDoc(await reference("settings"), { ...settings, ...stamp(email) });
  } catch (problem) {
    throw new StoreError(plainStoreProblem(problem));
  }
}

export async function writeFaqs(items: Faq[], email: string) {
  try {
    await setDoc(await reference("faqs"), { items, ...stamp(email) });
  } catch (problem) {
    throw new StoreError(plainStoreProblem(problem));
  }
}

/*
  Saves one product's changes. The entry replaces what was there; null removes
  the product from the document, so only products that differ from the supplier's
  feed are ever listed. If the document does not exist yet, it is created first.
*/
export async function writeProductChange(slug: string, entry: ProductChange | null, email: string, docExists: boolean) {
  try {
    const ref = await reference("catalog");
    if (!docExists) {
      if (entry) await setDoc(ref, { products: { [slug]: entry }, ...stamp(email) });
      return;
    }
    await updateDoc(ref, new FieldPath("products", slug), entry ?? deleteField(), "updatedAt", serverTimestamp(), "updatedBy", email);
  } catch (problem) {
    throw new StoreError(plainStoreProblem(problem));
  }
}

/* The catalog document's products, trimmed to the shape the dashboard understands. */
export function readChanges(data: Record<string, unknown>): Record<string, ProductChange> {
  const raw = data.products;
  const out: Record<string, ProductChange> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [slug, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const v = value as { hidden?: unknown; variants?: unknown };
    const entry: ProductChange = {};
    if (v.hidden === true) entry.hidden = true;
    if (v.variants && typeof v.variants === "object") {
      const variants: NonNullable<ProductChange["variants"]> = {};
      for (const [key, c] of Object.entries(v.variants as Record<string, { p?: unknown; a?: unknown }>)) {
        const change: { p?: number; a?: false } = {};
        if (typeof c?.p === "number" && Number.isFinite(c.p)) change.p = c.p;
        if (c?.a === false) change.a = false;
        if (change.p !== undefined || change.a === false) variants[key] = change;
      }
      if (Object.keys(variants).length) entry.variants = variants;
    }
    if (entry.hidden || entry.variants) out[slug] = entry;
  }
  return out;
}

export function readSettings(data: Record<string, unknown>): StoreSettings {
  const d = DEFAULT_SETTINGS;
  return {
    email: typeof data.email === "string" ? data.email : d.email,
    phone: typeof data.phone === "string" ? data.phone : d.phone,
    hours: typeof data.hours === "string" ? data.hours : d.hours,
    freeShippingFrom: typeof data.freeShippingFrom === "number" ? data.freeShippingFrom : d.freeShippingFrom,
    returnDays: typeof data.returnDays === "number" ? data.returnDays : d.returnDays,
    notice: typeof data.notice === "string" ? data.notice : d.notice,
  };
}

export function readFaqs(data: Record<string, unknown>): Faq[] {
  if (!Array.isArray(data.items)) return DEFAULT_FAQS.map((f) => ({ ...f }));
  return data.items
    .filter((i): i is { q: string; a: string } => Boolean(i) && typeof i.q === "string" && typeof i.a === "string")
    .map((i) => ({ q: i.q, a: i.a }));
}
