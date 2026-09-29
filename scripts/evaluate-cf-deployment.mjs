import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { signingPrivateKeyPem } from "../test/support/signing-key.ts";

// Generated, ignored fixture projects. No deployment-repository files or credentials.
const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, ".cloudflare/cf-pilot");
const cli = resolve(root, "node_modules/cf/bin/cf");
const accountId = "00000000000000000000000000000000";
const storeId = "11111111111111111111111111111111";
const roles = ["issuer", "discovery", "smoke"];
const ports = {};
for (const role of roles) {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  ports[role] = server.address().port;
  await new Promise((done) => server.close(done));
}
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_REGISTRY_PATH: resolve(directory, "registry"),
  WRANGLER_LOG_PATH: resolve(directory, "logs"),
};
for (const key of [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_ACCOUNT_ID",
])
  delete environment[key];
const packageJson = JSON.parse(
  await readFile(resolve(root, "workers/workload-identity-issuer/package.json"), "utf8"),
);
for (const role of roles) {
  const cwd = resolve(directory, role);
  await mkdir(cwd, { recursive: true });
  try {
    await symlink(
      resolve(root, "workers/workload-identity-issuer/node_modules"),
      resolve(cwd, "node_modules"),
      "dir",
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await writeFile(
    resolve(cwd, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      devDependencies: {
        cf: packageJson.devDependencies.cf,
        wrangler: packageJson.devDependencies.wrangler,
      },
    }),
  );
  await writeFile(
    resolve(cwd, "wrangler.config.ts"),
    `export default { dev: { ip: "127.0.0.1", port: ${ports[role]}, inspectorPort: 0 }, sendMetrics: false };\n`,
  );
  const source = (name) =>
    JSON.stringify(
      pathToFileURL(resolve(root, `workers/workload-identity-${name}/cloudflare.config.ts`)).href,
    );
  const entrypoint = JSON.stringify(
    resolve(
      root,
      `workers/workload-identity-${role}/src/${role === "issuer" ? "worker" : "index"}.ts`,
    ),
  );
  const config =
    role === "smoke"
      ? `
import { bindings, defineConfig } from "cf/config";
export default defineConfig({ accountId: "${accountId}", worker: {
  name: "cf-pilot-smoke", entrypoint: "smoke.ts", compatibilityDate: "2026-08-04",
  compatibilityFlags: ["no_nodejs_compat", "no_nodejs_compat_v2"], workersDev: false, previewUrls: false,
  env: { ISSUER: bindings.worker({ worker: "cf-pilot-issuer", exportName: "WorkloadIdentityIssuer",
    props: { subject: "urn:example:pilot", allowedAudiences: ["https://audience.example"] } }) }
}});
`
      : `
import { bindings, defineConfig } from "cf/config";
import source from ${source(role)};
export default defineConfig(({ mode }) => ({ accountId: "${accountId}", worker: {
  ...source.worker, name: "cf-pilot-${role}", entrypoint: ${entrypoint},
  observability: { enabled: true, logs: { headSamplingRate: 1 }, traces: { enabled: true, headSamplingRate: 1 } },
  ${role === "discovery" ? 'domains: ["identity.example"],' : ""}
  env: { ...source.worker.env, ISSUER: bindings.text("https://identity.example"),
    ${role === "issuer" ? `SIGNING_PRIVATE_KEY: mode === "local" ? bindings.secret() : bindings.secretsStoreSecret({ storeId: "${storeId}", secretName: "PILOT_SIGNING_KEY" }),` : ""}
  }
}}));
`;
  await writeFile(resolve(cwd, "cloudflare.config.ts"), config);
}
await writeFile(
  resolve(directory, "issuer/.dev.vars"),
  `SIGNING_PRIVATE_KEY=${JSON.stringify(signingPrivateKeyPem)}\n`,
  { mode: 0o600 },
);
await writeFile(
  resolve(directory, "smoke/smoke.ts"),
  `
import { createLocalJWKSet, jwtVerify } from "jose";
export default { async fetch(_request, env) {
  const audience = "https://audience.example";
  using issued = await env.ISSUER.issueToken(audience);
  const response = await fetch("http://127.0.0.1:${ports.discovery}/jwks");
  const verified = await jwtVerify(issued.token, createLocalJWKSet(await response.json()), {
    algorithms: ["RS256"], issuer: "https://identity.example", audience,
  });
  if (verified.payload.sub !== "urn:example:pilot") throw new Error("Incorrect RPC props");
  try { using denied = await env.ISSUER.issueToken("https://denied.example"); }
  catch (error) {
    return Response.json({ ok: true, denial: { name: error.name, message: error.message } });
  }
  throw new Error("Expected audience denial");
}};
`,
);
const run = (role, args) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: resolve(directory, role),
    env: environment,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${role}: cf ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
};
for (const role of roles) {
  run(role, ["build", "--mode", "deployment"]);
  run(role, ["deploy", "--prebuilt", "--dry-run", "--mode", "deployment"]);
  const output = resolve(directory, role, ".cloudflare/output/v0");
  const context = JSON.parse(await readFile(resolve(output, "config.json"), "utf8"));
  assert.equal(context.buildContext.mode, "deployment");
  assert.equal(context.accountId, accountId);
  const config = JSON.parse(
    await readFile(resolve(output, "workers/default/worker.config.json"), "utf8"),
  );
  assert.equal(config.name, `cf-pilot-${role}`);
  assert.equal(config.workersDev, false);
  assert.equal(config.previewUrls, false);
  assert.equal(config.compatibilityDate, "2026-08-04");
  assert.deepEqual(config.compatibilityFlags, ["no_nodejs_compat", "no_nodejs_compat_v2"]);
  if (role === "issuer") {
    assert.deepEqual(config.env.SIGNING_PRIVATE_KEY, {
      type: "secrets-store-secret",
      storeId,
      secretName: "PILOT_SIGNING_KEY",
    });
    assert.equal(config.domains, undefined);
    assert.equal(config.triggers, undefined);
  } else if (role === "discovery") {
    assert.deepEqual(config.domains, ["identity.example"]);
    assert.equal(config.env.PUBLIC_JWK_SET.type, "json");
    assert.equal(config.env.SIGNING_PRIVATE_KEY, undefined);
  } else {
    assert.deepEqual(config.env.ISSUER, {
      type: "worker",
      worker: "cf-pilot-issuer",
      exportName: "WorkloadIdentityIssuer",
      props: { subject: "urn:example:pilot", allowedAudiences: ["https://audience.example"] },
    });
  }
  if (role !== "smoke") {
    assert.equal(config.env.ISSUER.value, "https://identity.example");
    assert.deepEqual(config.observability, {
      enabled: true,
      logs: { headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 1 },
    });
  }
  console.log(`${role}: composed deployment build and prebuilt dry-run passed`);
}
const children = [];
try {
  for (const role of roles) {
    const child = spawn(process.execPath, [cli, "dev", "--mode", "local"], {
      cwd: resolve(directory, role),
      env: environment,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (chunk) => {
      log += chunk;
    });
    child.stderr.on("data", (chunk) => {
      log += chunk;
    });
    children.push(child);
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (log.includes("Ready on")) {
        ready = true;
        break;
      }
      if (child.exitCode !== null) break;
      await delay(100);
    }
    assert.ok(ready, `${role} local server did not start:\n${log}`);
  }
  const discovery = await fetch(
    `http://127.0.0.1:${ports.discovery}/.well-known/openid-configuration`,
  );
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).issuer, "https://identity.example");
  assert.equal(discovery.headers.get("cache-control"), "public, max-age=300");
  const smoke = await fetch(`http://127.0.0.1:${ports.smoke}/`);
  assert.equal(smoke.status, 200, await smoke.clone().text());
  const result = await smoke.json();
  assert.equal(result.ok, true);
  console.log("cf dev: discovery, named service binding, RPC props and signature passed");
  assert.deepEqual(result.denial, {
    name: "AudienceNotAllowedError",
    message: "The requested audience is not allowed.",
  });
  console.log(
    "cf dev: discovery, named service binding, RPC props, signature and audience denial passed",
  );
} finally {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") console.error("Failed to stop local fixture:", error);
    }
  }
}
