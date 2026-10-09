// Pulls the public product feed of the source store into a raw snapshot.
// The network here resets TLS often, so curl with retries does the transfer.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE = "https://bracedirect.com/products.json";
const out = resolve(process.argv[2] ?? ".cache/raw-products.json");
mkdirSync(dirname(out), { recursive: true });

const all = [];
for (let page = 1; page < 20; page++) {
  const url = `${SOURCE}?limit=250&page=${page}`;
  let body = "";
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      body = execFileSync(
        "curl",
        ["-sL", "--retry", "5", "--retry-all-errors", "--max-time", "90", url],
        { maxBuffer: 256 * 1024 * 1024 },
      ).toString("utf8");
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.products)) {
        all.push(...parsed.products);
        console.log(`page ${page}: ${parsed.products.length}`);
        if (parsed.products.length === 0) {
          writeFileSync(out, JSON.stringify(all));
          console.log(`total ${all.length} -> ${out}`);
          process.exit(0);
        }
        body = "ok";
        break;
      }
    } catch (e) {
      console.log(`page ${page} attempt ${attempt} failed: ${e.message.slice(0, 80)}`);
    }
  }
  if (body !== "ok") throw new Error(`page ${page} could not be fetched`);
}
writeFileSync(out, JSON.stringify(all));
console.log(`total ${all.length} -> ${out}`);
