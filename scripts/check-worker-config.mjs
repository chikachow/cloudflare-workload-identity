import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Check effective build output independently of the source configuration.
// Runtime binding values and entrypoints are exercised by the workerd suites.
for (const role of ["issuer", "discovery"]) {
  const output = `workers/workload-identity-${role}/.cloudflare/output/v0`;
  const worker = JSON.parse(await readFile(`${output}/workers/default/worker.config.json`, "utf8"));
  assert.equal(worker.workersDev, false);
  assert.equal(worker.previewUrls, false);
  assert.deepEqual(worker.triggers ?? [], []);
  assert.deepEqual(worker.domains ?? [], []);
  if (role === "issuer") {
    assert.deepEqual(worker.env.SIGNING_PRIVATE_KEY, { type: "secret" });
  } else {
    assert.equal(worker.env.PUBLIC_JWK_SET.type, "json");
  }
  console.log(`${role}: example exposure and binding contracts pass`);
}
