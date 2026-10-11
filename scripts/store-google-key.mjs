/*
  Stores the Firebase service account key in AWS Secrets Manager, where the
  dashboard and figures Lambdas read it. Run it signed in to the AWS account
  that has the BAA in effect, with the AWS CLI v2:

    npm run google:key -- path/to/key.json

  Create the key in the Google Cloud console for the Firebase project:
  IAM > Service accounts > Keys > Add key > JSON. The account needs the roles
  Firebase Authentication Admin (staff accounts) and Cloud Datastore User
  (daily figures). Delete the downloaded file once this has run.

  Creates the secret medville-brace/google-service-account, or adds a new
  version when it exists. Prints only the secret's ARN, which is the
  GOOGLE_KEY_SECRET_ARN for npm run deploy:orders. The key is handed to the
  AWS CLI as a file, so it never appears on a command line, and it is never
  printed. AWS_REGION defaults to us-east-1.
*/
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NAME = "medville-brace/google-service-account";
const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run google:key -- path/to/key.json");
  process.exit(1);
}
const path = resolve(file);
const region = process.env.AWS_REGION || "us-east-1";

let key;
try {
  key = JSON.parse(readFileSync(path, "utf8"));
} catch {
  /* No detail: a parse error can quote part of the file. */
  console.error("Could not read that file as JSON.");
  process.exit(1);
}
const missing = ["project_id", "client_email", "private_key"].filter((f) => typeof key?.[f] !== "string" || !key[f]);
if (key?.type !== "service_account" || missing.length) {
  console.error(`That is not a service account key (it needs type service_account${missing.length ? `, and is missing ${missing.join(", ")}` : ""}).`);
  process.exit(1);
}
if (!key.private_key.includes("PRIVATE KEY")) {
  console.error("The private_key in that file is not a private key.");
  process.exit(1);
}

/* Never show anything that looks like key material, even in an AWS error. */
const safe = (text) => String(text || "").replace(/-----BEGIN[\s\S]*?(-----END[^-]*-----|$)/g, "[key removed]").trim().slice(0, 400);

function aws(args) {
  const r = spawnSync("aws", [...args, "--region", region], { encoding: "utf8" });
  return { ok: !r.error && r.status === 0, out: (r.stdout || "").trim(), err: r.error ? r.error.message : safe(r.stderr) };
}

const found = aws(["secretsmanager", "describe-secret", "--secret-id", NAME, "--query", "ARN", "--output", "text"]);
let arn;
if (found.ok) {
  const put = aws(["secretsmanager", "put-secret-value", "--secret-id", NAME, "--secret-string", `file://${path}`, "--query", "ARN", "--output", "text"]);
  if (!put.ok) {
    console.error(put.err);
    process.exit(1);
  }
  arn = put.out;
  console.error("Updated the existing secret with a new version.");
} else if (/ResourceNotFoundException/.test(found.err)) {
  const created = aws([
    "secretsmanager", "create-secret",
    "--name", NAME,
    "--description", "Firebase service account for the Medville Brace dashboard and figures Lambdas",
    "--secret-string", `file://${path}`,
    "--query", "ARN", "--output", "text",
  ]);
  if (!created.ok) {
    console.error(created.err);
    process.exit(1);
  }
  arn = created.out;
  console.error("Created the secret.");
} else {
  console.error(found.err);
  process.exit(1);
}
console.log(arn);
console.error(`Use it as GOOGLE_KEY_SECRET_ARN=${arn} when you deploy. Then delete the key file from this computer.`);
