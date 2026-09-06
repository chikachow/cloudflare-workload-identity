import { exportPKCS8, jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";

import {
  AudienceNotAllowedError,
  issueWorkloadIdentityToken,
} from "../workers/workload-identity-issuer/src/issuer.ts";
import { signingPrivateKeyPem, signingPublicJwk } from "./support/signing-key.ts";

const audience = "https://api.github.com";
const issuer = "https://issuer.example";
const subject = "repo:chikachow/example:ref:refs/heads/main";
const validEnv = { ISSUER: issuer, SIGNING_PRIVATE_KEY: signingPrivateKeyPem };
const validProps = { allowedAudiences: [audience], subject };

describe("WorkloadIdentityIssuer RPC issueToken", () => {
  it.each([
    undefined,
    null,
    42,
    [audience],
    "",
    " ",
    "https://example.invalid",
    `${audience}/`,
    audience.toUpperCase(),
    ` ${audience}`,
    `${audience} `,
  ])("rejects audience %j before reading the signing secret", async (requestedAudience) => {
    const get = vi.fn(async () => signingPrivateKeyPem);
    const issued = issueWorkloadIdentityToken(
      requestedAudience,
      { ...validEnv, SIGNING_PRIVATE_KEY: { get } },
      validProps,
    );

    await expect(issued).rejects.toBeInstanceOf(AudienceNotAllowedError);
    await expect(issued).rejects.toMatchObject({
      name: "AudienceNotAllowedError",
      message: "The requested audience is not allowed.",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("issues an RS256 token with exactly the closed claim contract", async () => {
    const now = 1_775_000_000;
    const issued = await issueWorkloadIdentityToken(audience, validEnv, validProps, now);
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience,
      currentDate: new Date(now * 1_000),
      issuer,
    });

    expect(issued).toEqual({ token: expect.any(String) });
    expect(verified.protectedHeader).toEqual({
      alg: "RS256",
      kid: signingPublicJwk.kid,
      typ: "JWT",
    });
    expect(verified.payload).toEqual({
      aud: audience,
      exp: now + 300,
      iat: now,
      iss: issuer,
      jti: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
      ),
      sub: subject,
    });
  });

  it("resolves a Secrets Store binding without exposing it to callers", async () => {
    const issued = await issueWorkloadIdentityToken(
      audience,
      { ISSUER: issuer, SIGNING_PRIVATE_KEY: { get: async () => signingPrivateKeyPem } },
      validProps,
    );
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience,
      issuer,
    });
    expect(verified.payload.sub).toBe(subject);
  });

  it("preserves the exact bound audience and subject", async () => {
    const exactAudience = ` ${audience} `;
    const boundSubject = "another-workload";
    const issued = await issueWorkloadIdentityToken(exactAudience, validEnv, {
      allowedAudiences: [audience, exactAudience],
      subject: boundSubject,
    });
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience: exactAudience,
      issuer,
    });
    expect(verified.payload.sub).toBe(boundSubject);
  });

  for (const [name, props, message] of [
    ["absent props", undefined, "binding properties are required"],
    ["null props", null, "binding properties are required"],
    ["array props", [], "binding properties are required"],
    [
      "empty allowedAudiences",
      { allowedAudiences: [], subject },
      "allowedAudiences must contain non-empty strings",
    ],
    [
      "blank allowedAudiences entry",
      { allowedAudiences: [""], subject },
      "allowedAudiences must contain non-empty strings",
    ],
    [
      "invalid entry after an allowed audience",
      { allowedAudiences: [audience, 42], subject },
      "allowedAudiences must contain non-empty strings",
    ],
    ["absent subject", { allowedAudiences: [audience] }, "binding subject"],
    [
      "invalid subject",
      { allowedAudiences: [audience], subject: " subject" },
      "1-255 ASCII characters",
    ],
  ] as const) {
    it(`fails closed for ${name}`, async () => {
      const get = vi.fn(async () => signingPrivateKeyPem);
      const env = { ...validEnv, SIGNING_PRIVATE_KEY: { get } };
      await expect(
        // Exercise malformed runtime bindings despite the caller-facing type.
        issueWorkloadIdentityToken(audience, env, props as never),
      ).rejects.toThrow(message);
      expect(get).not.toHaveBeenCalled();
    });
  }

  it("fails closed for a noncanonical issuer", async () => {
    await expect(
      issueWorkloadIdentityToken(audience, { ...validEnv, ISSUER: `${issuer}/` }, validProps),
    ).rejects.toThrow("canonical root HTTPS URL");
  });

  it("fails closed for an empty signing secret", async () => {
    await expect(
      issueWorkloadIdentityToken(audience, { ...validEnv, SIGNING_PRIVATE_KEY: "" }, validProps),
    ).rejects.toThrow("SIGNING_PRIVATE_KEY is empty");
  });

  it("rejects a private signer below the shared 2048-bit minimum", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 1024,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    await expect(
      issueWorkloadIdentityToken(
        audience,
        { ...validEnv, SIGNING_PRIVATE_KEY: await exportPKCS8(keyPair.privateKey) },
        validProps,
      ),
    ).rejects.toThrow("at least 2048 bits");
  });
});
