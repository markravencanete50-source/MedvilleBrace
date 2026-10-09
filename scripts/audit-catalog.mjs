/*
  Checks the generated catalog and the built site before anything is pushed.

    - every product's photo count matches the files on disk
    - slugs are unique, titles are present, prices parse
    - every product has a detail file and a prerendered page in dist/
    - every product address is in dist/sitemap.xml
    - the source store's name appears nowhere in shipped data or source
    - no long dashes anywhere in the repository's text files

  Run after `npm run build`: npm run audit
*/
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const fail = (msg) => problems.push(msg);

const { products } = JSON.parse(readFileSync("src/data/catalog.json", "utf8"));
const slugs = new Set();
for (const p of products) {
  if (slugs.has(p.slug)) fail(`duplicate slug ${p.slug}`);
  slugs.add(p.slug);
  if (!p.title?.trim()) fail(`empty title ${p.slug}`);
  if (!Number.isFinite(p.priceMin) || p.priceMin <= 0) fail(`bad price ${p.slug}`);
  for (let n = 1; n <= p.images; n++) {
    for (const f of [`${n}.webp`, `${n}-sm.webp`]) if (!existsSync(`public/products/${p.slug}/${f}`)) fail(`missing photo ${p.slug}/${f}`);
  }
  if (existsSync(`public/products/${p.slug}/${p.images + 1}.webp`)) fail(`uncounted photo ${p.slug}/${p.images + 1}.webp`);
  if (!existsSync(`public/data/p/${p.slug}.json`)) fail(`missing detail ${p.slug}`);
  if (existsSync("dist") && !existsSync(`dist/product/${p.slug}/index.html`)) fail(`missing prerendered page ${p.slug}`);
}

if (existsSync("dist/sitemap.xml")) {
  const sitemap = readFileSync("dist/sitemap.xml", "utf8");
  for (const s of slugs) if (!sitemap.includes(`/product/${s}<`)) fail(`not in sitemap ${s}`);
} else {
  fail("dist/sitemap.xml not found: run npm run build first");
}

/* Text checks across everything that ships or is committed. */
const SOURCE = /brace\s*direct|bracedirect/i;
const LONG_DASH = /\u2014/;
const SKIP = new Set(["node_modules", "dist", ".cache", ".git"]);
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|css|html|md|txt|xml)$/;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (TEXT.test(name)) {
      const text = readFileSync(path, "utf8");
      if (LONG_DASH.test(text)) fail(`long dash in ${path}`);
      /* The build and audit scripts name the source on purpose, to filter it out. */
      const allowed = /scripts[\\/](build-catalog|fetch-catalog|audit-catalog)\.mjs$|README\.md$|CLAUDE\.md$/.test(path);
      if (!allowed && SOURCE.test(text)) fail(`source name in ${path}`);
    }
  }
}
walk(".");

if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems.slice(0, 60)) console.log(`  ${p}`);
  process.exit(1);
}
console.log(`audit passed: ${products.length} products, ${products.reduce((n, p) => n + p.images, 0)} photos`);
