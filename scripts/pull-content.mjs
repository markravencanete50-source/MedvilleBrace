/*
  Copies the store content the team edits in the dashboard into
  src/data/content.json, so the website can be built from it.

  Source: Firestore documents store/settings, store/faqs and store/catalog,
  read over the public REST API (they hold no customer data and need no
  sign-in). With no VITE_FIREBASE_PROJECT_ID, the committed defaults in
  src/data/content-defaults.json are used.

  Runs before `npm run dev` and, with --strict, at the start of
  `npm run build`. Strict means a project id is set and any failure stops the
  build: a store change that cannot be read must never be published as if it
  were not there. Without --strict a failure falls back to the defaults.

  --from <file.json> reads a local file shaped like the three documents,
  { settings, faqs: { items }, catalog: { products } }. For local tests only.

  Everything read is checked before it is used: unknown products, unknown
  fields and out-of-range numbers are dropped, so a bad edit cannot break the
  build or put a wrong price on the site.
*/
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadEnv } from "vite";
import { fromFields } from "../aws/src/firestore.mjs";

const strict = process.argv.includes("--strict");
const fromIdx = process.argv.indexOf("--from");
const fromFile = fromIdx > 0 ? process.argv[fromIdx + 1] : "";
if (fromIdx > 0 && !fromFile) {
  console.error("content: --from needs a file path");
  process.exit(1);
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || loadEnv("production", process.cwd(), "VITE_").VITE_FIREBASE_PROJECT_ID || "";
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

const defaults = await readJson("src/data/content-defaults.json");

/* ---------- reading ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* One document's fields, or null when it does not exist (404). */
async function getDoc(name) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/store/${name}`;
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(500 * 3 ** (attempt - 1));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return fromFields((await res.json()).fields);
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`store/${name}: ${last?.message ?? "failed"}`);
}

/* ---------- checking ---------- */

const text = (v, max, { required = false } = {}) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if ((required && !t) || t.length > max) return null;
  return t;
};
const num = (v, max) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < max ? v : null);

function cleanSettings(doc) {
  const d = defaults.settings;
  if (!doc || typeof doc !== "object") return { ...d };
  return {
    email: text(doc.email, 200, { required: true }) ?? d.email,
    phone: text(doc.phone, 40) ?? d.phone,
    hours: text(doc.hours, 200, { required: true }) ?? d.hours,
    freeShippingFrom: num(doc.freeShippingFrom, 100000) ?? d.freeShippingFrom,
    returnDays: Math.round(num(doc.returnDays, 366) ?? d.returnDays),
    notice: text(doc.notice, 200) ?? d.notice,
  };
}

function cleanFaqs(doc) {
  if (!doc || !Array.isArray(doc.items)) return defaults.faqs.map((f) => ({ ...f }));
  const out = [];
  for (const it of doc.items.slice(0, 60)) {
    if (!it || typeof it !== "object") continue;
    const q = text(it.q, 300, { required: true });
    const a = text(it.a, 3000, { required: true });
    if (q && a) out.push({ q, a });
  }
  return out.length ? out : defaults.faqs.map((f) => ({ ...f }));
}

const variantKey = (v) => v.s || v.o.join("|");
const round2 = (n) => Math.round(n * 100) / 100;

async function cleanProducts(doc) {
  const raw = doc && typeof doc.products === "object" && doc.products ? doc.products : {};
  const known = new Set((await readJson("src/data/catalog.json")).products.map((p) => p.slug));
  const out = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (!known.has(slug) || !entry || typeof entry !== "object") continue;
    if (entry.hidden === true) {
      out[slug] = { hidden: true };
      continue;
    }
    const src = entry.variants && typeof entry.variants === "object" ? entry.variants : {};
    const file = `public/data/p/${slug}.json`;
    if (!existsSync(file)) continue;
    const variants = (await readJson(file)).variants;
    const byKey = new Map(variants.map((v) => [variantKey(v), v]));
    const changes = {};
    for (const [key, c] of Object.entries(src)) {
      if (!byKey.has(key) || !c || typeof c !== "object") continue;
      const change = {};
      const p = num(c.p, 100000);
      if (p !== null) change.p = round2(p);
      if (c.a === false) change.a = false;
      if (Object.keys(change).length) changes[key] = change;
    }
    if (!Object.keys(changes).length) continue;
    const applied = variants.map((v) => {
      const c = changes[variantKey(v)];
      return { p: c?.p ?? v.p, a: c?.a === false ? false : v.a !== false };
    });
    const prices = applied.map((v) => v.p);
    out[slug] = {
      variants: changes,
      index: { priceMin: Math.min(...prices), priceMax: Math.max(...prices), available: applied.some((v) => v.a) },
    };
  }
  return out;
}

/* ---------- run ---------- */

async function gather() {
  if (fromFile) {
    const f = await readJson(fromFile);
    return { source: "file", docs: { settings: f.settings ?? null, faqs: f.faqs ?? null, catalog: f.catalog ?? null } };
  }
  if (!projectId) return { source: "defaults", docs: { settings: null, faqs: null, catalog: null } };
  const [settings, faqs, catalog] = await Promise.all([getDoc("settings"), getDoc("faqs"), getDoc("catalog")]);
  return { source: "firebase", docs: { settings, faqs, catalog } };
}

let result;
try {
  result = await gather();
} catch (e) {
  if (strict && projectId && !fromFile) {
    console.error(`content: could not read the store content (${e.message}). Build stopped so stale content is not published.`);
    process.exit(1);
  }
  console.warn(`content: could not read the store content (${e.message}); using the defaults.`);
  result = { source: "defaults", docs: { settings: null, faqs: null, catalog: null } };
}

const content = {
  source: result.source === "file" ? "firebase" : result.source,
  pulledAt: new Date().toISOString(),
  settings: cleanSettings(result.docs.settings),
  faqs: cleanFaqs(result.docs.faqs),
  products: await cleanProducts(result.docs.catalog),
};
await writeFile("src/data/content.json", JSON.stringify(content, null, 2) + "\n");

const hidden = Object.values(content.products).filter((p) => p.hidden).length;
const changed = Object.keys(content.products).length - hidden;
console.log(`content: ${result.source}, ${content.faqs.length} questions, ${hidden} hidden, ${changed} changed products`);
