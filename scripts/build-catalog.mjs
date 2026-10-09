/*
  Turns the raw product feed into the two files the site reads.

    src/data/catalog.json        light index: everything a card, a filter or the search needs
    public/data/p/<slug>.json    detail: variants, features, indications, sizing text

  What is kept: the facts (names, sizes, SKUs, prices, manufacturer feature and
  indication lists, sizing guidance, billing codes). What is dropped: the source
  store's own marketing paragraphs and every mention of the source store. The
  one-paragraph summary on each product is generated here from those facts, so
  no sentence of the source's copy is shown as a description.

  Run: npm run catalog:fetch && npm run catalog:build
*/
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const RAW = resolve(process.argv[2] ?? ".cache/raw-products.json");
const raw = JSON.parse(readFileSync(RAW, "utf8"));

/* ---------- text helpers ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "", trade: "", copy: "" };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}
/* The house style forbids the long dash, so any source dash becomes a plain one. */
const plainDashes = (s) => s.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, "-");
const squash = (s) => s.replace(/\s+/g, " ").trim();
const stripTags = (s) => squash(decode(s.replace(/<[^>]+>/g, " ")));
const clean = (s) => squash(plainDashes(decode(s)).replace(/[®™©]/g, ""));

const SOURCE_NAME = /\b(?:brace\s*direct|bracedirect)(?:\.com)?\b/i;
function scrubSource(s) {
  return squash(
    s
      .replace(/\b(?:by|from)\s+brace\s*direct(?:'s)?\b/gi, "")
      .replace(/\bbrace\s*direct\b(?:\.com)?/gi, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\s+([,.:;])/g, "$1"),
  );
}

function sentenceCase(s) {
  const t = squash(s).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* ---------- taxonomy ---------- */

const REGION_BY_TYPE = {
  Knee: "knee",
  Foot: "foot-ankle",
  Ankle: "foot-ankle",
  Back: "back-hip",
  Hip: "back-hip",
  Neck: "neck",
  Shoulder: "shoulder",
  Elbow: "elbow",
  Wrist: "hand-wrist",
  Hand: "hand-wrist",
  Therapy: "therapy",
};
const REGION_TAGS = ["Knee", "Foot", "Ankle", "Back", "Hip", "Neck", "Shoulder", "Elbow", "Wrist", "Hand", "Therapy"];

const CATEGORY_NAMES = {
  "walker-boot": "Walker Boot",
  "post-op-shoe": "Post-Op Shoe",
  "night-splint": "Night Splint",
  afo: "Ankle-Foot Orthosis",
  "ankle-brace": "Ankle Brace",
  "hinged-knee-brace": "Hinged Knee Brace",
  "unloader-brace": "Unloader Brace",
  "knee-support": "Knee Support",
  "patellar-strap": "Patellar Strap",
  "back-brace": "Back Brace",
  "hip-brace": "Hip Brace",
  tlso: "TLSO",
  "si-belt": "Sacroiliac Belt",
  "abdominal-binder": "Abdominal Binder",
  "cervical-collar": "Cervical Collar",
  "traction-device": "Traction Device",
  "arm-sling": "Arm Sling",
  "shoulder-brace": "Shoulder Brace",
  "elbow-brace": "Elbow Brace",
  "counterforce-strap": "Counterforce Strap",
  "wrist-brace": "Wrist Brace",
  "thumb-spica": "Thumb Spica",
  splint: "Splint",
  immobilizer: "Immobilizer",
  "compression-sleeve": "Compression Sleeve",
  "cold-therapy": "Cold Therapy",
  "hot-cold-therapy": "Hot and Cold Therapy",
  "tens-ems": "TENS and EMS Unit",
  "mobility-aid": "Mobility Aid",
  insole: "Insole",
  wrap: "Wrap",
  "parts-accessories": "Parts and Accessories",
  "general-support": "General Support",
};

/* Source tags map onto our own category slugs. */
const SEARCHFILTER = {
  "Walker Boot": "walker-boot",
  Immobilizer: "immobilizer",
  Splint: "splint",
  Stabilizer: "ankle-brace",
  "Compression Sleeve": "compression-sleeve",
  LSO: "back-brace",
  "ROM Brace": "hinged-knee-brace",
  "Cold Therapy": "cold-therapy",
  "Cervical Collar": "cervical-collar",
  "Hinged Brace": "hinged-knee-brace",
  "Arm Sling": "arm-sling",
  AFO: "afo",
  "Unloader Brace": "unloader-brace",
  "Post-Op Shoe": "post-op-shoe",
  "Night Splint": "night-splint",
  "Thumb Spica": "thumb-spica",
  Accessory: "parts-accessories",
  TLSO: "tlso",
  Wrap: "wrap",
  "Counterforce Strap": "counterforce-strap",
  WHFO: "wrist-brace",
  "Air Cell Cushion": "parts-accessories",
  "TENS-EMS": "tens-ems",
  "Patellar Strap": "patellar-strap",
  "Traction Device": "traction-device",
  "Abdominal Binder": "abdominal-binder",
  Insole: "insole",
  "SI Belt": "si-belt",
};

/* First match wins. Used only when the source tag is missing. */
const CATEGORY_RULES = [
  [/pad only|incision pad/i, "parts-accessories"],
  [/heel cup/i, "insole"],
  [/maternity|hernia/i, "abdominal-binder"],
  [/\bcto\b/i, "cervical-collar"],
  [/replacement|accessor|\bkit\b|brace not included|power cord|tubing|\bliner\b|pad set|storage bag|extender|y-tab|hook and loop|\bsock\b|cast protector/i, "parts-accessories"],
  [/\bcane\b|crutch|scooter|walker(?! boot)|rollator|wheelchair|knee scooter/i, "mobility-aid"],
  [/hot or cold|hot and cold|iced?heat|thermal|heat therapy|heated|massager/i, "hot-cold-therapy"],
  [/cold|cryo|ice\b|frozen|polar|cold rush/i, "cold-therapy"],
  [/tens|\bems\b/i, "tens-ems"],
  [/^(?!.*(?:\bsi\b belt|sacroiliac)).*\bhip\b/i, "hip-brace"],
  [/traction/i, "traction-device"],
  [/cervical|collar|extrication/i, "cervical-collar"],
  [/walker boot|walking boot|air walker|cam boot|fracture boot|\bboot\b/i, "walker-boot"],
  [/post[- ]?op(?:erative)? shoe|surgical shoe/i, "post-op-shoe"],
  [/night splint/i, "night-splint"],
  [/\bafo\b|ankle foot orthosis|ankle-foot|drop foot|foot drop/i, "afo"],
  [/thumb|spica|\bcmc\b/i, "thumb-spica"],
  [/sling|shoulder immobilizer/i, "arm-sling"],
  [/\btlso\b/i, "tlso"],
  [/\bsi\b belt|sacroiliac/i, "si-belt"],
  [/abdominal|binder/i, "abdominal-binder"],
  [/lso\b|lumbar|back brace|back support|corset|spinal/i, "back-brace"],
  [/unloader|offload|osteoarthritis knee/i, "unloader-brace"],
  [/patella(?:r)? (?:strap|band)|jumper/i, "patellar-strap"],
  [/hinged|\brom\b|post[- ]?op knee|acl|ligament/i, "hinged-knee-brace"],
  [/counterforce|tennis elbow|golfer|elbow strap/i, "counterforce-strap"],
  [/elbow/i, "elbow-brace"],
  [/wrist|carpal|forearm|whfo|hand/i, "wrist-brace"],
  [/shoulder|rotator/i, "shoulder-brace"],
  [/stirrup|ankle|achilles/i, "ankle-brace"],
  [/insole|orthotic/i, "insole"],
  [/sleeve|compression/i, "compression-sleeve"],
  [/wrap/i, "wrap"],
  [/splint/i, "splint"],
  [/immobiliz/i, "immobilizer"],
  [/knee|meniscus/i, "knee-support"],
];

/* ---------- parsing a description ---------- */

function sections(html) {
  const out = [];
  const re = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m;
  const marks = [];
  while ((m = re.exec(html))) marks.push({ title: stripTags(m[1]), start: m.index + m[0].length, at: m.index });
  marks.forEach((mark, i) => {
    out.push({ title: mark.title, html: html.slice(mark.start, i + 1 < marks.length ? marks[i + 1].at : html.length) });
  });
  return out;
}

function listItems(html) {
  const items = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[1];
    const strong = inner.match(/^\s*<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>\s*([\s\S]*)$/i);
    if (strong) {
      const label = clean(stripTags(strong[1]).replace(/[:\s]+$/, ""));
      const text = clean(stripTags(strong[2]));
      if (label && text) {
        items.push({ label: label === label.toUpperCase() ? sentenceCase(label) : label, text });
        continue;
      }
      if (label) {
        items.push({ text: label });
        continue;
      }
    }
    const text = clean(stripTags(inner));
    if (text) items.push({ text });
  }
  return items;
}

function parseBody(html) {
  const secs = sections(html);
  const features = [];
  const indications = [];
  let measurement = "";
  for (const s of secs) {
    const t = s.title.toLowerCase();
    if (/indication|common examples/.test(t)) {
      for (const it of listItems(s.html)) indications.push(it.label ? `${it.label}: ${it.text}` : it.text);
    } else if (/measure|sizing|size guide/.test(t)) {
      const li = listItems(s.html);
      measurement = li.length
        ? li.map((x) => (x.label ? `${x.label}: ${x.text}` : x.text)).join(" ")
        : clean(stripTags(s.html));
    } else if (/feature|benefit/.test(t)) {
      features.push(...listItems(s.html));
    }
  }
  const keepLine = (x) => !SOURCE_NAME.test(`${x.label ?? ""} ${x.text}`);
  return {
    features: features.filter(keepLine).slice(0, 10),
    indications: indications.filter((x) => !SOURCE_NAME.test(x)).slice(0, 12),
    measurement: SOURCE_NAME.test(measurement) ? scrubSource(measurement) : measurement,
  };
}

/* ---------- title handling ---------- */

const BRAND_DISPLAY = {
  Ossur: "Ossur",
  Breg: "Breg",
  "Brace Direct": "Brace Direct",
  "Brace Align": "Brace Align",
  Aspen: "Aspen",
  OCSI: "OCSI",
  Bauerfeind: "Bauerfeind",
  Ottobock: "Ottobock",
  Guardian: "Guardian",
  Bort: "Bort",
  Therahab: "TheraHab",
  Cybertech: "CyberTech",
  Thermax: "Thermax",
  Comfortland: "Comfortland",
};

/* Source titles are often in title case, which turns "ACL" into "Acl". */
const ACRONYMS = /\b(acl|mcl|pcl|lcl|oa|lso|tlso|afo|kafo|rom|tens|ems|cmc|si|xs|xl|xxl|2xl|3xl|pdac|hko|cto|whfo|dh|tx|vrtx|cti)\b/gi;
const fixAcronyms = (s) => s.replace(ACRONYMS, (m) => m.toUpperCase());

function cleanTitle(rawTitle, vendor) {
  let t = fixAcronyms(clean(rawTitle));
  t = scrubSource(t);
  /* Drop the brand prefix: the card already shows the brand above the title. */
  const names = [vendor, BRAND_DISPLAY[vendor]].filter(Boolean);
  for (const n of names) {
    const re = new RegExp(`^(?:renewed\\s+)?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
    if (re.test(t) && t.replace(re, "").length > 8) {
      const renewed = /^renewed/i.test(t);
      t = (renewed ? "Renewed " : "") + t.replace(re, "");
      break;
    }
  }
  let subtitle = "";
  const split = t.match(/^(.{6,}?)(?:\s*:\s+|\s+\|\s+|\s+-\s+)(.+)$/);
  if (split) {
    t = split[1];
    subtitle = split[2].split(/\s+\|\s+/)[0];
  }
  t = t.replace(/\b(?:and|for|with|by|in|to|of|the)\s*$/i, "").replace(/[,;:\s-]+$/, "");
  t = t.replace(/\(\s*brace\s+not\s+included\s*\)/i, "(brace not included)");
  subtitle = subtitle.replace(/\(\s*brace\s+not\s+included\s*\)/i, "").replace(/[,;:\s-]+$/, "");
  if (subtitle.length > 130) subtitle = subtitle.slice(0, subtitle.lastIndexOf(" ", 127)).replace(/[,;:\s-]+$/, "") + "...";
  return { title: t, subtitle };
}

/* ---------- private label ----------

  The source store sells its own lines (sold as "Brace Direct" and "Brace
  Align", and a few listed under another vendor but titled with the store's
  name). Their photographs carry the store's logo, and they are not ours to
  sell under another name, so they are left out. Set INCLUDE_PRIVATE_LABEL=1
  only with a supply agreement in place; they then appear under their real
  brand names, logos and all.
*/
const INCLUDE_PRIVATE_LABEL = process.env.INCLUDE_PRIVATE_LABEL === "1";
const PRIVATE_LABEL_VENDORS = new Set(["Brace Direct", "Brace Align"]);
const isPrivateLabel = (p) =>
  PRIVATE_LABEL_VENDORS.has(p.vendor) || /^(?:renewed\s+)?brace\s*direct\b/i.test(p.title.trim()) || /^(?:renewed\s+)?brace\s*align\b/i.test(p.title.trim());
let excluded = 0;

/* ---------- build ---------- */

const used = new Set();
const products = [];
const details = [];
const conditionCount = new Map();

for (const p of raw) {
  if (/sizing specialist tip/i.test(p.title)) continue;
  if (!INCLUDE_PRIVATE_LABEL && isPrivateLabel(p)) {
    excluded++;
    continue;
  }

  const tags = Array.isArray(p.tags) ? p.tags : String(p.tags).split(", ");
  const brandKey = p.vendor;
  const brand = BRAND_DISPLAY[brandKey] ?? brandKey;
  const { title, subtitle } = cleanTitle(p.title, brandKey);
  if (!title) continue;

  /* region */
  let regionSlug = REGION_BY_TYPE[p.product_type];
  if (!regionSlug) {
    const tagRegion = REGION_TAGS.find((r) => tags.includes(r));
    regionSlug = tagRegion ? REGION_BY_TYPE[tagRegion] : undefined;
  }
  if (!regionSlug) {
    const hay = `${p.title} ${p.product_type}`.toLowerCase();
    regionSlug = /cryo|thermal|ice|cold|heat|therapy/.test(hay) ? "therapy" : "knee";
  }

  /* category */
  const sf = tags.find((t) => t.startsWith("searchfilter_"));
  let category = sf ? SEARCHFILTER[sf.slice("searchfilter_".length)] : undefined;
  if (!category) {
    const hay = `${title} ${subtitle}`;
    category = CATEGORY_RULES.find(([re]) => re.test(hay))?.[1];
  }
  if (!category) category = "general-support";

  if (category === "arm-sling") regionSlug = "shoulder";
  if (category === "hip-brace") regionSlug = "back-hip";

  /* description facts */
  const body = parseBody(p.body_html ?? "");

  /* conditions and billing codes */
  const conditions = tags
    .filter((t) => t.startsWith("CONDITION_"))
    .map((t) => clean(t.slice("CONDITION_".length)));
  for (const c of conditions) conditionCount.set(c, (conditionCount.get(c) ?? 0) + 1);
  const hcpcs = tags.filter((t) => t.startsWith("HCPCS_")).map((t) => t.slice("HCPCS_".length));

  /* variants */
  const optionNames = p.options.map((o) => (o.name === "Title" ? "Option" : o.name));
  const onlyDefault = p.variants.length === 1 && /default title/i.test(p.variants[0].title ?? "");
  const variants = p.variants.map((v) => ({
    o: [v.option1, v.option2, v.option3].filter((x) => x != null).map((x) => clean(String(x))),
    p: Number(v.price),
    s: v.sku ?? "",
    a: Boolean(v.available),
  }));
  const prices = variants.map((v) => v.p).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) continue;

  /* The address is assigned after the loop, once duplicate listings are resolved. */
  const slug = "";

  const images = (p.images ?? []).slice(0, 3).map((im) => ({ src: im.src.split("?")[0], w: im.width, h: im.height }));

  const summary = makeSummary({ title, brand, regionSlug, category, conditions, variants, optionNames, onlyDefault });

  products.push({
    slug,
    title,
    subtitle,
    brand,
    brandSlug: slugify(brand),
    region: regionSlug,
    category,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    available: variants.some((v) => v.a),
    variantCount: onlyDefault ? 1 : variants.length,
    conditions: conditions.slice(0, 5),
    hcpcs: hcpcs.slice(0, 4),
    summary,
    images: images.length,
    renewed: /^renewed/i.test(title),
    addedAt: p.created_at?.slice(0, 10) ?? "",
  });

  details.push({
    slug,
    /* The source's product id is the stable key for photos and the image
       blocklist: a title (and so a slug) may change, the id does not. */
    id: String(p.id),
    optionNames: onlyDefault ? [] : optionNames,
    variants: onlyDefault ? [{ o: [], p: variants[0].p, s: variants[0].s, a: variants[0].a }] : variants,
    features: body.features,
    indications: body.indications,
    measurement: body.measurement,
    conditions,
    hcpcs,
    sources: images,
  });
}

/* ---------- summary generator ---------- */

function makeSummary({ title, brand, regionSlug, category, conditions, variants, optionNames, onlyDefault }) {
  const REGION_PHRASE = {
    knee: "the knee",
    "foot-ankle": "the foot and ankle",
    "back-hip": "the back and hip",
    neck: "the neck",
    shoulder: "the shoulder",
    elbow: "the elbow",
    "hand-wrist": "the hand and wrist",
    therapy: "recovery at home",
  };
  const catName = CATEGORY_NAMES[category];
  const cat = catName.split(" ").map((w) => (w === w.toUpperCase() || /^[A-Z][a-z]+-[A-Z]/.test(w) ? w : w.toLowerCase())).join(" ");
  const region = REGION_PHRASE[regionSlug];
  const conds = conditions
    .filter((c) => !/^post-surgical/i.test(c))
    .slice(0, 3)
    /* lower case for a sentence, but keep acronyms such as ACL and MCL */
    .map((c) => c.split(" ").map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(" "));
  const condText = conds.length ? `${conds.slice(0, -1).join(", ")}${conds.length > 1 ? " and " : ""}${conds[conds.length - 1]}` : "";
  const sizeOpt = optionNames.find((n) => /size/i.test(n));
  const sizeCount = sizeOpt ? new Set(variants.map((v) => v.o[optionNames.indexOf(sizeOpt)])).size : 0;
  const sizeText = sizeCount > 1 ? ` Offered in ${sizeCount} sizes, so measure before you order.` : "";
  const isParts = category === "parts-accessories";
  const forms = [
    () => `${brand} ${cat} for ${region}${condText ? `, often chosen for ${condText}` : ""}.${sizeText}`,
    () => `${brand} ${cat} made for ${region}${condText ? `. Typical uses include ${condText}` : ""}.${sizeText}`,
    () => `Support for ${region} from ${brand}${condText ? `, commonly considered for ${condText}` : ""}.${sizeText}`,
  ];
  const partsForms = [
    () => `${brand} part or accessory for ${region}. Check that it matches your device before you order.`,
    () => `${brand} accessory for ${region}. Confirm compatibility with your current brace or unit first.`,
  ];
  const list = isParts ? partsForms : forms;
  const sold = /brace not included/i.test(title) ? " Sold without the brace." : "";
  return (list[hash(title) % list.length]() + sold).replace(/\s+/g, " ").trim();
}

/* ---------- write ---------- */

/* ---------- duplicate listings ----------

  The source lists some products more than once, one listing per colour or
  side, and a few twice outright. Listings that share a brand, title and
  subtitle get the option values that tell them apart added to the subtitle
  (for example "Titanium" or "Right"). Listings with nothing to tell them
  apart are true duplicates: only the one with the most photos is kept.
*/
let dropped = 0;
{
  const groups = new Map();
  products.forEach((p, i) => {
    const key = `${p.brand}|${p.title}|${p.subtitle}`.toLowerCase();
    (groups.get(key) ?? groups.set(key, []).get(key)).push(i);
  });
  const drop = new Set();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const valueSet = (i, k) => [...new Set(details[i].variants.map((v) => v.o[k]).filter(Boolean))];
    /* Prefer the option a shopper recognises: colour, then side, then size. */
    const names = details[members[0]].optionNames;
    const rank = (k) => (/colou?r/i.test(names[k] ?? "") ? 0 : /size/i.test(names[k] ?? "") ? 2 : 1);
    const order = [0, 1, 2].filter((k) => k < names.length).sort((a, b) => rank(a) - rank(b));
    let labelled = false;
    for (const k of order) {
      if (labelled) break;
      const sets = members.map((i) => valueSet(i, k).join("|"));
      if (sets.every((s) => s) && new Set(sets).size === members.length) {
        for (const i of members) {
          const vals = valueSet(i, k);
          const isSize = /size/i.test(names[k]);
          const list =
            vals.length <= 2 ? vals.join(" or ") : isSize ? `${vals[0]} to ${vals[vals.length - 1]}` : `${vals.slice(0, -1).join(", ")} or ${vals[vals.length - 1]}`;
          const label = isSize ? `Size ${list}` : list;
          products[i].subtitle = products[i].subtitle ? `${products[i].subtitle} (${label})` : label;
          products[i].variantLabel = label;
        }
        labelled = true;
      }
    }
    if (!labelled) {
      const keep = members.reduce((best, i) => (products[i].images > products[best].images ? i : best), members[0]);
      for (const i of members) if (i !== keep) drop.add(i);
    }
  }
  dropped = drop.size;
  for (const i of [...drop].sort((a, b) => b - a)) {
    products.splice(i, 1);
    details.splice(i, 1);
  }
}

/* ---------- addresses ----------
  From the cleaned brand and title, not the source handle: the source reuses
  handles (one product's handle names a different product), so a
  handle-based address can say one thing and show another.
*/
products.forEach((p, i) => {
  let slug = slugify(`${p.brand} ${p.title}${p.variantLabel ? ` ${p.variantLabel}` : ""}`).replace(/-brace-not-included$/, "");
  if (slug.length > 80) slug = slug.slice(0, slug.lastIndexOf("-", 80));
  let unique = slug;
  for (let n = 2; used.has(unique); n++) unique = `${slug}-${n}`;
  used.add(unique);
  p.slug = unique;
  details[i].slug = unique;
  delete p.variantLabel;
});

products.sort((a, b) => a.title.localeCompare(b.title));

mkdirSync("src/data", { recursive: true });
rmSync("public/data/p", { recursive: true, force: true });
mkdirSync("public/data/p", { recursive: true });

const conditions = [...conditionCount.entries()]
  .filter(([, n]) => n >= 3)
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, slug: slugify(name), count }));

writeFileSync("src/data/catalog.json", JSON.stringify({ products, conditions, categories: CATEGORY_NAMES }));
/* Source ids and image addresses stay out of the shipped site; only the image scripts read them. */
for (const { sources, id, ...rest } of details) writeFileSync(`public/data/p/${rest.slug}.json`, JSON.stringify(rest));
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/image-sources.json", JSON.stringify(details.map((d) => ({ id: d.id, slug: d.slug, sources: d.sources }))));

const byCat = new Map();
for (const p of products) byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
console.log(`products ${products.length}, conditions ${conditions.length}, private label left out ${excluded}, duplicate listings merged ${dropped}`);
console.log([...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
console.log("no source text leaked:", !products.some((p) => SOURCE_NAME.test(JSON.stringify(p))));
