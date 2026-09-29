import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Independent frozen evidence from eedc56c, not a second deploy/test config.
const baseline = JSON.parse(
  await readFile(new URL("../docs/research/cf-migration-baseline.json", import.meta.url), "utf8"),
);
for (const role of ["issuer", "discovery"]) {
  const directory = resolve(`workers/workload-identity-${role}`);
  const output = `${directory}/.cloudflare/output/v0`;
  const actual = JSON.parse(await readFile(`${output}/workers/default/worker.config.json`, "utf8"));
  const context = JSON.parse(await readFile(`${output}/config.json`, "utf8"));
  assert.deepEqual(context, { buildContext: { isPreview: false } });
  // Whole-object comparison rejects extra routes, domains, exports or bindings.
  const expected = structuredClone(baseline.workers[role]);
  const module = role === "issuer" ? "worker.js" : "index.js";
  // Intentional wrapper entrypoint; all deployment metadata stays identical.
  expected.manifest = {
    type: "complete",
    mainModule: module,
    modules: { [module]: { type: "esm" } },
  };
  assert.deepEqual(actual, expected);
  const bundle = await readFile(`${output}/workers/default/bundle/${module}`, "utf8");
  assert.match(bundle, /export\s*\{/);
  if (role === "issuer") {
    assert.match(bundle, /export\s*\{\s*WorkloadIdentityIssuer,\s*index_default as default\s*\}/);
  }
  console.log(`${role}: effective build metadata matches ${baseline.sourceRevision}`);
}
