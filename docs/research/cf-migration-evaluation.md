# cf migration pilot

Evaluated 2026-09-29. **Adopt with conditions for this source repository; defer the production deployment-repository switch.** Both Workers work with cf, including a live private RPC/discovery probe. The value here is typed, composable configuration and one build artifact for validation/deployment. It costs a beta CLI, coordinated tooling upgrades, explicit type compatibility work, and a local RPC proxy limitation. There is no demonstrated runtime-performance benefit.

The source checkout began clean at `eedc56ce6be86a498c2c4affac0bef6fd047d0d2`. The deployment checkout remained unchanged at `98c028b8b5f3a7c25548cfb6eff4c9f70e8f0e56`, with source submodule `39fce9a880f9d4a927a72d0e2b4c28d1ed227ce5`. That source pin is not the pilot baseline.

## Versions and dependency scope

| Tool                        | Baseline       | Initial pilot           |
| --------------------------- | -------------- | ----------------------- |
| Node                        | 24.18.0        | 24.18.0                 |
| pnpm                        | 10.33.0        | 10.33.0                 |
| cf                          | absent         | **1.0.0-beta.5**        |
| Wrangler                    | 4.129.1        | **4.143.0**, per Worker |
| `@cloudflare/vitest-plugin` | 1.1.5          | **1.3.1**               |
| Vite / Vitest               | 8.2.2 / 4.1.11 | unchanged               |
| TypeScript / jose           | 7.0.2 / 6.2.10 | unchanged               |
| workerd                     | 1.20260907.1   | 1.20260926.1            |

For draft PR preparation, the proposal was rebased onto `4460e3aa62dec3cd9911b17556db5f065e6f89ef` (`origin/main`). Its unrelated updates were retained: jose 6.2.12, Vite 8.3.0, `@types/node` 24.13.5, oxfmt 0.68.0 and oxlint 1.83.0. The migration still pins cf 1.0.0-beta.5, Wrangler 4.143.0 and Vitest plugin 1.3.1. The full local check and coverage lanes were rerun on this rebased dependency set; the live deployment observations below belong to the initial pilot versions in the table.

The final cf, Wrangler and Vitest plugin resolve `@cloudflare/config` 0.20.0; cf uses `@cloudflare/runtime-types` 0.1.4. Wrangler remains necessary as the build/dev backend and as a Vitest plugin dependency. Vite remains necessary for testing; no Cloudflare Vite plugin was added. pnpm warned that dependency build scripts were ignored; installed platform binaries nevertheless passed the executed builds and tests. No blanket script approval was added.

Removed both legacy `wrangler.jsonc` files, empty generated `wrangler.config.ts` files, root Wrangler dependency, old generated-type references, and obsolete workerd 1.20260907.1 release-age exceptions. `.wrangler` ignores and test log/registry settings remain necessary for the underlying Wrangler/Vitest tooling. `.cloudflare` and local `.dev.vars` files are ignored. No production account, domain, resource ID or signing secret is embedded in source configuration.

## Migration and observed failures

Executed for each role (`issuer`, `discovery`):

```sh
pnpm exec cf migrate workers/workload-identity-ROLE/wrangler.jsonc --bundler wrangler --dry-run --no-install
pnpm exec cf migrate workers/workload-identity-ROLE/wrangler.jsonc --bundler wrangler --no-install --force
```

Both dry runs returned exit 1 for the required dependency-install follow-up. Actual migration wrote two files beside each input and inserted a blocking throw. Exact cf dependencies were installed deliberately, then the throw/TODO was removed. `--force` bypassed only changes created by this evaluation: there was no pre-existing user dirt, and no existing generated config was overwritten.

1. A root-only Wrangler dependency failed: `No Cloudflare dev-server is installed in this project`. cf checks the Worker manifest and its local installation. Both Worker packages now declare exact cf and Wrangler versions.
2. Wrangler **4.136.0**, the documented minimum, rejected the migrator's `types` field in `wrangler.config.ts`. The coordinated final **4.143.0** understands it. Empty build configuration is unnecessary and has been removed; automatic default type generation is acceptable.
3. Vitest plugin **1.1.5** exposes `experimental.newConfig`, but its loader expects the older default Worker export model. The current `defineConfig({ worker })` failed with `The default export is not a supported export type`. **1.3.1** loads the current model and passes both real workerd suites without an adapter or retained test JSONC.
4. A string entrypoint generated binding types but did not infer the named RPC module for `cloudflare:workers` exports. `import * as entrypoint ... with { type: "cf-worker" }` restores module inference and the strict workerd test typecheck.
5. Full issuer dev startup failed on exported numeric `tokenLifetimeSeconds`: `Incorrect type for map entry ... not of type function or ExportedHandler`. Reproduced independently with original **Wrangler 4.129.1 and original JSONC**. Existing tests and deployment dry runs missed this pre-existing issue. `src/worker.ts` now exports only the default and named Worker entrypoints. `src/index.ts` still supplies the unchanged package API, functions, constants and types. No signing/policy implementation changed.
6. Separate `cf dev` servers pass issuance and signature verification but transport denial as `{ name: "Error", message: "AudienceNotAllowedError: The requested audience is not allowed." }`. The same strict assertion passes between deployed Workers and in the workerd test lane. This is a local multi-server-path limitation; this evaluation did not establish its exact upstream cause or whether older Wrangler multi-server dev behaved identically. The prototype does not weaken the application error contract to accommodate it.
7. Noninteractive `cf workers delete NAME` prints `Aborted.` and exits **0** unless confirmed with `--force`. Cleanup was completed with that flag in dependency order and each Worker was independently confirmed absent with API 404. Do not treat an exit code alone as deletion evidence.

