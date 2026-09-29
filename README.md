# cloudflare-workload-identity

A workload identity issuer with OIDC-compatible discovery metadata for Cloudflare Workers. It is not a general OpenID Provider and has no authorization or token endpoint.

The workspace contains two deployable Workers:

- `workload-identity-issuer` is private and reachable only through an RPC Service Binding. Each binding supplies an immutable workload `subject` and exact `allowedAudiences`; callers can request only an audience.
- `workload-identity-discovery` is public and serves the workload-federation metadata document at the OIDC discovery location and the public JWK Set.

Production deployment configuration, the signing-key binding, custom domain, and source revision live in the private `chikachow/cloudflare-workload-identity-deploy` repository. The source `cloudflare.config.ts` files are example-only, public-safe templates used for local checks and dry-runs. They use `*-example` Worker names, `https://issuer.example`, and disable both `workers.dev` and preview URLs; they are not production deployment configuration.

```bash
pnpm install --frozen-lockfile
node --run check
```

Worker type checking runs `cf workers types` to generate ignored `.cloudflare/types/index.d.ts` files independently from each Worker’s configuration. Wrangler remains the build backend. Run `node --run types:generate` after installation to prime editor tooling; `node --run typecheck` and `node --run check` regenerate them automatically.

The production issuer identifier is `https://workload-identity.chikachow.org`. See [CONTEXT.md](CONTEXT.md) for the project vocabulary, [the workload identity profile](docs/workload-identity-profile.md) for the normative wire contract, and [the OAuth/OIDC terminology decision](docs/research/oauth-oidc-terminology.md) for standards and workload-federation rationale.

Run `pnpm --filter workload-identity-discovery dev` or `pnpm --filter workload-identity-issuer dev` for local development. The issuer needs synthetic/local `SIGNING_PRIVATE_KEY` material in a local `.dev.vars` file. Each Worker also exposes `build`, `types:generate`, and `deploy:dry-run`; dry runs build once and validate that output with `cf deploy --prebuilt --dry-run`. These source commands use the undefined/default mode consistently.

See [the cf pilot evaluation](docs/research/cf-migration-evaluation.md) for pinned versions, live deployment evidence, deployment-repository integration, and the known multi-server local RPC error-transport limitation. `pnpm run evaluate:cf` reproduces that limitation and currently exits nonzero on its strict error-contract assertion.
