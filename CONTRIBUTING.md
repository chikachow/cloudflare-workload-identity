# Contributing

The [workload identity profile](docs/workload-identity-profile.md) owns the service contract; [AGENTS.md](AGENTS.md) owns repository agent guidance. Personal agent configuration is not required to contribute.

Use the Node and pnpm versions selected by `.nvmrc` and `package.json`, and the dependencies pinned in `pnpm-lock.yaml`. Follow [dependency tooling](README.md#dependency-tooling) for installation, updates, and dependency validation policy; script definitions in `package.json` own command composition.

## Validation scope

Use focused checks while working. Before claiming implementation completion or merge readiness, apply the matching gate. An incomplete draft or blocked handoff must identify pending verification and review.

| Change                                                                         | Required verification                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent instructions or wording corrections                                      | Check consistency with source and owning contracts, local links, and the final diff. Run the pinned formatter on changed Markdown files (`pnpm exec oxfmt --check <files>`) and `git diff --check`. Respect the existing exclusion in `format:check`. A full install or application check is not required solely for prose. |
| Code, configuration, dependencies, generated artifacts, or executable examples | Establish dependencies with `pnpm install --frozen-lockfile`, then run `node --run check` plus focused behavioral checks at the affected boundary. Reuse a successful installation while dependency inputs and the verified environment remain unchanged.                                                                   |
| Coverage collection, test configuration, or coverage claims                    | In addition to the applicable gate above, run the affected coverage lanes. Run `node --run test:coverage` for shared configuration or repository-wide coverage claims. Ordinary test edits alone do not require another run under coverage.                                                                                 |

Classify documentation by its effect. Changes to implemented normative contracts require agreement among the profile, implementation, and tests, plus the code verification gate even when the immediate diff is Markdown only. Explicitly requested design proposals remain proposals and do not authorize implementation.

For semantic instruction changes, walk through representative triggering, permitted, and unrelated tasks to check routing, scope, approval boundaries, and completion. Label static walkthroughs as such; claims of improved agent behavior require observed trials.

For behavior changes, choose evidence at the public seam: exact JWT headers and claims with signature verification, denied audiences before secret access, transported RPC errors, or HTTP responses and JWK rejection as applicable. Oracles must be capable of disagreeing with the changed production logic. To claim a regression test detects a defect, run unchanged expectations against the faulty behavior, observe the relevant failure, and restore a pass with the fix; report the limitation when that cannot be safely demonstrated. When consolidating tests, account for materially affected guarantees and deliberately relinquished coverage.

Use unit tests for profile and issuance logic and the affected workerd suite for Cloudflare bindings, RPC, or fetch behavior. Unit tests alone cannot establish cross-RPC error transport; local workerd results do not establish separate-server proxy or deployed behavior.

For security or protocol changes, make a separate post-implementation adversarial pass over accepted and rejected inputs, authority, and credential exposure. Substantial changes to who can obtain tokens, permitted audiences, credential exposure, or key-rotation guarantees also require independent review by a human or separate agent. Give that reviewer the requirements and evidence without prescribing a verdict; they must examine the relevant diff, source, and tests themselves. Resolve material in-scope findings and rerun affected checks before completion. If required review is unavailable, report the implementation as awaiting review, not complete.

Once appropriate checks pass, repeat or broaden them only for new changes, failures, or unresolved concerns, including flakiness or changed external state. Explain the evidence for classifying a failure as environmental and try safe scoped alternatives. Report exact failed or unavailable commands and remaining uncertainty. Required checks that cannot run leave verification blocked. Local results do not establish remote CI success; the [CI workflow](.github/workflows/ci.yml) still runs its check and coverage jobs for prose changes too.

## Tooling and build verification

Use pinned tooling and generators. Edit configuration or source declarations rather than generated `.cloudflare` output. Each Worker owns its cf configuration and cf/Wrangler dependencies; typechecking generates its binding and runtime declarations before checking source. Keep Worker runtime code compatible with its configured compatibility date and flags.

Preserve both the issuer package's ordinary exports and valid deployed Worker exports. The current deployment wrapper excludes ordinary package exports that are not valid Worker entrypoints. For build or configuration changes, inspect effective output and exports as well as typechecks. `check` builds both Workers before checking configuration parity.

The [migration baseline](docs/research/cf-migration-baseline.json) records historical evidence. Preserve its provenance and keep previous evidence recoverable when replacing the active baseline. Authorized configuration changes may use explicit differences or an independently reviewed successor baseline or oracle; justify changed expectations from requirements and independent evidence, not merely by copying generated output.

For migration investigations, upgrades affecting recorded constraints, or recurrence of a recorded failure, consult the relevant [cf evaluation](docs/research/cf-migration-evaluation.md) sections. Recheck dated observations against the affected versions. Its [additional probes](docs/research/cf-migration-evaluation.md#reproduce-and-interpret) have distinct evidence limits; an exploratory failure does not waive ordinary gates or justify weakening the RPC contract.

## Source and deployment boundary

This repository owns reusable Worker source and public-safe example configurations. Production bindings, resources, routing, source revision, and release operations belong to the private `chikachow/cloudflare-workload-identity-deploy` repository. Keep production secrets and local credentials out of source. Use deliberately public synthetic signing material that grants no operational authority for local tests; such fixtures do not require production procedures. The profile owns token-handling and key-rotation requirements.

Local checks and deploy dry-runs do not authorize live deployment. For an authorized remote evaluation, read the [remote probe and cleanup procedure](docs/research/cf-migration-evaluation.md#reproduce-and-interpret), select the intended account explicitly, scope mutations to the intended resources, and verify cleanup of temporary resources. Carry existing authorization forward; report exact residual resources and failures if cleanup is incomplete. Production deployment or release work must follow the deployment repository's current validation, smoke-check, and rotation procedures; successful source checks cannot substitute for them.

Before updating `main` or manually dispatching the [deployment-update workflow](.github/workflows/run-cloudflare-workload-identity-deploy-update.yml), inspect its downstream consequences: successful push CI on `main` dispatches a workflow in the deployment repository, and manual dispatch also has remote effects. Ordinary branch pushes and draft pull requests do not trigger this dispatch. A successful dispatch alone does not establish a production deployment.
