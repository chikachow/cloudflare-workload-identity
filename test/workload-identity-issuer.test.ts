import { exportJWK, exportPKCS8, jwtVerify } from "jose";
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
    class SigningSecret {
      public constructor(private readonly value: string) {}
      public async get(): Promise<string> {
        return this.value;
      }
    }
    const issued = await issueWorkloadIdentityToken(
      audience,
      { ISSUER: issuer, SIGNING_PRIVATE_KEY: new SigningSecret(signingPrivateKeyPem) },
      validProps,
    );
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience,
      issuer,
    });
    expect(verified.payload.sub).toBe(subject);
  });

  it.each([300, 361])(
    "rejects issuance delayed by %i seconds and permits a fresh request",
    async (delay) => {
      const startedAt = 1_775_000_000;
      const completedAt = startedAt + delay;
      const secret = Promise.withResolvers<string>();
      const clock = vi.spyOn(Date, "now").mockReturnValue(startedAt * 1_000);
      try {
        const pending = issueWorkloadIdentityToken(
          audience,
          { ...validEnv, SIGNING_PRIVATE_KEY: { get: () => secret.promise } },
          validProps,
        );
        clock.mockReturnValue(completedAt * 1_000);
        secret.resolve(signingPrivateKeyPem);
        await expect(pending).rejects.toThrow(
          "Workload identity token issuance expired. Retry the request.",
        );
        const issued = await issueWorkloadIdentityToken(audience, validEnv, validProps);
        const verified = await jwtVerify(issued.token, signingPublicJwk, {
          algorithms: ["RS256"],
          audience,
          currentDate: new Date(completedAt * 1_000),
          issuer,
        });
        expect(verified.payload).toMatchObject({ iat: completedAt, exp: completedAt + 300 });
      } finally {
        clock.mockRestore();
      }
    },
  );

  it("keeps the request-start expiry bound when key retrieval consumes part of the lifetime", async () => {
    const startedAt = 1_775_000_000;
    const secret = Promise.withResolvers<string>();
    const clock = vi.spyOn(Date, "now").mockReturnValue(startedAt * 1_000);
    try {
      const pending = issueWorkloadIdentityToken(
        audience,
        { ...validEnv, SIGNING_PRIVATE_KEY: { get: () => secret.promise } },
        validProps,
      );
      clock.mockReturnValue((startedAt + 299) * 1_000);
      secret.resolve(signingPrivateKeyPem);
      const issued = await pending;
      const verified = await jwtVerify(issued.token, signingPublicJwk, {
        algorithms: ["RS256"],
        audience,
        currentDate: new Date((startedAt + 299) * 1_000),
        issuer,
      });
      expect(verified.payload).toMatchObject({ iat: startedAt, exp: startedAt + 300 });
    } finally {
      clock.mockRestore();
    }
  });

  it("rejects a token if signing consumes the remaining lifetime", async () => {
    const startedAt = 1_775_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(startedAt * 1_000);
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    const signing = vi.spyOn(crypto.subtle, "sign").mockImplementation(async (...args) => {
      const signature = await sign(...args);
      clock.mockReturnValue((startedAt + 300) * 1_000);
      return signature;
    });
    try {
      await expect(issueWorkloadIdentityToken(audience, validEnv, validProps)).rejects.toThrow(
        "Workload identity token issuance expired. Retry the request.",
      );
    } finally {
      signing.mockRestore();
      clock.mockRestore();
    }
  });

  it("preserves authorized claims while the signing key is loading", async () => {
    const secret = Promise.withResolvers<string>();
    const props = { allowedAudiences: [audience], subject };
    const env = { ISSUER: issuer, SIGNING_PRIVATE_KEY: { get: () => secret.promise } };
    const pending = issueWorkloadIdentityToken(audience, env, props);
    props.subject = "another-workload";
    props.allowedAudiences.splice(0, 1, "another-audience");
    env.ISSUER = "https://another-issuer.example";
    secret.resolve(signingPrivateKeyPem);

    const issued = await pending;
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience,
      issuer,
    });
    expect(verified.payload.sub).toBe(subject);
  });

  it("recovers on the next request and reads the current signing key each time", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const get = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Secret temporarily unavailable"))
      .mockResolvedValueOnce(signingPrivateKeyPem)
      .mockResolvedValueOnce(await exportPKCS8(keyPair.privateKey));
    const env = { ...validEnv, SIGNING_PRIVATE_KEY: { get } };
    await expect(issueWorkloadIdentityToken(audience, env, validProps)).rejects.toThrow(
      "Secret temporarily unavailable",
    );
    const first = await issueWorkloadIdentityToken(audience, env, validProps);
    const second = await issueWorkloadIdentityToken(audience, env, validProps);
    const options = { algorithms: ["RS256"], audience, issuer };
    await jwtVerify(first.token, signingPublicJwk, options);
    const verified = await jwtVerify(second.token, await exportJWK(keyPair.publicKey), options);
    expect(verified.protectedHeader.kid).not.toBe(signingPublicJwk.kid);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("denies an audience before accessing the signing binding itself", async () => {
    const readBinding = vi.fn(() => signingPrivateKeyPem);
    const env = {
      ISSUER: issuer,
      get SIGNING_PRIVATE_KEY() {
        return readBinding();
      },
    };
    await expect(issueWorkloadIdentityToken("denied", env, validProps)).rejects.toMatchObject({
      name: "AudienceNotAllowedError",
      message: "The requested audience is not allowed.",
    });
    expect(readBinding).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, [], {}, { get: "not-callable" }].map((value) => [value]))(
    "rejects malformed signing binding %j at its boundary",
    async (binding) => {
      await expect(
        issueWorkloadIdentityToken(
          audience,
          { ...validEnv, SIGNING_PRIVATE_KEY: binding as never },
          validProps,
        ),
      ).rejects.toThrow("SIGNING_PRIVATE_KEY must be a string or a Secrets Store binding.");
    },
  );

  it.each([undefined, null, 42, {}, []].map((value) => [value]))(
    "rejects a non-string Secrets Store value %j at its boundary",
    async (value) => {
      await expect(
        issueWorkloadIdentityToken(
          audience,
          { ...validEnv, SIGNING_PRIVATE_KEY: { get: async () => value as never } },
          validProps,
        ),
      ).rejects.toThrow("SIGNING_PRIVATE_KEY must resolve to a string.");
    },
  );

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
