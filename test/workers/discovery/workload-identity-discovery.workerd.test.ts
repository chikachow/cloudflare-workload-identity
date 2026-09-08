import { exports } from "cloudflare:workers";
import { calculateJwkThumbprint } from "jose";
import { describe, expect, it } from "vitest";

import { handleDiscoveryRequest } from "../../../workers/workload-identity-discovery/src/index.ts";
import { signingPublicJwk, signingPublicJwkSet } from "../../support/signing-key.ts";

const issuer = "https://issuer.example";

describe("workload identity discovery workerd entrypoint", () => {
  it("serves the exact discovery document with five-minute public caching", async () => {
    const response = await exports.default.fetch(`${issuer}/.well-known/openid-configuration`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      claims_supported: ["iss", "sub", "aud", "iat", "exp", "jti"],
      id_token_signing_alg_values_supported: ["RS256"],
      issuer,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
    });
  });

  it("serves the exact configured JWK Set with JSON and cache headers", async () => {
    const response = await exports.default.fetch(`${issuer}/jwks`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual(signingPublicJwkSet);
  });

  it.each(["/.well-known/openid-configuration", "/jwks"])(
    "refuses to serve %s with a noncanonical RSA integer in workerd",
    async (path) => {
      const publicJwk = { ...signingPublicJwk, n: `${signingPublicJwk.n}==` };
      const key = { ...publicJwk, kid: await calculateJwkThumbprint(publicJwk) };

      await expect(
        handleDiscoveryRequest(new Request(`${issuer}${path}`), {
          ISSUER: issuer,
          PUBLIC_JWK_SET: { keys: [key] },
        }),
      ).rejects.toThrow("canonical Base64urlUInt");
    },
  );

  it("rejects unsupported methods", async () => {
    const response = await exports.default.fetch(`${issuer}/jwks`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    await expect(response.text()).resolves.toBe("Method Not Allowed");
  });

  it("returns not found for the removed health path", async () => {
    const response = await exports.default.fetch(`${issuer}/healthz`);
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Not Found");
  });
});
