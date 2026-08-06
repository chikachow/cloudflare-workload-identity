# cloudflare-workload-identity

A workload identity issuer with OIDC-compatible discovery metadata for Cloudflare Workers. It is not a general OpenID Provider and has no authorization or token endpoint.

The workspace contains two deployable Workers:

- `workload-identity-issuer` is private and reachable only through an RPC Service Binding. Each binding supplies an immutable workload `subject` and exact `allowedAudiences`; callers can request only an audience.
- `workload-identity-discovery` is public and serves the workload-federation metadata document at the OIDC discovery location and the public JWK Set.

Production deployment configuration, the signing-key binding, custom domain, and source revision live in the private `chikachow/cloudflare-workload-identity-deploy` repository. The source Wrangler files are example-only, public-safe templates used for local checks and dry-runs. They use `*-example` Worker names, `https://issuer.example`, and disable both `workers.dev` and preview URLs; they are not production deployment configuration.

```bash
pnpm install --frozen-lockfile
node --run check
```

Worker type checking generates ignored `.wrangler/types/worker-configuration.d.ts` files independently from each Worker's Wrangler configuration. Run `node --run types:generate` after installation to prime editor tooling; `node --run typecheck` and `node --run check` regenerate them automatically.

The production issuer identifier is `https://workload-identity.chikachow.org`. See [CONTEXT.md](CONTEXT.md) for the project vocabulary, [the workload identity profile](docs/workload-identity-profile.md) for the normative wire contract, and [the OAuth/OIDC terminology decision](docs/research/oauth-oidc-terminology.md) for standards and workload-federation rationale.
