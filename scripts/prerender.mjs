/*
  Writes a real HTML file for every address on the site.

  This is a single-page app, so without this step a crawler that does not run
  JavaScript (and every link-preview bot) would see the home page's title on
  all ~880 addresses. After Vite builds, this copies dist/index.html to
  dist/<path>/index.html for each address with that page's title,
  description, canonical link, Open Graph and Twitter tags and JSON-LD
  swapped in. React boots from the same bundle and takes over.

  Wording comes from the same modules the pages read (src/data/*), compiled
  on the fly with esbuild, so nothing here can drift from the site.

  Also written: dist/sitemap.xml and dist/robots.txt (from SITE_ORIGIN) and
  dist/404.html for hosts that serve it on unknown addresses.
*/
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const DIST = "dist";

async function loadModule(entry) {
  const out = join(tmpdir(), `${randomUUID()}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "error", define: { "import.meta.env": "{}" } });
  return import(`file://${out.replace(/\\/g, "/")}`);
}

const escape = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function clamp(text, limit = 158) {
  const v = String(text ?? "").replace(/\s+/g, " ").trim();
  return v.length <= limit ? v : `${v.slice(0, v.lastIndexOf(" ", limit - 1))}...`;
}

const [catalog, taxonomy, site, guides, policies, cdn] = await Promise.all([
  loadModule("src/data/catalog.ts"),
  loadModule("src/data/taxonomy.ts"),
  loadModule("src/data/site.ts"),
  loadModule("src/data/guides.ts"),
  loadModule("src/data/policies.ts"),
  loadModule("src/lib/cdn.ts"),
]);
const ORIGIN = site.SITE_ORIGIN;
const NAME = site.SITE_NAME;
const DEFAULT_DESC =
  "Orthopedic braces, supports and recovery products from trusted manufacturers, chosen by body region and condition, with sizing help from a real person.";
const title = (t) => (t ? `${t} | ${NAME}` : `${NAME} | Orthopedic Braces and Supports`);
const abs = (src) => (src.startsWith("http") ? src : `${ORIGIN}${src}`);
const photo = (name, w = 1200) => cdn.cdnUrl(`photography/${name}`, w, `/photography/${name}.webp`);

function crumbs(list) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...list].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  };
}

const pages = [];
const add = (p) => pages.push(p);

const ORG = { "@context": "https://schema.org", "@type": "Store", name: NAME, url: `${ORIGIN}/`, logo: `${ORIGIN}/brand/mark-512.png`, email: site.COMPANY.email };
add({ path: "/", title: title(), description: DEFAULT_DESC, jsonLd: [ORG] });
add({ path: "/shop", title: title("Shop all products"), description: "Every brace, support and recovery product we carry, in one place.", jsonLd: [crumbs([{ name: "Shop", path: "/shop" }])] });

for (const r of taxonomy.REGIONS) {
  add({ path: `/shop/${r.slug}`, title: title(`${r.name} braces and supports`), description: r.blurb, image: photo(r.photo), jsonLd: [crumbs([{ name: "Shop", path: "/shop" }, { name: r.name, path: `/shop/${r.slug}` }])] });
}
for (const c of catalog.CATEGORIES) {
  add({ path: `/category/${c.slug}`, title: title(catalog.pluralCategory(c.name)), description: taxonomy.CATEGORY_NOTES[c.slug] ?? `${c.count} ${c.name} products.`, jsonLd: [crumbs([{ name: "Shop", path: "/shop" }, { name: c.name, path: `/category/${c.slug}` }])] });
}
add({ path: "/brands", title: title("Brands"), description: "Orthopedic brands carried by Medville Brace, with the number of products from each." });
for (const b of catalog.BRANDS) {
  add({ path: `/brands/${b.slug}`, title: title(`${b.name} products`), description: `${b.count} ${b.name} products, with sizes and prices.`, jsonLd: [crumbs([{ name: "Brands", path: "/brands" }, { name: b.name, path: `/brands/${b.slug}` }])] });
}

for (const p of catalog.PRODUCTS) {
  const image = p.images ? catalog.imageSrc(p, 1, "lg") : undefined;
  const region = taxonomy.regionBySlug(p.region);
  add({
    path: `/product/${p.slug}`,
    title: title(`${p.brand} ${p.title}`),
    description: p.summary,
    image,
    type: "product",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: `${p.brand} ${p.title}`,
        description: p.summary,
        brand: { "@type": "Brand", name: p.brand },
        category: catalog.categoryName(p.category),
        ...(image ? { image: abs(image) } : {}),
        offers: {
          "@type": p.priceMin === p.priceMax ? "Offer" : "AggregateOffer",
          priceCurrency: "USD",
          ...(p.priceMin === p.priceMax ? { price: p.priceMin.toFixed(2) } : { lowPrice: p.priceMin.toFixed(2), highPrice: p.priceMax.toFixed(2) }),
          availability: p.available ? "https://schema.org/InStock" : "https://schema.org/LimitedAvailability",
          url: `${ORIGIN}/product/${p.slug}`,
        },
      },
      crumbs([
        { name: region?.name ?? "Shop", path: `/shop/${p.region}` },
        { name: catalog.categoryName(p.category), path: `/category/${p.category}` },
        { name: p.title, path: `/product/${p.slug}` },
      ]),
    ],
  });
}

