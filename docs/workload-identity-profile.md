# Workload identity profile

This document is the normative v1 profile for the workload identity issuer
with OIDC-compatible discovery metadata. It specifies a narrow
workload-federation compatibility subset; it does not specify a general OpenID
Provider or OAuth authorization server.

## System boundary and vocabulary

The private **workload identity issuer Worker** exposes
`WorkloadIdentityIssuer.issueToken(audience)` over an RPC Service Binding. Its
result is `IssuedToken { token }`. The public **workload identity discovery
Worker** serves a **workload-federation metadata document at the OIDC discovery
location** and a public JWK Set.

The public Worker deliberately has no generic liveness resource. A successful
GET of the workload-federation metadata document at
`/.well-known/openid-configuration` proves that the public Worker can construct
its metadata and validate the configured public JWK Set. It does not attest that
the private signing key matches that JWK Set or prove that private RPC issuance
works. The deployment smoke check owns those end-to-end assertions.

The generic credential is a **workload identity token** or **workload identity
assertion**. It is not an OAuth bearer access token. Call it an **OIDC ID
token** only when referring to a named consumer profile that satisfies OIDC
audience semantics.

This system deliberately has no authorization endpoint, token endpoint, or
user-info endpoint. The discovery document advertises only the compatibility
subset it implements; it must not imply a general OpenID Provider contract.

## Issuer, subject, and audience

`iss` is a canonical root HTTPS URL: it has an HTTPS scheme, an authority, no
path other than the empty root path, no query, no fragment, no credentials, and
no trailing slash. It is the exact issuer identifier used in the discovery
document and tokens.

`sub` is an opaque workload subject. It is 1 through 255 ASCII characters with
no surrounding whitespace. The issuer allocates it; callers do not. A subject
is unique within the issuer, stable for its workload's identity, and never
reassigned. Because it is public in a signed token, equal subjects let
recipients correlate that workload's activity. Deployments must choose values
with that public correlation property in mind.

`aud` is one exact, deployment-approved recipient identifier encoded as a JSON
string, not an array. Each RPC binding
provides `allowedAudiences`; the issuer accepts only an exact nonempty member
of that list. `AudienceNotAllowedError` represents every caller-side audience
denial without disclosing either the rejected value or the permitted set.
Across a Cloudflare RPC Service Binding this denial is identified by the stable
error `name` (`AudienceNotAllowedError`) and `message` (`The requested audience
is not allowed.`). Callers must not depend on `instanceof` or custom error
fields across that boundary.

Consumer audience formats are documentary v1 profiles, not runtime provider
adapters or enums:

- An OIDC ID Token consumer profile uses the OAuth 2.0 `client_id` (the OIDC
  client identifier) as the `aud` value, as required by that profile's OIDC
  audience semantics.
- An AWS profile uses the AWS client ID or audience configured for that
  provider.
- A Google workload identity federation profile uses its provider resource or
  configured custom audience.

The deployment owner is responsible for placing only the appropriate exact
recipient identifiers in `allowedAudiences`.

## Token profile and handling

Tokens are signed JWTs whose protected header contains exactly `alg`, `kid`,
and `typ`, with `typ: "JWT"` and `alg: "RS256"`. A strict verifier must
require the fixed `alg` and `typ` values, select a public key whose `kid`
matches the header, validate the signature, match the canonical `iss` and its
configured exact `aud`, enforce `exp`, and apply its own required-claim and
clock-skew policy. It must not accept an algorithm based only on a
token-controlled header.

The signed payload contains exactly the registered claims `iss`, `sub`, `aud`,
`iat`, `exp`, and `jti`; `iat` and `exp` are integer NumericDate values. The
lifetime is exactly five minutes. `exp` is the sole expiration value in the RPC
contract: `IssuedToken` contains only `token`, so callers derive any expiry
information from the signed JWT rather than an unsigned duplicate.

`jti` is an assertion identifier. It is not a replay-prevention mechanism:
this profile does not maintain a consumed-identifier store, and recipients must
not assume that a previously seen `jti` makes a still-valid token unacceptable.

These credentials are possession-based and replayable until `exp`: anyone who
obtains one can present it to an accepting recipient. Audience restriction
limits where replay succeeds; it does not prevent replay to the intended
recipient. Tokens must not be logged, put in URLs, persisted beyond an
explicitly defined credential cache, or forwarded to unintended recipients.
The five-minute lifetime bounds exposure but does not make disclosure harmless.

## Public-key profile and rotation

The public JWK Set contains public RSA verification keys only. Each JWK must
have usable `n` and `e`, an RSA modulus of at least 2048 bits, `kty: "RSA"`,
`alg: "RS256"`, `use: "sig"`, and a nonempty unique `kid`. It must contain no
private or symmetric-key parameters, successfully import as an RS256
verification key, and have `kid` equal to its RFC 7638 public-key thumbprint.
The configured and emitted JWK Set has the canonical root shape
`{ "keys": [...] }`; root-level extension members are not published. Per-key
extensions are allowed only when they do not contain private or symmetric key
material and the key still imports for RS256 verification.

The signing private PKCS#8 key is subject to the same 2048-bit RSA minimum
after import. Public JWK material is validated on every executed discovery or
JWK Set request. `Cache-Control: public, max-age=300` is a downstream HTTP
contract only; the Workers are not configured to use Workers edge caching.

Rotation maintains verification continuity in two distinct intervals. First,
publish the new public JWK alongside the old public JWK while the
issuer still signs workload identity tokens with the old signing private key.
Wait at least the public JWK Set's five-minute cache freshness lifetime plus
the profile's one-minute operational propagation margin before changing the
signing secret. This ensures that a verifier honoring the advertised public JWK
Set cache freshness contract cannot still hold a fresh, old-key-only public JWK
Set when tokens signed by the new key begin.

After changing the signing secret and verifying live issuance, wait at least
the five-minute maximum workload identity token lifetime plus the profile's
one-minute verifier clock-skew and operational margin before retiring the old
public JWK. With v1's current inputs, the minimum is two separate six-minute
waits, not one 11-minute post-switch wait. Recalculate each interval if its
inputs change. A JWK Set must never remove a key while an accepting verifier
may still accept a workload identity token signed with it.

## References

- [RFC 7517: JSON Web Key](https://www.rfc-editor.org/rfc/rfc7517)
- [RFC 7518 §3.3: RSASSA-PKCS1-v1_5 using SHA-256](https://www.rfc-editor.org/rfc/rfc7518#section-3.3)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 7638: JSON Web Key Thumbprint](https://www.rfc-editor.org/rfc/rfc7638)
- [RFC 8725: JSON Web Token Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [AWS IAM OIDC provider prerequisites](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [Google Cloud workload identity federation requirements](https://docs.cloud.google.com/iam/docs/use-workload-identity-federation-to-let-customers-access-their-cloud-resources)