## Configuration and type parity

| Existing contract                      | cf implementation and evidence                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Example names; no production ownership | Same `*-example` names; no account selected in source; deployment config imports/spreads source definition                                                      |
| Compatibility                          | Date `2026-08-04`, flags `no_nodejs_compat`, `no_nodejs_compat_v2` unchanged in output                                                                          |
| Routing boundary                       | `workersDev: false`, `previewUrls: false`; no routes, domains or triggers in either source output                                                               |
| Issuer                                 | `ISSUER: bindings.text<string>(...)`, required `SIGNING_PRIVATE_KEY: bindings.secret()`                                                                         |
| Discovery                              | Same issuer value and exact structured public JWK Set via `bindings.json`; never a JSON string or secret                                                        |
| Observability                          | Source `enabled: true` unchanged; fixture adds deployment-owned logs/traces with sampling rate 1                                                                |
| RPC exports                            | Default and named `WorkloadIdentityIssuer` preserved; only non-Worker exports excluded from deployed issuer bundle                                              |
| Named Env interfaces                   | Small declarations extend generated `Cloudflare.Env`; no generated-file postprocessing                                                                          |
| `--strict-vars false`                  | `text<string>` prevents literal issuer types; discovery keeps its previous `PUBLIC_JWK_SET: object` runtime-validation boundary, allowing malformed test inputs |
| Runtime types                          | `cf workers types` generates `.cloudflare/types/index.d.ts`, including workerd runtime types for the configured date/flags                                      |
| Typecheck order                        | Each Worker generates types before tsc; root test-project checks follow recursive package checks                                                                |

`docs/research/cf-migration-baseline.json` freezes independently read baseline metadata from the original JSONC. It is historical test evidence, not deployable configuration. `scripts/check-cf-parity.mjs` compares the **whole effective output configuration**, so extra bindings/routes/public exposure fail. It accounts explicitly for `index.js` → `worker.js` due to the issuer wrapper and checks the bundle exports. This is stronger than comparing only renamed config keys. Account/build context, binding kinds and values, flags, names, observability and routing boundaries are checked.

## Executed verification

| Experiment                                       | Result                                                                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline `pnpm run check`                        | Passed outside sandbox: 66 unit, 2 issuer workerd, 6 discovery workerd; typechecks and Wrangler dry runs                                                                                                  |
| Final `pnpm run check`                           | Passed: lockfile, formatting, lint, all typechecks, same 74 tests, both cf builds/prebuilt dry runs, whole-metadata parity                                                                                |
| `pnpm run test:coverage`                         | All three existing coverage lanes passed                                                                                                                                                                  |
| Config-dependence oracle                         | Temporarily changed each cf config's issuer to `https://perturbed.example`: issuer JWT issuer assertion failed; discovery metadata issuer assertion failed. Restored both. Legacy JSONC is deleted.       |
| `cf workers types`                               | Both packages generated binding + runtime declarations; named interfaces and workerd test exports typechecked                                                                                             |
| `cf build` then `cf deploy --prebuilt --dry-run` | Passed for both source Workers; default/undefined mode consistently used                                                                                                                                  |
| Dummy deployment composition                     | Issuer, discovery, smoke built and prebuilt-dry-ran in explicit `deployment` mode                                                                                                                         |
| Mode mismatch                                    | Prebuilt deploy with `--mode wrong` rejected output created in `deployment` mode before upload                                                                                                            |
| Three local dev servers                          | Discovery, cache contract, named RPC binding, props and signature passed; strict denial assertion failed as described above                                                                               |
| Live cf deploy                                   | Three disposable Workers deployed from prebuilt output in `pilot` mode, then authenticated smoke passed discovery/JWK cache headers, signature, issuer, audience, subject and exact denied-audience error |
| Live cleanup                                     | All three disposable Workers confirmed absent with API 404 after deletion                                                                                                                                 |

Sandboxed workerd initially failed binding loopback (`listen EPERM`). Tests/type generation/dev were run with appropriate local execution permission; this was not a source failure. No validation gate was disabled. Vitest evaluates configuration in its test mode; both source definitions are mode-independent, so this matches the default-mode build settings.

