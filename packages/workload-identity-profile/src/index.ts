import { calculateJwkThumbprint, importJWK, type JWK } from "jose";

export const workloadIdentityAlgorithm = "RS256";
export const workloadIdentityTokenType = "JWT";
export const workloadIdentityTokenLifetimeSeconds = 300;
export const workloadIdentityMinimumRsaModulusLength = 2048;

export const workloadIdentityDiscoveryPath = "/.well-known/openid-configuration";
export const workloadIdentityJwksPath = "/jwks";

export const workloadIdentityClaims = ["iss", "sub", "aud", "iat", "exp", "jti"] as const;

export interface WorkloadFederationMetadata {
  readonly issuer: string;
  readonly jwks_uri: string;
  readonly response_types_supported: readonly ["id_token"];
  readonly subject_types_supported: readonly ["public"];
  readonly id_token_signing_alg_values_supported: readonly ["RS256"];
  readonly claims_supported: typeof workloadIdentityClaims;
}

export interface PublicJwkSet {
  readonly keys: readonly PublicRsaJwk[];
}

export interface PublicRsaJwk {
  readonly kty: "RSA";
  readonly n: string;
  readonly e: string;
  readonly alg: "RS256";
  readonly use: "sig";
  readonly kid: string;
  readonly [member: string]: unknown;
}

const privateOrSymmetricJwkParameters = new Set(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);

export function requireCanonicalRootHttpsIssuer(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("ISSUER must be a canonical root HTTPS URL.");
  }

  let issuer: URL;
  try {
    issuer = new URL(value);
  } catch {
    throw new Error("ISSUER must be a canonical root HTTPS URL.");
  }

  if (
    issuer.protocol !== "https:" ||
    issuer.username !== "" ||
    issuer.password !== "" ||
    issuer.pathname !== "/" ||
    issuer.search !== "" ||
    issuer.hash !== "" ||
    value !== issuer.toString().slice(0, -1)
  ) {
    throw new Error("ISSUER must be a canonical root HTTPS URL.");
  }

  return value;
}

export function requireOpaqueWorkloadSubject(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    value.trim() !== value ||
    [...value].some((character) => character.codePointAt(0)! > 0x7f)
  ) {
    throw new Error(
      "Workload identity binding subject must be 1-255 ASCII characters without surrounding whitespace.",
    );
  }

  return value;
}

export function buildWorkloadFederationMetadata(issuerValue: unknown): WorkloadFederationMetadata {
  const issuer = requireCanonicalRootHttpsIssuer(issuerValue);

  return {
    issuer,
    jwks_uri: `${issuer}${workloadIdentityJwksPath}`,
    response_types_supported: ["id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [workloadIdentityAlgorithm],
    claims_supported: workloadIdentityClaims,
  };
}

export async function parseAndValidatePublicJwkSet(value: unknown): Promise<PublicJwkSet> {
  if (typeof value !== "string") {
    throw new Error("PUBLIC_JWK_SET must be a JSON string.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PUBLIC_JWK_SET must be valid JSON.");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed["keys"]) || parsed["keys"].length === 0) {
    throw new Error("PUBLIC_JWK_SET must contain at least one public JWK.");
  }

  const keyIds = new Set<string>();
  const keys: PublicRsaJwk[] = [];
  for (const key of parsed["keys"]) {
    const publicKey = await validatePublicRsaJwk(key);
    if (keyIds.has(publicKey.kid)) {
      throw new Error("PUBLIC_JWK_SET must not contain duplicate kid values.");
    }
    keyIds.add(publicKey.kid);
    keys.push(publicKey);
  }

  // The public response is deliberately a JWK Set, not a pass-through for
  // configuration-only root members. Per-key public extensions remain intact.
  return { keys };
}

async function validatePublicRsaJwk(value: unknown): Promise<PublicRsaJwk> {
  if (!isRecord(value)) {
    throw new Error("PUBLIC_JWK_SET keys must be objects.");
  }
  if ([...privateOrSymmetricJwkParameters].some((parameter) => parameter in value)) {
    throw new Error("PUBLIC_JWK_SET must not contain private or symmetric key material.");
  }
  if (value["kty"] !== "RSA") {
    throw new Error("PUBLIC_JWK_SET keys must be RSA public keys.");
  }
  if (
    typeof value["n"] !== "string" ||
    value["n"].length === 0 ||
    typeof value["e"] !== "string" ||
    value["e"].length === 0
  ) {
    throw new Error("PUBLIC_JWK_SET RSA keys must contain non-empty n and e parameters.");
  }
  if (value["alg"] !== workloadIdentityAlgorithm || value["use"] !== "sig") {
    throw new Error("PUBLIC_JWK_SET keys must declare alg RS256 and use sig.");
  }
  if (typeof value["kid"] !== "string" || value["kid"].length === 0) {
    throw new Error("PUBLIC_JWK_SET keys must contain a non-empty kid.");
  }

  const publicKey = value as PublicRsaJwk;
  let verificationKey: CryptoKey;
  try {
    const importedKey = await importJWK(publicKey as JWK, workloadIdentityAlgorithm);
    if (importedKey instanceof Uint8Array || !importedKey.usages.includes("verify")) {
      throw new Error("The imported key is not usable for verification.");
    }
    verificationKey = importedKey;
  } catch {
    throw new Error("PUBLIC_JWK_SET contains an unusable RS256 verification key.");
  }
  requireMinimumRsaModulusLength(verificationKey, "PUBLIC_JWK_SET RSA key");

  let thumbprint: string;
  try {
    thumbprint = await calculateJwkThumbprint(publicKey as JWK);
  } catch {
    throw new Error("PUBLIC_JWK_SET contains an unusable RS256 verification key.");
  }
  if (publicKey.kid !== thumbprint) {
    throw new Error("PUBLIC_JWK_SET key kid must equal its RFC 7638 thumbprint.");
  }

  return publicKey;
}

export function requireMinimumRsaModulusLength(key: CryptoKey, description: string): void {
  const algorithm = key.algorithm;
  if (
    !("modulusLength" in algorithm) ||
    typeof algorithm.modulusLength !== "number" ||
    algorithm.modulusLength < workloadIdentityMinimumRsaModulusLength
  ) {
    throw new Error(
      `${description} must use an RSA modulus of at least ${workloadIdentityMinimumRsaModulusLength} bits.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
