/*
  Uploads the site's photographs to Cloudinary and records them in
  src/data/cloudinary.json, which the site reads to build image URLs.

    public/products/<slug>/<n>.webp   -> <folder>/products/<slug>/<n>
    public/photography/<name>.webp    -> <folder>/photography/<name>

  Only the 900px product files are uploaded; Cloudinary makes the card size
  and the best format on request. A file whose content has not changed since
  its last upload is skipped, so the step is cheap to rerun after a catalog
  update. Progress is saved as it goes: an interrupted run resumes.

  Credentials come from the environment and are never written to the repo:
    CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

  Run: npm run images:upload            (add -- --dry-run to only count)
*/
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const MAP_FILE = "src/data/cloudinary.json";
const DRY = process.argv.includes("--dry-run");
const CONCURRENCY = 4;

const env = process.env.CLOUDINARY_URL ?? "";
const m = env.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
if (!m && !DRY) {
  console.error("Set CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> first.");
  process.exit(1);
}
const [, apiKey, apiSecret, cloud] = m ?? [];

const map = JSON.parse(readFileSync(MAP_FILE, "utf8"));
/* A different Cloudinary account means none of the recorded uploads exist there. */
if (cloud && map.cloud && map.cloud !== cloud) map.assets = {};
if (cloud) map.cloud = cloud;

const catalog = JSON.parse(readFileSync("src/data/catalog.json", "utf8"));
const files = [];
for (const p of catalog.products) {
  for (let n = 1; n <= p.images; n++) files.push({ key: `products/${p.slug}/${n}`, path: `public/products/${p.slug}/${n}.webp` });
}
for (const f of readdirSync("public/photography").filter((f) => f.endsWith(".webp"))) {
  files.push({ key: `photography/${f.replace(/\.webp$/, "")}`, path: `public/photography/${f}` });
}

/* Forget uploads for photos that no longer exist, so the map never points at a removed product. */
const wanted = new Set(files.map((f) => f.key));
for (const key of Object.keys(map.assets)) if (!wanted.has(key)) delete map.assets[key];

const hashOf = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);
const todo = files.filter((f) => {
  if (!existsSync(f.path)) return false;
  return map.assets[f.key]?.h !== hashOf(readFileSync(f.path));
});

console.log(`${files.length} photos, ${todo.length} to upload${DRY ? " (dry run)" : ""}`);
if (DRY || !todo.length) {
  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(map, null, 1) + "\n");
  process.exit(0);
}

function sign(params) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(base + apiSecret).digest("hex");
}

async function upload(f) {
  const buf = readFileSync(f.path);
  const params = { invalidate: "true", overwrite: "true", public_id: `${map.folder}/${f.key}`, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append("api_key", apiKey);
  form.append("signature", sign(params));
  form.append("file", new Blob([buf], { type: "image/webp" }), f.path.split("/").pop());
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return { v: body.version, h: hashOf(buf) };
}

let done = 0;
let failed = 0;
let i = 0;
const save = () => writeFileSync(MAP_FILE, JSON.stringify(map, null, 1) + "\n");

async function worker() {
  while (i < todo.length) {
    const f = todo[i++];
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        map.assets[f.key] = await upload(f);
        ok = true;
      } catch (e) {
        if (attempt === 3) console.log(`failed ${f.key}: ${e.message}`);
        else await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if (ok) done++;
    else failed++;
    if ((done + failed) % 25 === 0) {
      save();
      console.log(`${done + failed}/${todo.length}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
console.log(`uploaded ${done}, failed ${failed}. Commit ${MAP_FILE} so the site uses the new URLs.`);
if (failed) process.exit(1);
