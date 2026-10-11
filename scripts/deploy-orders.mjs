/*
  Deploys the order stack (aws/medville-brace-orders.yaml: order intake and the dashboard API) with the AWS CLI v2.

  Run it signed in to the AWS account that has the BAA in effect:

    AWS_DEPLOY_BUCKET=<s3 bucket for code uploads> npm run deploy:orders
    AWS_DEPLOY_BUCKET=... npm run deploy:orders -- --execute

  Without --execute it only creates a change set to review in the
  CloudFormation console. Parameters are passed only when set, so an update
  keeps the values already on the stack:

    ALLOWED_ORIGINS   https://www.example.com,https://example.com (required on the first deploy)
    ORDERS_ENABLED    true | false
    SENDER_DOMAIN     domain to verify in SES
    SENDER_EMAIL      notification From address
    NOTIFY_TO         comma-separated order inboxes
    BUSINESS_TIME_ZONE  dashboard day boundaries, default America/New_York
    AWS_REGION        defaults to us-east-1, the region in the site's CSP
*/
import { spawnSync } from "node:child_process";

const env = process.env;
const bucket = env.AWS_DEPLOY_BUCKET;
if (!bucket) {
  console.error("Set AWS_DEPLOY_BUCKET to an S3 bucket in the BAA account (it holds the Lambda code zip).");
  process.exit(1);
}
const region = env.AWS_REGION || "us-east-1";
const stack = "medville-brace-orders";
const execute = process.argv.includes("--execute");

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    console.error(r.error ? r.error.message : `${cmd} exited with ${r.status}`);
    process.exit(1);
  }
}

run("node", ["scripts/build-aws.mjs"]);
run("aws", [
  "cloudformation", "package",
  "--region", region,
  "--template-file", "aws/medville-brace-orders.yaml",
  "--s3-bucket", bucket,
  "--s3-prefix", stack,
  "--output-template-file", "aws/build/packaged.yaml",
]);

const overrides = Object.entries({
  AllowedOrigins: env.ALLOWED_ORIGINS,
  OrdersEnabled: env.ORDERS_ENABLED,
  SenderDomain: env.SENDER_DOMAIN,
  SenderEmail: env.SENDER_EMAIL,
  NotifyTo: env.NOTIFY_TO,
  BusinessTimeZone: env.BUSINESS_TIME_ZONE,
})
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `${k}=${v}`);

run("aws", [
  "cloudformation", "deploy",
  "--region", region,
  "--template-file", "aws/build/packaged.yaml",
  "--stack-name", stack,
  "--s3-bucket", bucket,
  "--s3-prefix", stack,
  "--capabilities", "CAPABILITY_IAM",
  "--no-fail-on-empty-changeset",
  ...(execute ? [] : ["--no-execute-changeset"]),
  ...(overrides.length ? ["--parameter-overrides", ...overrides] : []),
]);
if (!execute) console.log("Change set created. Review and execute it in the CloudFormation console, or rerun with --execute.");
else run("aws", ["cloudformation", "describe-stacks", "--region", region, "--stack-name", stack, "--query", "Stacks[0].Outputs", "--output", "table"]);
