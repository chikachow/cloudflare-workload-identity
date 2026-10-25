# Implementation review — 2026-10-25

This is dated change evidence, not additional repository policy. The governing
instructions are [AGENTS.md](../../AGENTS.md), verification requirements are in
[CONTRIBUTING.md](../../CONTRIBUTING.md), vocabulary is in
[CONTEXT.md](../../CONTEXT.md), and wire/security requirements are in the
[workload identity profile](../workload-identity-profile.md). No root or scoped
`SECURITY.md` exists in this revision; the profile supplies the applicable
security requirements.

## Scope and baseline

The source baseline is `bfa223e376e03df5ac5e41dbe76700c4770825f2`, current
`origin/main` when this review began, containing PR #88. Work was performed in
an isolated checkout. The primary checkout and its three untracked
`.cloudflare` directories were preserved. The separate migration pilot was
outside this change.

All four production source files, their five test files, fixture, package
interfaces, TypeScript/Vitest/Wrangler configuration, dependency policy and
lockfile, CI/update workflows, and existing documentation were examined.
Deployment ownership and the profile consumer were checked read-only against
`chikachow/cloudflare-workload-identity-deploy` main at
`cbf3cf4895b90eb2912852f495eac87b5ad00ed6`, including its README, rotation
runbook and configuration validator. No deployment checkout or source pin was
changed.

## Independent change sets

This record describes the combined candidate examined during the review, not
an assertion that every change is present in the branch carrying this file.
The implementation is published as three independently applicable changes
based on the source baseline above:

- `codex/issuance-boundaries`: issuance deadline, signing-binding validation,
  their unit evidence and the corresponding profile clarification.
- `codex/tooling-security-overrides`: the two development dependency overrides
  and lockfile resolutions.
- `codex/runtime-contract-evidence`: RPC/discovery regression coverage and this
  dated record. These tests also pass against the unchanged baseline production
  code and do not depend on either implementation change.

The verification totals below describe the combined candidate. Each pull
request additionally records checks of its own isolated branch. Statements
about implemented fixes and the zero-advisory audit apply to the corresponding
candidate changes; they do not imply that those changes have already merged.

## Concern coverage map

| Concern                          | Evidence and disposition                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain and public contracts      | Retained `WorkloadIdentityIssuer.issueToken(audience)`, `IssuedToken { token }`, opaque subject, exact audience strings, RS256/JWT header and six registered claims. Literal expectations and signature verification cover the closed token shape in unit tests and workerd. No consumer terminology was renamed.                                                                    |
| Module design and callers        | Retained one shared profile package, the private issuer operation and thin Worker adapter, and the public fetch handler. Shared validation is also consumed by deployment configuration. Splitting or merging these modules offered no demonstrated contract or maintenance benefit; required package exports remain intact.                                                         |
| Authentication and authorization | Binding-controlled subject/audiences remain the authority. Invalid audiences fail before even accessing the signing binding. Existing malformed-props and exact-match tests remain; transported denials now include non-string and array arguments. No new audience or subject policy was introduced.                                                                                |
| Runtime input and external I/O   | Added explicit checks for a string or callable Secrets Store binding, followed by validation that its result is a string. Null, missing, malformed and non-string inputs now produce deliberate configuration errors instead of incidental property-access errors. Tests retain prototype methods and their receiver.                                                                |
| Issuance, failure and recovery   | Expiration remains bounded by issuance start. A post-signing deadline now rejects attempts completing at or after 300 seconds, allowing a fresh request. Tests exercise 299, 300 and 361 seconds, delay during signing, and recovery after a failed secret read. No automatic retries or retained rejected promises were added.                                                      |
| Concurrency and claim stability  | Existing authorization captures issuer, subject and audience as scalar values before awaiting key retrieval. A controlled pending read with subsequent binding mutations verifies that signed claims retain those values. Retained this focused snapshot rather than copying/freezing unrelated configuration. No mutable per-request state is shared between calls.                 |
| Signing keys and rotation        | Retained per-request key reads, RS256 import, the 2048-bit minimum and public-key thumbprint-derived `kid`. Two different synthetic keys verify that a later call reads the changed key. The request-start lifetime protects the documented retirement interval; independent reviewers exercised a delayed old-key response across modeled cutover and retirement.                   |
| Public JWK validation            | Retained canonical Base64urlUInt, minimum modulus, verification import, thumbprint and duplicate-ID checks. Existing tests reject private material and noncanonical integers, preserve public per-key extensions and strip root extras. Shared validation continues to own the rule; no second validator was introduced.                                                             |
| Discovery, caching and recovery  | Existing workerd tests verify exact JSON, cache headers, unsupported methods and missing routes. Added a valid/invalid/repaired sequence for both public paths to establish per-request validation and recovery. Downstream five-minute caching remains distinct from application or edge caching.                                                                                   |
| RPC errors and Worker artifacts  | Workerd verifies the named entrypoint and stable denial `name`/`message`. Both deploy dry-runs pass. Retained bundles expose the intended named/default issuer and default discovery handler; their source maps contain no test sources and emitted code contains no synthetic fixture key. Generated bindings still come from each Wrangler configuration.                          |
| Observability and credentials    | Production source has no logging calls or token persistence. Errors added here contain no key values or caller policy. Negative RPC tests produce workerd diagnostics containing only the generic denial and stack. Public discovery has no secret or issuer service binding. Actual production logging and remote Secrets Store operation were not exercised.                       |
| Tests and independent oracles    | Retained existing assertions and literal public fixture. New timing expectations use fixed clock values rather than production constants; verification checks signatures and exact claims. No recorded baseline was regenerated. Final regression replay against original issuer source failed for the intended stale-issuance and binding-validation cases and passed with the fix. |
| Dependencies, tooling and CI     | Node 24.18.0 and pnpm 12.14.0 were used. Retained release-age, explicit build permissions, peer/dedupe gates, immutable action pins and all CI lanes. Added two conditional transitive overrides after audit identified affected upstream pins; see below. Full checks and coverage passed after the changed dependency inputs were installed.                                       |
| Source, release and operations   | Public-safe example names, disabled public issuer endpoints, production ownership, two distinct rotation waits and repair-forward guidance remain coherent. Successful main CI still dispatches the deployment update workflow; this review performed no dispatch, deployment or remote mutation. Live smoke and rotation attestations remain deployment responsibilities.           |
| Durable guidance                 | Updated only the profile's implemented timing semantics. Existing workflow, verification and terminology owners remain authoritative. This dated map records decisions and limitations without creating additional standing rules.                                                                                                                                                   |

