import { calculateJwkThumbprint, exportJWK, importPKCS8, SignJWT } from "jose";
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
  const { allowedAudiences, subject } = requireProps(props);

  if (
    typeof audience !== "string" ||
    audience.trim().length === 0 ||
    !allowedAudiences.includes(audience)
  ) {
    throw new AudienceNotAllowedError();
  }

  const privateKey = await importPKCS8(
    await resolveSigningPrivateKey(env.SIGNING_PRIVATE_KEY),
    "RS256",
    {
      extractable: true,
    },
  );
  requireMinimumRsaModulusLength(privateKey, "SIGNING_PRIVATE_KEY");
  const kid = await calculateJwkThumbprint(await exportJWK(privateKey));
  const expiresAt = now + tokenLifetimeSeconds;

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: workloadIdentityAlgorithm, kid, typ: workloadIdentityTokenType })
    .setIssuer(issuer)
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  return { token };
}

function requireProps(value: unknown): WorkloadIdentityIssuerProps {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Workload identity binding properties are required.");
  }

  const { allowedAudiences, subject } = value as Partial<WorkloadIdentityIssuerProps>;
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

  return { allowedAudiences, subject: validatedSubject };
}

async function resolveSigningPrivateKey(binding: SigningPrivateKeySource): Promise<string> {
  const value = typeof binding === "string" ? binding : await binding.get();
  if (value.trim().length === 0) {
    throw new Error("SIGNING_PRIVATE_KEY is empty.");
  }
  return value;
}
