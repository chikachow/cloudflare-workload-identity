import { describe, expect, it } from "vitest";

import { handleDiscoveryRequest } from "../workers/workload-identity-discovery/src/index.ts";

const issuer = "https://issuer.example";

describe("workload identity discovery configuration", () => {
  for (const [name, publicJwkSet, message] of [
    [
      "private JWK material",
      { keys: [{ d: "private", kty: "RSA" }] },
      "private or symmetric key material",
    ],
    ["an empty JWK Set", { keys: [] }, "at least one public JWK"],
  ] as const) {
    it(`refuses to publish ${name}`, async () => {
      await expect(
        handleDiscoveryRequest(new Request(`${issuer}/jwks`), {
          ISSUER: issuer,
          PUBLIC_JWK_SET: publicJwkSet,
        }),
      ).rejects.toThrow(message);
    });
  }
});
