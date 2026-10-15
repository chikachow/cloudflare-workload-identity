# cloudflare-workload-identity

A workload identity issuer with OIDC-compatible discovery metadata for Cloudflare Workers. It is not a general OpenID Provider and has no authorization or token endpoint.

The workspace contains two deployable Workers:

- `workload-identity-issuer` is private and reachable only through an RPC Service Binding. Each binding supplies an immutable workload `subject` and exact `allowedAudiences`; callers can request only an audience.
- `workload-identity-discovery` is public and serves the workload-federation metadata document at the OIDC discovery location and the public JWK Set.

Production deployment configuration, the signing-key binding, custom domain, and source revision live in the private `chikachow/cloudflare-workload-identity-deploy` repository. The source Wrangler files are example-only, public-safe templates used for local checks and dry-runs. They use `*-example` Worker names, `https://issuer.example`, and disable both `workers.dev` and preview URLs; they are not production deployment configuration.

```bash
corepack pnpm install --frozen-lockfile
node --run check
```

Dependency updates allow intermediate peer conflicts while Dependabot assembles
its grouped updates (`strictPeerDependencies: false`). Required peers remain
explicit through `autoInstallPeers: false`. `node --run check` first validates
manifest/lockfile consistency, then runs these dependency gates:

- `node --run peer-dependencies:check` runs `pnpm peers check`, rejecting missing
  required peers and incompatible versions without changing the lockfile,
  including in a permissively generated lockfile. A frozen install alone does
  not revalidate peer requirements. CI rejects a lockfile diff after validation.
- `node --run dedupe:check` checks whether pnpm could consolidate the lockfile
  without editing it. Incompatible ranges and distinct peer contexts can still
  require multiple versions. To apply deduplication, run
  `pnpm dedupe --ignore-scripts`, review the diff, and repeat the checks.

Worker type checking generates ignored `.wrangler/types/worker-configuration.d.ts` files independently from each Worker's Wrangler configuration. Run `node --run types:generate` after installation to prime editor tooling; `node --run typecheck` and `node --run check` regenerate them automatically.

The production issuer identifier is `https://workload-identity.chikachow.org`. See [CONTEXT.md](CONTEXT.md) for the project vocabulary, [the workload identity profile](docs/workload-identity-profile.md) for the normative wire contract, and [the OAuth/OIDC terminology decision](docs/research/oauth-oidc-terminology.md) for standards and workload-federation rationale.

## Dependency tooling

Use Node 24 with Corepack shims first on `PATH` (`corepack enable`), then run
`corepack pnpm` from this repository's directory. `packageManager`
is the single pnpm version pin. CI installs that version with `pnpm/action-setup`,
prepends Corepack shims to `PATH`, and runs `node --run pnpm:check` before dependency
commands. Shims also select the correct version for nested script invocations. Direct global pnpm
invocations do not enforce the pin: `pmOnFail: ignore` keeps the lockfile as one
YAML document for GitHub's dependency graph. Adding config dependencies requires
reviewing that compatibility assumption.

`autoDedupe` consolidates compatible resolutions during updates, including across
workspace projects outside a command's filter. Frozen installs leave the graph
unchanged; `lockfile.includeResolutionSettings` records the selected deduplication
and linking settings. Keep the frozen-lockfile, peer and dedupe validation gates.
`verifyDepsBeforeRun: error` stops pnpm scripts when dependencies are stale; it
does not guard `node --run`, so install explicitly before validation.

Dependency resolution uses a three-day release age, aligned with npm Dependabot
cooldown where configured. Frozen installs also verify lockfile supply-chain
policy. Dependency build scripts require explicit `allowBuilds` decisions;
`strictDepBuilds` rejects unreviewed builds.
