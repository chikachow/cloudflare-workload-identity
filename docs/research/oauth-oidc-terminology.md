# OAuth and OpenID Connect terminology decision

## Decision

This system is a **workload identity issuer with OIDC-compatible discovery
metadata**. It is not a general OpenID Provider, an OAuth authorization
server, or an interactive OpenID Connect authentication flow. In particular,
it has no authorization endpoint, token endpoint, or user-info endpoint.

The distinction matters. OAuth defines an authorization server as issuing
access tokens after a grant; those tokens represent authorization to protected
resources ([RFC 6749, sections 1.1 and 1.4](https://www.rfc-editor.org/rfc/rfc6749#section-1.1)).
This issuer instead produces a workload identity token (also called a workload
identity assertion) that a workload presents to an external security token
service. Use **OIDC ID token** only for a named consumer profile that satisfies
OIDC audience semantics.

Although OpenID Connect Core describes ID Tokens in terms of End-User
authentication, workload identity federation products intentionally apply the
OIDC discovery and ID-token profile to non-human principals. Google requires a
public OpenID Provider configuration and JWK Set and calls the credential an
ID token that uniquely identifies the workload
([Google Cloud workload identity federation requirements](https://docs.cloud.google.com/iam/docs/use-workload-identity-federation-to-let-customers-access-their-cloud-resources)).
AWS IAM likewise requires an OpenID configuration document containing issuer,
JWK Set URI, response type, subject type, and ID-token signing algorithms
([AWS IAM OIDC provider prerequisites](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)).

## Chosen vocabulary

| Surface | Name |
| --- | --- |
| source repository | `cloudflare-workload-identity` |
| deployment repository | `cloudflare-workload-identity-deploy` |
| overall system | **workload identity issuer with OIDC-compatible discovery metadata** |
| private package / Worker | `workload-identity-issuer` |
| public package / Worker | `workload-identity-discovery` |
| RPC entrypoint | `WorkloadIdentityIssuer` |
| RPC operation | `issueToken(audience)` |
| RPC result | `IssuedToken { token }` |
| caller binding properties | `subject`, `allowedAudiences` |
| denied-audience exception | `AudienceNotAllowedError`, where RPC transport permits |
| signer-only secret binding | `SIGNING_PRIVATE_KEY` |
| public key configuration | `PUBLIC_JWK_SET` |
| issuer identifier | `https://workload-identity.chikachow.org` |
| discovery URL | `https://workload-identity.chikachow.org/.well-known/openid-configuration` |
| JWK Set URL | `https://workload-identity.chikachow.org/jwks` |

Use **workload identity token** or **workload identity assertion** in general
prose. Use **OIDC ID token** only for a named consumer profile that satisfies
OIDC audience semantics. Do not call it an OAuth access token.

The private Worker is the issuer, not merely a signer: it selects claims,
enforces per-binding audience policy, and signs the result. “Signing Worker” is
acceptable only as an implementation shorthand.

The public Worker genuinely performs discovery, so **workload identity
discovery** is accurate. It serves the workload-federation metadata document
at the OIDC discovery location and the public JWK Set, but has no service
binding to the private issuer.

## Discovery profile

The public endpoint serves the workload-federation metadata document at the
OIDC discovery location:

```json
{
  "issuer": "https://workload-identity.chikachow.org",
  "jwks_uri": "https://workload-identity.chikachow.org/jwks",
  "response_types_supported": ["id_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "claims_supported": ["iss", "sub", "aud", "iat", "exp", "jti"]
}
```

OpenID Connect Discovery defines broader metadata for a general-purpose OpenID
Provider, including an authorization endpoint
([OpenID Connect Discovery, section 3](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata)).
This workload-federation profile does not invent unusable authorization,
token, or user-info endpoints merely to resemble such a provider. It publishes
the subset required by its workload-federation consumers.

The JWK Set URI is discovered from `jwks_uri`; its concrete path is not fixed
by RFC 7517 or OIDC Discovery. Consequently `/jwks` is preferable to minting an
unregistered `/.well-known/jwks` name. RFC 8615 requires applications creating
new well-known names to register them
([RFC 8615, section 3.1](https://www.rfc-editor.org/rfc/rfc8615#section-3.1)).

## Claim and key vocabulary

Use the registered JWT claim names `iss`, `sub`, `aud`, `iat`, `exp`, and `jti`
on the wire. The `sub` value is a stable, issuer-controlled opaque workload
identifier that is unique within this issuer and never reassigned; its concrete
format remains intentionally unspecified. The `aud` value names the intended token recipient. These
requirements follow
[RFC 7519, sections 4.1.1–4.1.7](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.1).

`allowedAudiences` is deployment policy, not a JWT claim. Each service binding
defines the exact audience values its workload may request. Callers control
neither `sub` nor arbitrary claims.

Publish a public JWK Set containing only verification material, with matching
`kid`, `kty`, `n`, `e`, `use: "sig"`, and `alg: "RS256"`. **JWK** and **JWK
Set** are the formal RFC 7517 terms; **JWKS endpoint** is acceptable operational
shorthand ([RFC 7517](https://www.rfc-editor.org/rfc/rfc7517)).

Derive `kid` from the RFC 7638 public-key thumbprint. This is local profile
policy, not an RFC requirement. Do not configure a second independent key ID
that could drift from the signing key
([RFC 7638](https://www.rfc-editor.org/rfc/rfc7638)).

The five-minute lifetime is fixed issuer policy rather than a deployment
option. It is not controlled by the caller. The normative profile, including
credential handling and consumer-profile constraints, is in
[the workload identity profile](../workload-identity-profile.md).

## Sources

- [RFC 6749: OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 7517: JSON Web Key](https://www.rfc-editor.org/rfc/rfc7517)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 7638: JSON Web Key Thumbprint](https://www.rfc-editor.org/rfc/rfc7638)
- [RFC 8615: Well-Known URIs](https://www.rfc-editor.org/rfc/rfc8615)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [Google Cloud workload identity federation requirements](https://docs.cloud.google.com/iam/docs/use-workload-identity-federation-to-let-customers-access-their-cloud-resources)
- [AWS IAM OIDC provider prerequisites](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
