/*
  Tests for the deploy script's terminal output: the deploy hook URL works like
  a password and must never be echoed. Invented values only.

    npm run test:orders
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactArgs } from "../scripts/redact-args.mjs";

const HOOK = "https://api.example.test/v1/integrations/deploy/prj_abc123/SECRETTOKEN-0123456789";

test("redactArgs hides the deploy hook URL and leaves everything else alone", () => {
  const args = ["cloudformation", "deploy", "--parameter-overrides", "AllowedOrigins=https://shop.test", `DeployHookUrl=${HOOK}`, "OrdersEnabled=false"];
  const shown = redactArgs(args);
  assert.deepEqual(shown, ["cloudformation", "deploy", "--parameter-overrides", "AllowedOrigins=https://shop.test", "DeployHookUrl=...", "OrdersEnabled=false"]);
  assert.doesNotMatch(shown.join(" "), /SECRETTOKEN|prj_abc123|integrations/);
  assert.equal(args[4], `DeployHookUrl=${HOOK}`, "the real arguments passed to the AWS CLI are not changed");
});

test("redactArgs handles awkward values: capital S, spaces, empty, repeated", () => {
  for (const value of ["SSSS", "Some Token With Spaces", "", "https://x.test/S/S/S"]) {
    assert.deepEqual(redactArgs([`DeployHookUrl=${value}`]), ["DeployHookUrl=..."], JSON.stringify(value));
  }
  assert.deepEqual(redactArgs(["DeployHookUrl=a", "DeployHookUrl=b"]), ["DeployHookUrl=...", "DeployHookUrl=..."]);
  assert.deepEqual(redactArgs([]), []);
});

test("deploy script echoes commands only through redactArgs", () => {
  const src = readFileSync(new URL("../scripts/deploy-orders.mjs", import.meta.url), "utf8");
  assert.match(src, /redactArgs\(args\)/);
  assert.doesNotMatch(src, /args\.join/, "no raw join of the arguments");
  assert.doesNotMatch(src, /DeployHookUrl=S\+/, "the broken pattern is gone");
});

test("every NoEcho parameter in the stack is on the redaction list", () => {
  const template = readFileSync(new URL("./medville-brace-orders.yaml", import.meta.url), "utf8");
  const noEcho = [...template.matchAll(/^  (\w+):\n(?:    .*\n)*?    NoEcho: true/gm)].map((m) => m[1]);
  assert.ok(noEcho.length >= 1, "the template has at least one NoEcho parameter");
  for (const name of noEcho) assert.equal(redactArgs([`${name}=secret-value`])[0], `${name}=...`, name);
});
