// Preserve the former --strict-vars=false boundary: runtime validation accepts
// arbitrary objects, including malformed JWK Sets exercised by the unit tests.
interface WorkloadIdentityDiscoveryBindings extends Omit<Cloudflare.Env, "PUBLIC_JWK_SET"> {
  PUBLIC_JWK_SET: object;
}
