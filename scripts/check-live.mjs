/*
  Checks a deployed copy of the site: pages, the 404 page, security headers,
  the Content-Security-Policy, cache rules and the rule that shoppers never
  download Firebase.

  Usage:
    node scripts/check-live.mjs https://medvillebrace.markravencanete50.workers.dev
    npm run check:live -- https://medvillebrace.markravencanete50.workers.dev

  It only sends GET requests and never submits a form. Exit code 0 means every
  check passed, 1 means at least one failed, 2 means the site could not be
  reached.
*/

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/check-live.mjs <https://your-site-address>");
  process.exit(2);
}

let failed = 0;
let passed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function get(path) {
  const res = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

function section(title) {
  console.log(`\n${title}`);
}

/* ---------- reach the site ---------- */

let home;
try {
  home = await get("/");
} catch (e) {
  console.error(`Could not reach ${base}: ${e.cause?.code || e.message}`);
  console.error("Check the address, that workers.dev is enabled, and that the build has finished.");
  process.exit(2);
}

/* ---------- pages ---------- */

section("Pages");
check("home answers 200", home.status === 200, `got ${home.status}`);
check("home is HTML", (home.headers.get("content-type") || "").includes("text/html"));
check("home has a title", /<title>[^<]{3,}<\/title>/i.test(home.body));

for (const path of ["/shop", "/brands", "/about", "/faq", "/contact", "/cart", "/request-order", "/robots.txt"]) {
  try {
    const r = await get(path);
    check(`${path} answers 200`, r.status === 200, `got ${r.status}`);
  } catch (e) {
    check(`${path} answers 200`, false, e.message);
  }
}

const missing = await get("/this-page-does-not-exist");
check("unknown address answers 404", missing.status === 404, `got ${missing.status}`);
check("404 shows the site's own page", /<html/i.test(missing.body) && !/cloudflare/i.test(missing.body.slice(0, 600)));

/* ---------- headers on public pages ---------- */

section("Headers on the home page");
const h = (name) => home.headers.get(name) || "";
check("X-Content-Type-Options is nosniff", h("x-content-type-options").toLowerCase() === "nosniff");
check("X-Frame-Options is DENY", h("x-frame-options").toUpperCase() === "DENY");
check("Strict-Transport-Security is set", /max-age=\d{6,}/.test(h("strict-transport-security")));
check("Referrer-Policy is set", h("referrer-policy") === "strict-origin-when-cross-origin");
check("Permissions-Policy turns off camera and microphone", /camera=\(\)/.test(h("permissions-policy")) && /microphone=\(\)/.test(h("permissions-policy")));

const csp = h("content-security-policy");
check("Content-Security-Policy is set", csp.length > 0);
check("CSP is one policy, not two joined together", csp.split("default-src").length === 2, "the admin policy may be stacking on the public one");
check("CSP allows Cloudinary images", csp.includes("https://res.cloudinary.com"));
check("CSP allows the AWS order API", csp.includes("execute-api.us-east-1.amazonaws.com"));
check("CSP on public pages does not allow Firebase", !/firestore|identitytoolkit|securetoken/.test(csp));
check("CSP blocks framing and objects", csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));

/* ---------- admin page ---------- */

section("Admin page");
const admin = await get("/admin");
check("/admin answers 200", admin.status === 200, `got ${admin.status}`);
const adminCsp = admin.headers.get("content-security-policy") || "";
check("admin CSP is one policy", adminCsp.length > 0 && adminCsp.split("default-src").length === 2);
check("admin CSP allows Firebase sign-in and Firestore", adminCsp.includes("identitytoolkit.googleapis.com") && adminCsp.includes("firestore.googleapis.com"));
check("admin is never cached", (admin.headers.get("cache-control") || "").includes("no-store"));
check("admin is hidden from search engines", /noindex/.test(admin.headers.get("x-robots-tag") || ""));

/* ---------- cache rules ---------- */

section("Cache rules");
const scriptSrc = home.body.match(/<script[^>]+src="(\/assets\/[^"]+)"/i)?.[1];
if (scriptSrc) {
  const asset = await get(scriptSrc);
  check(`${scriptSrc} answers 200`, asset.status === 200, `got ${asset.status}`);
  check("built assets are cached for a year", /max-age=31536000/.test(asset.headers.get("cache-control") || "") && /immutable/.test(asset.headers.get("cache-control") || ""));
} else {
  check("home page links a built script", false);
}
check("cart is never cached", (await get("/cart")).headers.get("cache-control")?.includes("no-store") === true);
check("order form is never cached", (await get("/request-order")).headers.get("cache-control")?.includes("no-store") === true);

/* ---------- privacy rules ---------- */

section("Privacy rules");
check("home page does not load Firebase", !/firebase/i.test(home.body));
check("home page has no analytics beacon", !/cloudflareinsights|va\.vercel-scripts|_vercel\/insights/i.test(home.body));
check("no card fields on the order form page", !/autocomplete="cc-/i.test((await get("/request-order")).body));

/* ---------- result ---------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Send this whole output back so the failing lines can be fixed.");
}
process.exit(failed ? 1 : 0);
