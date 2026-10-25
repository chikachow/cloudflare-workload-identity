import { describe, expect, it } from "vitest";

import { handleDiscoveryRequest } from "../workers/workload-identity-discovery/src/index.ts";
import { signingPublicJwk } from "./support/signing-key.ts";

const issuer = "https://issuer.example";

describe("workload identity discovery configuration", () => {
  it.each(["/.well-known/openid-configuration", "/jwks"])(
    "revalidates configuration on every %s request and recovers after repair",
    async (path) => {
      const key = { ...signingPublicJwk, kid: signingPublicJwk.kid as string };
      const env = { ISSUER: issuer, PUBLIC_JWK_SET: { keys: [key] } };
      const request = new Request(`${issuer}${path}`);
      const initial = await handleDiscoveryRequest(request, env);
      expect(initial.status).toBe(200);
      await initial.json();
      key.kid = "not-a-thumbprint";
      await expect(handleDiscoveryRequest(request, env)).rejects.toThrow("RFC 7638 thumbprint");
      key.kid = signingPublicJwk.kid;
      const repaired = await handleDiscoveryRequest(request, env);
      expect(repaired.status).toBe(200);
      await repaired.json();
    },
  );

  for (const [name, publicJwkSet, message] of [
    [
      "private JWK material",
      { keys: [{ d: "private", kty: "RSA" }] },
      "private or symmetric key material",
    ],
    ["an empty JWK Set", { keys: [] }, "at least one public JWK"],
  ] as const) {
    it.each(["/.well-known/openid-configuration", "/jwks"])(
      `refuses to serve %s with ${name}`,
      async (path) => {
        await expect(
          handleDiscoveryRequest(new Request(`${issuer}${path}`), {
            ISSUER: issuer,
            PUBLIC_JWK_SET: publicJwkSet,
          }),
        ).rejects.toThrow(message);
      },
    );
  }
});
