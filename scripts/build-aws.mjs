/*
  Bundles the two Lambda functions into the folders the CloudFormation
  template's Code properties point at:

    aws/build/orders/index.mjs   order intake (aws/src/index.mjs plus aws/catalog.json)
    aws/build/admin/index.mjs    dashboard API (aws/src/admin-index.mjs)

  The AWS SDK is left out: the Node.js 22 runtime has it.

    npm run build:orders
*/
import { build } from "esbuild";
import { mkdirSync, rmSync, statSync } from "node:fs";

for (const [name, entry] of [["orders", "aws/src/index.mjs"], ["admin", "aws/src/admin-index.mjs"]]) {
  const out = `aws/build/${name}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: `${out}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    external: ["@aws-sdk/*"],
    legalComments: "none",
    logLevel: "warning",
  });
  console.log(`${name} Lambda bundled: ${out}/index.mjs (${Math.round(statSync(`${out}/index.mjs`).size / 1024)} KB)`);
}
