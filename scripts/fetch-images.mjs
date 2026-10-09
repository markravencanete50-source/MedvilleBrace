/*
  Downloads the manufacturer photographs for every product, up to three each.

  Reads .cache/image-sources.json (written by build-catalog.mjs) and saves the
  originals under .cache/images/<source id>/<n>.<ext>. A file already on disk is
  skipped, so a run that dies halfway resumes where it stopped. curl does the
  transfer because this network resets TLS connections often.

  Run: npm run images:fetch
*/
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

const CONCURRENCY = 6;
const list = JSON.parse(readFileSync(".cache/image-sources.json", "utf8"));

const jobs = [];
/* Keyed by the source product id, which survives title and slug changes. */
for (const { id, sources } of list) {
  sources.forEach((s, i) => {
    const ext = (extname(new URL(s.src).pathname) || ".jpg").toLowerCase();
    jobs.push({ url: s.src, dir: `.cache/images/${id}`, file: `.cache/images/${id}/${i + 1}${ext}` });
  });
}

const done = (f) => existsSync(f) && statSync(f).size > 1024;

function curl(url, file) {
  return new Promise((resolve) => {
    const child = spawn("curl", ["-sSL", "--fail", "--retry", "5", "--retry-all-errors", "--max-time", "120", "-o", file, url]);
    child.on("close", (code) => resolve(code === 0));
  });
}

let ok = 0;
let failed = [];
let index = 0;
async function worker() {
  while (index < jobs.length) {
    const job = jobs[index++];
    if (done(job.file)) {
      ok++;
      continue;
    }
    mkdirSync(job.dir, { recursive: true });
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) success = (await curl(job.url, job.file)) && done(job.file);
    if (success) ok++;
    else failed.push(job.url);
    if ((ok + failed.length) % 100 === 0) console.log(`${ok + failed.length}/${jobs.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
writeFileSync(".cache/image-failures.json", JSON.stringify(failed, null, 2));
console.log(`downloaded ${ok}/${jobs.length}, failed ${failed.length}`);
