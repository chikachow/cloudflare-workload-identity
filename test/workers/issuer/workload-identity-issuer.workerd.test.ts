import { exports } from "cloudflare:workers";
import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { signingPublicJwk } from "../../support/signing-key.ts";

const issuer = "https://issuer.example";
const audience = "https://api.github.com";
const subject = "repo:chikachow/example:ref:refs/heads/main";

describe("WorkloadIdentityIssuer workerd RPC entrypoint", () => {
  it("crosses RPC props and runtime signing configuration", async () => {
    const worker = exports.WorkloadIdentityIssuer({
      props: { allowedAudiences: [audience], subject },
    });
    const issued = await worker.issueToken(audience);
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience,
      issuer,
    });

    expect(issued).toEqual({ token: expect.any(String) });
    expect(verified.protectedHeader).toMatchObject({ alg: "RS256", kid: signingPublicJwk.kid });
    expect(verified.payload).toMatchObject({ aud: audience, iss: issuer, sub: subject });
  });

  it("transports AudienceNotAllowedError", async () => {
    const worker = exports.WorkloadIdentityIssuer({
      props: { allowedAudiences: [audience], subject },
    });
    let denial: unknown;
    try {
      await worker.issueToken("https://example.invalid");
    } catch (error) {
      denial = error;
    }
    expect(denial).toMatchObject({
      message: "The requested audience is not allowed.",
      name: "AudienceNotAllowedError",
    });
  });
});
