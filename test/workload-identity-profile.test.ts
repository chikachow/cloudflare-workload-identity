import { calculateJwkThumbprint, exportJWK } from "jose";
import { describe, expect, it } from "vitest";

import {
  buildWorkloadFederationMetadata,
  parseAndValidatePublicJwkSet,
  requireCanonicalRootHttpsIssuer,
  requireOpaqueWorkloadSubject,
} from "../packages/workload-identity-profile/src/index.ts";
import { signingPublicJwk } from "./support/signing-key.ts";

const issuer = "https://issuer.example";

describe("workload identity profile", () => {
  it("constructs compatibility metadata", () => {
    expect(buildWorkloadFederationMetadata(issuer)).toEqual({
      claims_supported: ["iss", "sub", "aud", "iat", "exp", "jti"],
      id_token_signing_alg_values_supported: ["RS256"],
      issuer,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
    });
  });

  for (const [name, invalidIssuer] of [
    ["trailing slash", `${issuer}/`],
    ["path", `${issuer}/path`],
    ["leading whitespace", ` ${issuer}`],
    ["non-HTTPS scheme", "http://issuer.example"],
  ] as const) {
    it(`rejects an issuer with ${name}`, () => {
      expect(() => requireCanonicalRootHttpsIssuer(invalidIssuer)).toThrow(
        "canonical root HTTPS URL",
      );
    });
  }

  it("accepts a canonical root HTTPS issuer", () => {
    expect(requireCanonicalRootHttpsIssuer(issuer)).toBe(issuer);
  });

  it("accepts a canonical workload subject", () => {
    expect(requireOpaqueWorkloadSubject("repo:chikachow/example:ref:refs/heads/main")).toBe(
      "repo:chikachow/example:ref:refs/heads/main",
    );
  });

  for (const [name, invalidSubject] of [
    ["empty", ""],
    ["leading whitespace", " subject"],
    ["trailing whitespace", "subject "],
    ["non-ASCII characters", "subject-😀"],
    ["more than 255 characters", "a".repeat(256)],
  ] as const) {
    it(`rejects a workload subject with ${name}`, () => {
      expect(() => requireOpaqueWorkloadSubject(invalidSubject)).toThrow("1-255 ASCII characters");
    });
  }

  it("proves the literal signing kid is its RFC 7638 thumbprint", async () => {
    expect(await calculateJwkThumbprint(signingPublicJwk)).toBe(signingPublicJwk.kid);
  });

  it("retains public per-key extensions and removes root configuration-only members", async () => {
    const key = { ...signingPublicJwk, x_rotation: "next" };
    await expect(
      parseAndValidatePublicJwkSet(
        JSON.stringify({ cache_hint: "configuration-only", keys: [key] }),
      ),
    ).resolves.toEqual({ keys: [key] });
  });

  for (const [name, value, message] of [
    ["malformed structure", JSON.stringify({ keys: [{}] }), "RSA public keys"],
    [
      "private material",
      JSON.stringify({ keys: [{ ...signingPublicJwk, d: "private" }] }),
      "private or symmetric key material",
    ],
    [
      "wrong algorithm or use",
      JSON.stringify({ keys: [{ ...signingPublicJwk, alg: "RS512", use: "enc" }] }),
      "alg RS256 and use sig",
    ],
    [
      "unusable key",
      JSON.stringify({ keys: [{ ...signingPublicJwk, key_ops: [] }] }),
      "unusable RS256 verification key",
    ],
    [
      "wrong thumbprint",
      JSON.stringify({ keys: [{ ...signingPublicJwk, kid: "not-a-thumbprint" }] }),
      "RFC 7638 thumbprint",
    ],
    [
      "duplicate kid",
      JSON.stringify({ keys: [signingPublicJwk, signingPublicJwk] }),
      "duplicate kid",
    ],
  ] as const) {
    it(`rejects JWK Sets with ${name}`, async () => {
      await expect(parseAndValidatePublicJwkSet(value)).rejects.toThrow(message);
    });
  }

  it("rejects RSA public keys below the shared 2048-bit minimum", async () => {
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
    const publicJwk = await exportJWK(keyPair.publicKey);
    const key = {
      ...publicJwk,
      alg: "RS256",
      kid: await calculateJwkThumbprint(publicJwk),
      use: "sig",
    };
    await expect(parseAndValidatePublicJwkSet(JSON.stringify({ keys: [key] }))).rejects.toThrow(
      "at least 2048 bits",
    );
  });
});
