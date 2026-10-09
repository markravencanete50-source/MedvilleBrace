/*
  After a build, removes from dist/ every photograph that Cloudinary serves,
  so the static host only carries pages, scripts and the few images that must
  stay on the site's own domain (logo, favicon, link-preview card). The files
  stay in public/ and in the repository: they are the source for uploads.
*/
import { readFileSync, rmSync, existsSync, readdirSync } from "node:fs";

const map = JSON.parse(readFileSync("src/data/cloudinary.json", "utf8"));
if (!map.cloud) {
  console.log("Cloudinary not configured: photographs are served from this site.");
  process.exit(0);
}

let removed = 0;
for (const key of Object.keys(map.assets)) {
  const [kind, ...rest] = key.split("/");
  if (kind === "products") {
    const [slug, n] = rest;
    for (const f of [`dist/products/${slug}/${n}.webp`, `dist/products/${slug}/${n}-sm.webp`]) {
      if (existsSync(f)) {
        rmSync(f);
        removed++;
      }
    }
  } else if (kind === "photography") {
    const f = `dist/photography/${rest.join("/")}.webp`;
    if (existsSync(f)) {
      rmSync(f);
      removed++;
    }
  }
}
/* Drop product folders left empty. */
if (existsSync("dist/products")) {
  for (const d of readdirSync("dist/products")) if (!readdirSync(`dist/products/${d}`).length) rmSync(`dist/products/${d}`, { recursive: true });
}
console.log(`Image delivery: Cloudinary (${map.cloud}); ${removed} local copies left out of the deploy.`);
