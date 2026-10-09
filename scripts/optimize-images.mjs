/*
  Converts the downloaded manufacturer photographs into the files the site ships.

    public/products/<slug>/<n>.webp      detail view, longest side 900px
    public/products/<slug>/<n>-sm.webp   cards and thumbnails, longest side 480px

  Originals never ship. A smaller original is never enlarged. Existing outputs
  are skipped, so the step is cheap to rerun.

  scripts/image-blocklist.json lists source photos that must not ship, by
  source product id and source position (1-based): photos that carry another
  store's logo, for example. Blocked photos are dropped and the rest are
  renumbered from 1. Product folders that no longer match the catalog are
  deleted. Afterwards the number of photos each product really has is
  written back into src/data/catalog.json, so a card never asks for a file
  that does not exist.

  Run: npm run images:optimize
*/
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SRC = ".cache/images";
const OUT = "public/products";
const CONCURRENCY = 6;

const catalog = JSON.parse(readFileSync("src/data/catalog.json", "utf8"));
const rules = existsSync("scripts/image-blocklist.json") ? JSON.parse(readFileSync("scripts/image-blocklist.json", "utf8")) : {};
const blocklist = rules.block ?? {};
/* crop: { slug: { sourcePosition: [x0, y0, x1, y1] } } as fractions of the
   photo. Used where a placard or a printed logo sits beside the product: the
   crop keeps the product and leaves the rest out. */
const crops = rules.crop ?? {};
const slugs = new Set(catalog.products.map((p) => p.slug));

/* Remove folders for products that left the catalog. */
let removed = 0;
if (existsSync(OUT)) {
  for (const dir of readdirSync(OUT)) {
    if (!slugs.has(dir)) {
      rmSync(`${OUT}/${dir}`, { recursive: true, force: true });
      removed++;
    }
  }
}

const idBySlug = new Map(JSON.parse(readFileSync(".cache/image-sources.json", "utf8")).map((s) => [s.slug, s.id]));

const jobs = [];
for (const p of catalog.products) {
  const id = idBySlug.get(p.slug);
  const dir = `${SRC}/${id}`;
  if (!id || !existsSync(dir)) continue;
  const blocked = new Set(blocklist[id] ?? []);
  const cropFor = crops[id] ?? {};
  /* A product with rules is rebuilt from scratch, because its numbering or pixels change. */
  if (blocked.size || Object.keys(cropFor).length) rmSync(`${OUT}/${p.slug}`, { recursive: true, force: true });
  const sources = readdirSync(dir)
    .filter((f) => !blocked.has(Number(f.split(".")[0])))
    .sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
  sources.forEach((f, i) => jobs.push({ slug: p.slug, n: i + 1, input: `${dir}/${f}`, crop: cropFor[f.split(".")[0]] }));
}

const converted = new Map();
let failures = 0;
let i = 0;

async function convert(job) {
  const outDir = `${OUT}/${job.slug}`;
  mkdirSync(outDir, { recursive: true });
  const big = `${outDir}/${job.n}.webp`;
  const small = `${outDir}/${job.n}-sm.webp`;
  if (!existsSync(big) || !existsSync(small)) {
    /* Flatten onto white: product photographs are shot on white, and a
       transparent PNG would otherwise pick up the tinted card behind it. */
    let base = sharp(job.input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
    if (job.crop) {
      const { width, height } = await sharp(job.input, { failOn: "none" }).rotate().metadata();
      const [x0, y0, x1, y1] = job.crop;
      const region = { left: Math.round(x0 * width), top: Math.round(y0 * height), width: Math.round((x1 - x0) * width), height: Math.round((y1 - y0) * height) };
      base = sharp(await base.extract(region).toBuffer());
    }
    await base.clone().resize(900, 900, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(big);
    await base.clone().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toFile(small);
  }
  const list = converted.get(job.slug) ?? [];
  list.push(job.n);
  converted.set(job.slug, list);
}

async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    try {
      await convert(job);
    } catch (e) {
      failures++;
      console.log(`skip ${job.input}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

/* Photos are numbered 1..n; keep only an unbroken run from 1 so the site can
   address them by count alone. */
for (const p of catalog.products) {
  const have = new Set(converted.get(p.slug) ?? []);
  let count = 0;
  while (have.has(count + 1)) count++;
  p.images = count;
}
writeFileSync("src/data/catalog.json", JSON.stringify(catalog));

const without = catalog.products.filter((p) => p.images === 0).length;
console.log(`converted ${jobs.length - failures}/${jobs.length}, removed ${removed} stale folders, products without a photo: ${without}`);
