/*
  Creates the first owner of the order dashboard. Everyone after that is
  invited from the dashboard's Team screen.

    npm run admin:owner -- name@example.com
    npm run admin:owner -- name@example.com --key path/to/key.json

  Uses the Firebase service account key, from --key or from the file named by
  GOOGLE_APPLICATION_CREDENTIALS. The Firebase project is the key's own. It
  makes the account in Firebase Authentication with the claim role owner, then
  asks Firebase to email the person a link to choose a password (this needs
  VITE_FIREBASE_API_KEY, from .env.production or the environment). Without it,
  the person can use "Forgot password" on <site>/admin instead.

  Use a personal address, never a shared one: the access log records who
  opened each order. Run it again for the same address to make that person an
  owner and send the link again. No order data is involved.
*/
import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { SHARED_MAILBOXES } from "../aws/src/admin.mjs";
import { createGoogleAuth } from "../aws/src/firestore.mjs";
import { createIdentity, identityCall } from "../aws/src/identity.mjs";

const USAGE = "Usage: npm run admin:owner -- name@example.com [--key path/to/key.json]";

function fail(message) {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

const args = process.argv.slice(2);
let keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
let email = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--key") keyPath = args[(i += 1)] || "";
  else if (!args[i].startsWith("--") && !email) email = args[i];
  else fail("Unknown option.");
}

email = email.trim().toLowerCase();
if (!/^[^\s@"]{1,64}@[^\s@"]+\.[^\s@"]+$/.test(email) || email.length > 160) fail("Enter a valid email address.");
if (SHARED_MAILBOXES.has(email.split("@")[0])) fail("That is a shared mailbox. Every person needs their own address, because the access log records who opened each order.");
if (!keyPath) fail("Give the service account key with --key, or set GOOGLE_APPLICATION_CREDENTIALS.");

let key;
try {
  key = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  /* No detail: a parse error can quote part of the file. */
  fail("Could not read that key file as JSON.");
}
if (key?.type !== "service_account" || !key.project_id || !key.client_email || !key.private_key) fail("That is not a service account key.");

const vite = loadEnv("production", process.cwd(), "VITE_");
const apiKey = vite.VITE_FIREBASE_API_KEY || "";
if (vite.VITE_FIREBASE_PROJECT_ID && vite.VITE_FIREBASE_PROJECT_ID !== key.project_id) {
  fail(`The key is for project ${key.project_id}, but VITE_FIREBASE_PROJECT_ID is ${vite.VITE_FIREBASE_PROJECT_ID}.`);
}

const identity = createIdentity({
  call: identityCall({ projectId: key.project_id, token: createGoogleAuth(key, { scope: "https://www.googleapis.com/auth/identitytoolkit" }) }),
});

try {
  const { created } = await identity.invite(email, "owner");
  console.log(`${created ? "Created" : "Found"} ${email} and set the role to owner.`);
} catch (error) {
  console.error(`Could not set up the account (${error instanceof Error ? error.message.slice(0, 80) : "unknown"}).`);
  console.error("Check that the Identity Toolkit API is on, that Email/Password sign-in is enabled, and that the key's account has the Firebase Authentication Admin role.");
  process.exit(1);
}

if (!apiKey) {
  console.log("VITE_FIREBASE_API_KEY is not set, so no email was sent. Ask them to open <site>/admin and choose Forgot password.");
} else {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) console.log(`Firebase has emailed ${email} a link to choose a password.`);
  else console.log(`The account is ready, but the email was not sent (status ${res.status}). Ask them to open <site>/admin and choose Forgot password.`);
}
