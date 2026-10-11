/*
  Bundles the order Lambda (aws/src/index.mjs plus aws/catalog.json) into
  aws/build/orders/index.mjs, the folder the CloudFormation template's Code
  property points at. The AWS SDK is left out: the Node.js 22 runtime has it.

    npm run build:orders
*/
import { build } from "esbuild";
import { mkdirSync, rmSync, statSync } from "node:fs";

const out = "aws/build/orders";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["aws/src/index.mjs"],
  outfile: `${out}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["@aws-sdk/*"],
  legalComments: "none",
  logLevel: "warning",
});
console.log(`order Lambda bundled: ${out}/index.mjs (${Math.round(statSync(`${out}/index.mjs`).size / 1024)} KB)`);