The first live probe used a **synthetic ordinary Worker secret**, not a production signing key. Issuer/discovery had no workers.dev or preview exposure. Only the temporary smoke Worker enabled workers.dev, protected by a random secret; unauthenticated requests returned 404. It returned pass/fail/error-contract diagnostics and never returned a minted token. No production Worker, route, key, deployment source pin or deployment script was changed. The completed live run used the unique Worker-name suffix `76228707`.

A live Secrets Store-backed signing test was not executed, and no store mutation was performed. That validation remains required before production adoption. The successful ordinary-secret live probe and dummy Secrets Store composition establish narrower evidence.

## Reproduce and interpret

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:coverage
pnpm --filter workload-identity-discovery dev
pnpm --filter workload-identity-issuer build
pnpm --filter workload-identity-issuer types:generate
pnpm --filter workload-identity-issuer deploy:dry-run
pnpm run evaluate:cf
```

The last command generates ignored `.cloudflare/cf-pilot/{issuer,discovery,smoke}` fixtures with dummy IDs, builds and validates their deployment artifacts, starts three loopback dev servers with synthetic signing material, and stops them in `finally`. **It currently exits nonzero at the strict cross-server error assertion.** It is an additional exploratory check, not a replacement for the existing CI gates.

An explicit remote probe is available in `scripts/evaluate-cf-remote.mjs`:

```sh
# Requires prior cf login and explicit selection of the evaluation account.
CLOUDFLARE_ACCOUNT_ID=<account> node scripts/evaluate-cf-remote.mjs --execute
```

It uses fresh random Worker names, verifies those names are unused, dry-runs and deploys the same output, protects the smoke endpoint, and deletes only its own Workers in dependency order. Review its cleanup output: interruption or API failure still requires cleanup of names saved under the ignored `.cloudflare` evaluation directory. This command makes remote changes; ordinary `check` and `evaluate:cf` do not.

## Deployment-repository follow-up

Use one package directory per issuer, discovery and smoke Worker, each with a `cloudflare.config.ts` and locally declared backend dependency. Do not migrate all three current JSON files into their common directory: output filenames collide. Import the pinned source's definition; spread its Worker, then explicitly replace deployment-owned name, issuer, public JWK Set, domains/routes, observability and signing binding. Keep account selection explicit and mode-independent; build and deploy with the same explicit mode. Avoid shallowly replacing the entire `env` without deliberately retaining required bindings.

The runnable local fixture proves composition with dummy `accountId`, custom domain, Secrets Store `storeId`/`secretName`, and the named service binding's props. It deliberately **replaces** the source `bindings.secret()` with `bindings.secretsStoreSecret()`. Its local mode uses a synthetic ordinary secret instead. Resource identity must remain explicit; no omitted resource should be auto-provisioned during this migration.

The deployment repository currently pins an older source contract and stores `PUBLIC_JWK_SET` as a string. This source baseline requires a structured object. Its source-pin/public-key-contract update and the wrapper entrypoint choice must be reviewed together, rather than treating this prototype as a drop-in replacement. Preserve strict deployment validation, preflight/post-deploy smoke, private/public boundaries, explicit logs/traces, coordinated ordering and rotation runbooks. Existing scripts invoking Wrangler JSON configuration require deliberate migration; none were executed or edited here.

Before switching production: resolve or explicitly track the local proxy limitation, validate the real Secrets Store binding through an isolated synthetic-key deployment, adapt deployment validation to effective cf output, and exercise production route/domain changes under that repository's release procedure. cf remains beta: config, build-output and CLI APIs can change. Keep exact pins and prebuilt-mode checks. Single-secret updates and tail may still require Wrangler; retaining the backend is intentional.

## Evidence boundaries and primary sources

Executed local/live results above are observations, not documentation promises. Live tests establish private Worker service behavior using an ordinary Worker secret, not production custom-domain routing, production key continuity, Terraform resource adoption or all Secrets Store behavior. The dummy Secrets Store/domain/observability composition establishes serialized config and dry-run acceptance, not remote resource ownership.

Primary docs were retrieved on 2026-09-29. The preview host failed in web retrieval; its `index.md` pages were fetched directly. Installed package source/types and exact commands resolved discrepancies, notably the minimum Wrangler version and old Vitest config model.

- [Migration](https://docs-cloudflare-cli.previews.developers.cloudflare.com/cf/wrangler/migrate/)
- [Configuration and typed entrypoints](https://docs-cloudflare-cli.previews.developers.cloudflare.com/cf/projects/cloudflare-config/)
- [Project execution and prebuilt deployment](https://docs-cloudflare-cli.previews.developers.cloudflare.com/cf/projects/)
- [Build Output](https://docs-cloudflare-cli.previews.developers.cloudflare.com/cf/projects/build-output/)
- [CI guidance](https://docs-cloudflare-cli.previews.developers.cloudflare.com/cf/ci/)
- Installed `@cloudflare/vitest-plugin` 1.1.5 and 1.3.1 `dist/pool/index.mjs` / declaration files; Wrangler 4.136.0 and 4.143.0 config loaders; cf 1.0.0-beta.5 command help and schemas.
