/*
  Creates the first owner of the order dashboard. Everyone after that is
  invited from the dashboard's Team screen.

  Needs the AWS CLI v2, signed in to the BAA account, after the order stack
  is deployed:

    npm run admin:create -- name@example.com            (an owner)
    npm run admin:create -- name@example.com staff      (staff)

  Cognito emails the person a temporary password; they choose their own at
  first sign-in at <site>/admin. Use a personal address, never a shared one.
*/
import { spawnSync } from "node:child_process";

const [email, role = "owner"] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["owner", "staff"].includes(role)) {
  console.error("Usage: npm run admin:create -- <email> [owner|staff]");
  process.exit(1);
}
const region = process.env.AWS_REGION || "us-east-1";

function aws(args) {
  const r = spawnSync("aws", [...args, "--region", region, "--output", "text"], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    console.error(r.error ? r.error.message : r.stderr.trim());
    process.exit(1);
  }
  return r.stdout.trim();
}

const pool = aws(["cloudformation", "describe-stacks", "--stack-name", "medville-brace-orders", "--query", "Stacks[0].Outputs[?OutputKey=='DashboardUserPoolId'].OutputValue"]);
if (!pool) {
  console.error("The medville-brace-orders stack has no DashboardUserPoolId output. Deploy the stack first.");
  process.exit(1);
}
const address = email.trim().toLowerCase();
const username = aws([
  "cognito-idp", "admin-create-user",
  "--user-pool-id", pool,
  "--username", address,
  "--user-attributes", `Name=email,Value=${address}`, "Name=email_verified,Value=true",
  "--desired-delivery-mediums", "EMAIL",
  "--query", "User.Username",
]);
aws(["cognito-idp", "admin-add-user-to-group", "--user-pool-id", pool, "--username", username, "--group-name", role]);
console.log(`Created ${address} as ${role}. Cognito has emailed a temporary password.`);
