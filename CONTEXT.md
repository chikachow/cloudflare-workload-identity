# Cloudflare Workload Identity

This context is a workload identity issuer with OIDC-compatible discovery metadata. It issues short-lived workload identity assertions for Cloudflare Workers and publishes the metadata needed by federation consumers.

## Language

**Workload identity issuer with OIDC-compatible discovery metadata**:
The logical system that identifies a bound workload, enforces its audience policy, issues workload identity tokens, and publishes workload-federation metadata at the OIDC discovery location.
_Avoid_: OAuth authorization server, general OpenID Provider

**Workload identity token**:
A short-lived workload identity assertion whose subject identifies a workload for federation. It is an OIDC ID token only for a named consumer profile that satisfies OIDC audience semantics.
_Avoid_: OAuth access token

**Workload identity issuer Worker**:
The private RPC-only component that constructs and signs workload identity tokens under deployment-controlled subject and audience policy.
_Avoid_: signer, token endpoint

**Workload identity discovery Worker**:
The public HTTPS component that serves the workload-federation metadata document at the OIDC discovery location and the public JWK Set.
_Avoid_: public issuer, JWKS-only Worker

**Workload subject**:
A stable, issuer-controlled opaque identifier that is unique within the issuer, never reassigned, and becomes the token's `sub` claim. Its concrete format is intentionally unspecified.
_Avoid_: user, account, caller-supplied subject

**Allowed audience**:
An exact recipient identifier that a particular bound workload is permitted to request as its token's `aud` claim. The deployment binding names these values in `allowedAudiences`.
_Avoid_: scope, client permission

**JWK Set**:
The public verification-key document discovered from the workload-federation metadata document.
_Avoid_: certificate bundle, public secret
