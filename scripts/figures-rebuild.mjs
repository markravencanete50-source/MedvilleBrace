/*
  Recounts the dashboard's daily figures (Firestore figures/<day>) from the
  orders table. Use it for the first fill after the stack is deployed, or to
  repair figures after Firestore was unreachable. Needs the AWS CLI v2,
  signed in to the BAA account:

    npm run figures:rebuild                          the last 400 days
    npm run figures:rebuild -- 2026-01-01            from that day to today
    npm run figures:rebuild -- 2026-01-01 2026-03-31

  Days are business-zone days (BUSINESS_TIME_ZONE, default America/New_York).
  A range can be up to 800 days. Days with no orders have no figures. The
  function reads the orders inside AWS and sends Firestore counts and sums
  only. AWS_REGION defaults to us-east-1.
*/
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays, daysBetween, today, validDay, validTimeZone } from "../aws/src/days.mjs";

const timeZone = validTimeZone(process.env.BUSINESS_TIME_ZONE) ? process.env.BUSINESS_TIME_ZONE : "America/New_York";
const region = process.env.AWS_REGION || "us-east-1";
const [fromArg, toArg] = process.argv.slice(2);
const to = toArg || today(timeZone);
const from = fromArg || addDays(to, -399);

if (!validDay(from) || !validDay(to) || from > to || daysBetween(from, to) >= 800) {
  console.error("Usage: npm run figures:rebuild -- [from] [to]   (days as YYYY-MM-DD, at most 800 days apart)");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "mb-figures-"));
try {
  const payload = join(dir, "payload.json");
  const output = join(dir, "output.json");
  writeFileSync(payload, JSON.stringify({ rebuild: { from, to } }));
  console.log(`Rebuilding figures for ${from} to ${to} (${timeZone})...`);
  const r = spawnSync(
    "aws",
    ["lambda", "invoke", "--region", region, "--function-name", "medville-brace-figures", "--cli-binary-format", "raw-in-base64-out", "--payload", `file://${payload}`, "--output", "json", output],
    { encoding: "utf8" },
  );
  if (r.error || r.status !== 0) {
    console.error(r.error ? r.error.message : r.stderr.trim().slice(0, 400));
    process.exit(1);
  }
  const result = JSON.parse(readFileSync(output, "utf8") || "{}");
  if (JSON.parse(r.stdout || "{}").FunctionError || result.errorMessage) {
    console.error(`The figures function failed (${String(result.errorMessage || "unknown").slice(0, 120)}). See the log group /aws/lambda/medville-brace-figures.`);
    process.exit(1);
  }
  console.log(`Wrote ${result.days ?? 0} day${result.days === 1 ? "" : "s"} of figures.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