## Resolved findings and design tradeoffs

### Expired issuance and rotation

Previously a sufficiently delayed key read or signature operation returned an
already-expired token. The fix rejects that result after signing and preserves
the original request-start expiration bound. The existing optional numeric
timestamp argument remains available to local callers; the Worker RPC does
not expose it. The attempt deadline is measured independently of that override.

Moving the token's start time after key loading was rejected during independent
review: an outstanding read could return the old key after retirement and
grant it new authority. The final implementation needs neither a key cache nor
a new rotation protocol. Independent standards and requirements reviewers
re-examined source, diff and tests, repeated the delayed old-key scenario, and
reported zero remaining actionable findings.

### Signing binding validation

The signing-key loader owns validation of both its binding and the value read
from it. Runtime checks accept the existing string and Secrets Store interfaces,
including prototype methods, without restricting unrelated members. The
existing empty-string, PKCS#8 and minimum-modulus checks remain. This improves
failure diagnosis; the original malformed values already failed closed, so it
is not presented as an authorization bypass fix.

### Development dependency advisories

`pnpm audit --json` initially reported four advisories: Zod collection memory
exhaustion and three Undici issues involving EventSource, integrity metadata,
and excessive content encodings. These were development dependencies, absent
from the production Worker import graph and emitted code.

Static triage found no configured lower-trust collection, EventSource or
integrity-metadata path for the first three claims. The Miniflare fetch adapter
exists, but an attacker-controlled response path through the configured tooling
was not established for the content-encoding issue. Dependency presence is not
claimed as proof of an exploitable application vulnerability.

Conditional overrides select `zod@4.6.7` for the upstream `4.6.5` pin and
`undici@7.30.1` for `7.29.1`. Both fixed releases satisfy the existing three-day
age policy. These selectors stop affecting resolution when upstream leaves
the named versions; they do not prevent future compatible upstream updates.
The final audit reports zero advisories. This establishes the resolved package
versions and registry result, not an exhaustive security assessment of bundled
third-party code.

Sources: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Undici EventSource advisory](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
[Undici integrity advisory](https://github.com/advisories/GHSA-f72v-6w45-q472),
[Undici content-encoding advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c).

## Verification record

- `pnpm install --frozen-lockfile`: passed at baseline, reused until dependency
  inputs changed, then passed again with the final overrides/lockfile.
- `node --run check`: passed at baseline and after implementation, including
  package-manager/lockfile/peer/dedupe checks, formatting, lint, generated
  bindings, all TypeScript projects, tests and both Worker deployment dry-runs.
- Final tests: 86 unit tests, 6 issuer workerd tests and 6 discovery workerd
  tests passed. No asynchronous leak warnings remain in the final run.
- `node --run test:coverage`: all three lanes passed and each LCOV file lists
  the same four production files. These overlapping execution observations
  must not be added as independent coverage percentages.
- Regression replay: original issuer source with unchanged new expectations
  produced 14 expected failures; restoring the fix passed. This covers expired
  key/signature attempts and explicit malformed-binding/result diagnostics.
- `pnpm audit --json`: four initial advisories; zero after the conditional
  dependency updates.
- Additional `wrangler deploy --dry-run --outdir ...` executions retained both
  bundles for export/source-map inspection; no live deployment occurred.
- `git diff --check`: passed. The lockfile changes are limited to the two
  overrides and their package resolutions.

The first local gate attempt encountered a pnpm executable setup error
(`spawnSync pnpm ENOEXEC`); completing the task-local native pnpm installation
resolved it. An intermediate fixture literal-type error and unconsumed test
response bodies were fixed before the final gate. Neither required weakening
repository checks.

## Verification limits

This review establishes source consistency and local Node/workerd behavior.
It does not establish remote CI success, separate-server RPC proxy behavior,
live Secrets Store latency or rotation, production logging, or live consumer
acceptance. Public/private production key matching and the two rotation waits
still require the deployment repository's authorized smoke checks and operator
attestations. No required local check or independent review remains pending.
