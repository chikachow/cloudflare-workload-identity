import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
assert.ok(process.argv.includes("--execute"), "Remote evaluation requires --execute");
assert.ok(process.env.CLOUDFLARE_ACCOUNT_ID, "Set CLOUDFLARE_ACCOUNT_ID explicitly");
const root = resolve(import.meta.dirname, "..");
const { signingPrivateKeyPem } = await import(
  pathToFileURL(resolve(root, "test/support/signing-key.ts"))
);
const suffix = randomBytes(4).toString("hex");
const dir = resolve(root, `.cloudflare/cf-remote-${suffix}`);
const names = Object.fromEntries(
  ["issuer", "discovery", "smoke"].map((r) => [r, `cwi-cf-pilot-${suffix}-${r}`]),
);
const cli = resolve(root, "node_modules/cf/bin/cf");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
const probeSecret = randomBytes(32).toString("hex");
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, "resources.json"), JSON.stringify(names, null, 2));
const run = (cwd, args) =>
  spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: "utf8" });
const checked = (cwd, args) => {
  const r = run(cwd, args);
  assert.equal(r.status, 0, `cf ${args[0]} failed\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const p = JSON.parse(
  await readFile(resolve(root, "workers/workload-identity-issuer/package.json"), "utf8"),
);
for (const role of Object.keys(names)) {
  const cwd = resolve(dir, role);
  await mkdir(cwd, { recursive: true });
  await symlink(
    resolve(root, "workers/workload-identity-issuer/node_modules"),
    resolve(cwd, "node_modules"),
    "dir",
  );
  await writeFile(
    resolve(cwd, "package.json"),
    JSON.stringify({ private: true, type: "module", devDependencies: p.devDependencies }),
  );
  const source = JSON.stringify(
    pathToFileURL(resolve(root, `workers/workload-identity-${role}/cloudflare.config.ts`)).href,
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
import {defineConfig,bindings} from 'cf/config';
export default defineConfig({worker:{name:'${names.smoke}',entrypoint:'smoke.ts',compatibilityDate:'2026-08-04',compatibilityFlags:['no_nodejs_compat','no_nodejs_compat_v2'],workersDev:true,previewUrls:false,env:{
AUTH:bindings.secret(),ISSUER:bindings.worker({worker:'${names.issuer}',exportName:'WorkloadIdentityIssuer',props:{subject:'urn:example:pilot',allowedAudiences:['https://audience.example']}}),DISCOVERY:bindings.worker({worker:'${names.discovery}'})
}}});
`
      : `import {defineConfig} from 'cf/config';import source from ${source};export default defineConfig({worker:{...source.worker,name:'${names[role]}',entrypoint:${entrypoint},workersDev:false,previewUrls:false}});`;
  await writeFile(resolve(cwd, "cloudflare.config.ts"), config);
}
await writeFile(
  resolve(dir, "issuer/secrets.json"),
  JSON.stringify({ SIGNING_PRIVATE_KEY: signingPrivateKeyPem }),
  { mode: 0o600 },
);
await writeFile(resolve(dir, "smoke/secrets.json"), JSON.stringify({ AUTH: probeSecret }), {
  mode: 0o600,
});
await writeFile(
  resolve(dir, "smoke/smoke.ts"),
  `
import {createLocalJWKSet,jwtVerify} from 'jose';
export default {async fetch(request,env){
 if(request.headers.get('authorization')!=='Bearer '+env.AUTH)return new Response('Not Found',{status:404});
 const metadata=await env.DISCOVERY.fetch('https://issuer.example/.well-known/openid-configuration');
 if(metadata.status!==200 || metadata.headers.get('cache-control')!=='public, max-age=300')throw new Error('metadata contract');
 const discovery=await metadata.json();if(discovery.issuer!=='https://issuer.example')throw new Error('issuer mismatch');
 const keys=await env.DISCOVERY.fetch(discovery.jwks_uri);
 if(keys.status!==200 || keys.headers.get('cache-control')!=='public, max-age=300')throw new Error('JWK response contract');
 using issued=await env.ISSUER.issueToken('https://audience.example');
 const verified=await jwtVerify(issued.token,createLocalJWKSet(await keys.json()),{issuer:discovery.issuer,audience:'https://audience.example',algorithms:['RS256']});
 if(verified.payload.sub!=='urn:example:pilot')throw new Error('RPC props mismatch');
 try{using denied=await env.ISSUER.issueToken('https://denied.example');}
 catch(error){return Response.json({ok:true,denial:{name:error.name,message:error.message}});}
 throw new Error('expected denial');
}};
`,
);
const attempted = [];
try {
  for (const role of Object.keys(names)) {
    const cwd = resolve(dir, role);
    const absent = run(cwd, ["workers", "get", names[role]]);
    assert.notEqual(absent.status, 0, "Refusing to overwrite existing Worker");
    assert.match(absent.stderr + absent.stdout, /not found|does not exist|404|10007/i);
    checked(cwd, ["build", "--mode", "pilot"]);
    const args = [
      "deploy",
      "--prebuilt",
      "--mode",
      "pilot",
      ...(role === "discovery" ? [] : ["--secrets-file", "secrets.json"]),
    ];
    checked(cwd, [...args, "--dry-run"]);
    attempted.push(role);
    const output = checked(cwd, args);
    await writeFile(resolve(cwd, "deploy.log"), output);
    console.log(`${role}: deployed ${names[role]}`);
    if (role === "smoke") {
      const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)[0];
      let response;
      for (let i = 0; i < 20; i++) {
        try {
          response = await fetch(url, { headers: { authorization: "Bearer " + probeSecret } });
          if (response.status === 200) break;
        } catch {}
        await delay(1000);
      }
      assert.equal(response?.status, 200);
      const result = await response.json();
      console.log("Remote probe:", JSON.stringify(result));
      assert.deepEqual(result, {
        ok: true,
        denial: {
          name: "AudienceNotAllowedError",
          message: "The requested audience is not allowed.",
        },
      });
      assert.equal((await fetch(url)).status, 404);
    }
  }
} finally {
  for (const role of attempted.reverse()) {
    const cwd = resolve(dir, role);
    const r = run(cwd, ["workers", "delete", names[role], "--force"]);
    console.log(`${role}: cleanup exit ${r.status}`);
    if (r.status !== 0) {
      console.error(r.stdout, r.stderr);
      process.exitCode = 1;
    } else {
      const check = run(cwd, ["workers", "get", names[role]]);
      const absent =
        check.status !== 0 &&
        /not found|does not exist|404|10007/i.test(check.stderr + check.stdout);
      console.log(`${role}: absence verified ${absent}`);
      if (!absent) process.exitCode = 1;
    }
  }
}