add({ path: "/fit-finder", title: title("Fit Finder"), description: "Answer four short questions about where you need support and why, and get a short list of braces and recovery products to discuss with your clinician." });
add({ path: "/size-guide", title: title("Size guide"), description: "How to measure for knee, ankle, back, neck, shoulder, elbow and wrist braces with a soft tape, and how to read a manufacturer's size chart." });
add({ path: "/guides", title: title("Recovery guides"), description: "Plain-English guides to measuring for a brace, choosing a walker boot or back brace, and using cold therapy and night splints safely." });
for (const g of guides.GUIDES) {
  add({
    path: `/guides/${g.slug}`,
    title: title(g.title),
    description: g.description,
    image: photo(g.photo),
    type: "article",
    lastmod: g.updated,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, image: abs(photo(g.photo)), dateModified: g.updated, publisher: { "@type": "Organization", name: NAME } },
      crumbs([{ name: "Guides", path: "/guides" }, { name: g.title, path: `/guides/${g.slug}` }]),
    ],
  });
}
add({ path: "/clinicians", title: title("Clinician Partner Program"), description: "Volume pricing, one contact for every brand, and orders shipped to your clinic or to your patient." });
add({ path: "/about", title: title("About us"), description: "Medville Brace helps people find the right brace, in the right size, from the brands clinicians already trust." });
add({ path: "/contact", title: title("Contact"), description: "Email Medville Brace with a sizing question, an order question or a return.", jsonLd: [ORG] });
add({
  path: "/faq",
  title: title("Questions and answers"),
  description: "How paying, sizing, insurance, returns and renewed items work at Medville Brace.",
  jsonLd: [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: policies.FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }],
});
for (const p of policies.POLICIES) add({ path: `/policies/${p.slug}`, title: title(p.title), description: p.description });
/* Private pages: written so a direct visit gets the right title, kept out of the sitemap. */
for (const [path, t] of [["/cart", "Your cart"], ["/request-order", "Send an order request"], ["/compare", "Compare products"]]) add({ path, title: title(t), description: DEFAULT_DESC, noindex: true });

function render(template, p) {
  const url = `${ORIGIN}${p.path === "/" ? "/" : p.path}`;
  const desc = clamp(p.description);
  const pic = p.image ? abs(p.image) : `${ORIGIN}/og-image.jpg`;
  let html = template;
  const swap = (re, value) => {
    html = html.replace(re, value);
  };
  swap(/<title>[\s\S]*?<\/title>/, `<title>${escape(p.title)}</title>`);
  swap(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escape(desc)}" />`);
  swap(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escape(url)}" />`);
  swap(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escape(url)}" />`);
  swap(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${p.type === "article" ? "article" : "website"}" />`);
  for (const [attr, tag, value] of [
    ["property", "og:title", p.title],
    ["name", "twitter:title", p.title],
    ["property", "og:description", desc],
    ["name", "twitter:description", desc],
    ["property", "og:image", pic],
    ["name", "twitter:image", pic],
  ]) {
    swap(new RegExp(`<meta ${attr}="${tag}" content="[^"]*" />`), `<meta ${attr}="${tag}" content="${escape(value)}" />`);
  }
  if (p.image) {
    /* The declared size and type describe og-image.jpg; a different picture must not inherit them. */
    for (const tag of ["og:image:type", "og:image:width", "og:image:height"]) swap(new RegExp(`\\s*<meta property="${tag}" content="[^"]*" />`), "");
  }
  const extra = [];
  if (p.noindex) extra.push(`<meta name="robots" content="noindex, follow" />`);
  for (const j of p.jsonLd ?? []) extra.push(`<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`);
  swap("<!--jsonld-->", extra.join("\n    "));
  return html;
}

const template = await readFile(join(DIST, "index.html"), "utf8");
for (const p of pages) {
  /* <path>.html, not <path>/index.html: Cloudflare serves "shop/knee.html" at
     /shop/knee, matching the canonical address, whereas a folder index is
     served at /shop/knee/ behind a redirect. */
  const file = p.path === "/" ? join(DIST, "index.html") : join(DIST, `${p.path}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(template, p));
}

/* Unknown addresses: the app renders its own not-found page with noindex. */
await writeFile(join(DIST, "404.html"), render(template, { path: "/404", title: title("Page not found"), description: DEFAULT_DESC, noindex: true }));

const indexable = pages.filter((p) => !p.noindex);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...indexable.map((p) => `  <url><loc>${escape(`${ORIGIN}${p.path === "/" ? "/" : p.path}`)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}</url>`),
  "</urlset>",
  "",
].join("\n");
await writeFile(join(DIST, "sitemap.xml"), sitemap);
await writeFile(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /request-order\nDisallow: /compare\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

console.log(`prerendered ${pages.length} pages, sitemap ${indexable.length} addresses`);
