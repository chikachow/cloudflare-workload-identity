import { calculateJwkThumbprint, importPKCS8, SignJWT } from "jose";
import {
  requireCanonicalRootHttpsIssuer,
  requireMinimumRsaModulusLength,
  requireOpaqueWorkloadSubject,
  workloadIdentityAlgorithm,
  workloadIdentityTokenLifetimeSeconds,
  workloadIdentityTokenType,
} from "workload-identity-profile";

export const tokenLifetimeSeconds = workloadIdentityTokenLifetimeSeconds;

export type SigningPrivateKeySource = string | SecretsStoreSecret;

export type WorkloadIdentityIssuerEnv = Omit<
  WorkloadIdentityIssuerBindings,
  "SIGNING_PRIVATE_KEY"
> & {
  readonly SIGNING_PRIVATE_KEY: SigningPrivateKeySource;
};

export interface WorkloadIdentityIssuerProps {
  readonly subject: string;
  readonly allowedAudiences: readonly string[];
}

export interface IssuedToken {
  readonly token: string;
}

export class AudienceNotAllowedError extends RangeError {
  public constructor() {
    super("The requested audience is not allowed.");
    this.name = "AudienceNotAllowedError";
  }
}

export async function issueWorkloadIdentityToken(
  audience: unknown,
  env: WorkloadIdentityIssuerEnv,
  props: WorkloadIdentityIssuerProps,
  now = Math.floor(Date.now() / 1_000),
): Promise<IssuedToken> {
  const issuer = requireCanonicalRootHttpsIssuer(env.ISSUER);
  const workload = authorizeWorkload(audience, props);
  const { privateKey, kid } = await loadSigningKey(env.SIGNING_PRIVATE_KEY);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: workloadIdentityAlgorithm, kid, typ: workloadIdentityTokenType })
    .setIssuer(issuer)
    .setSubject(workload.subject)
    .setAudience(workload.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + tokenLifetimeSeconds)
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  return { token };
}

function authorizeWorkload(
  audience: unknown,
  value: unknown,
): { subject: string; audience: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Workload identity binding properties are required.");
  }

  const { allowedAudiences, subject } = value as Record<string, unknown>;
  const validatedSubject = requireOpaqueWorkloadSubject(subject);
  if (
    !Array.isArray(allowedAudiences) ||
    allowedAudiences.length === 0 ||
    allowedAudiences.some(
      (allowedAudience) =>
        typeof allowedAudience !== "string" || allowedAudience.trim().length === 0,
    )
  ) {
    throw new Error("Workload identity binding allowedAudiences must contain non-empty strings.");
  }

  if (typeof audience !== "string" || !allowedAudiences.includes(audience)) {
    throw new AudienceNotAllowedError();
  }

  return { audience, subject: validatedSubject };
}

async function loadSigningKey(
  binding: SigningPrivateKeySource,
): Promise<{ privateKey: CryptoKey; kid: string }> {
  const value = typeof binding === "string" ? binding : await binding.get();
  if (value.trim().length === 0) {
    throw new Error("SIGNING_PRIVATE_KEY is empty.");
  }
  // Exportability is needed only to derive the public-key thumbprint used as kid.
  const privateKey = await importPKCS8(value, workloadIdentityAlgorithm, { extractable: true });
  requireMinimumRsaModulusLength(privateKey, "SIGNING_PRIVATE_KEY");
  const kid = await calculateJwkThumbprint(privateKey);
  return { privateKey, kid };
}
