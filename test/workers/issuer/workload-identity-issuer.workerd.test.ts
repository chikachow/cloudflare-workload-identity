import { exports } from "cloudflare:workers";
import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { signingPublicJwk } from "../../support/signing-key.ts";

const issuer = "https://issuer.example";
const audience = "https://api.github.com";
const subject = "repo:chikachow/example:ref:refs/heads/main";

describe("WorkloadIdentityIssuer workerd RPC entrypoint", () => {
  it("preserves generic URI identifiers across RPC and signing", async () => {
    const exactAudience = "x://host:999999/a/../b?c=%2f#d";
    const exactSubject = "x://[v1.name]/";
    const worker = exports.WorkloadIdentityIssuer({
      props: { allowedAudiences: [exactAudience], subject: exactSubject },
    });
    using issued = await worker.issueToken(exactAudience);
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      issuer,
      audience: exactAudience,
      subject: exactSubject,
    });
    expect(verified.payload.aud).toBe(exactAudience);
    expect(verified.payload.sub).toBe(exactSubject);
  });

  it.each([
    { allowedAudiences: [audience], subject: "x:a b" },
    { allowedAudiences: [audience, "x:%GG"], subject },
  ])("rejects malformed URI binding properties %j", async (props) => {
    const worker = exports.WorkloadIdentityIssuer({ props });
    let failure: unknown;
    try {
      using call = worker.issueToken(audience);
      await call;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("StringOrURI");
  });

  it("crosses RPC props and runtime signing configuration", async () => {
    const worker = exports.WorkloadIdentityIssuer({
      props: { allowedAudiences: [audience], subject },
    });
    using issued = await worker.issueToken(audience);
    const verified = await jwtVerify(issued.token, signingPublicJwk, {
      algorithms: ["RS256"],
      audience,
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
      iss: issuer,
      sub: subject,
      iat: expect.any(Number),
      exp: expect.any(Number),
      jti: expect.any(String),
    });
    expect(Number.isInteger(verified.payload.iat)).toBe(true);
    expect(Number.isInteger(verified.payload.exp)).toBe(true);
    expect(verified.payload.exp! - verified.payload.iat!).toBe(300);
  });

  it.each(["https://example.invalid", "", null, 42, [audience]].map((value) => [value]))(
    "transports AudienceNotAllowedError for %j",
    async (requestedAudience) => {
      const worker = exports.WorkloadIdentityIssuer({
        props: { allowedAudiences: [audience], subject },
      });
      let denial: unknown;
      try {
        using call = worker.issueToken(requestedAudience as never);
        await call;
      } catch (error) {
        denial = error;
      }
      expect(denial).toMatchObject({
        message: "The requested audience is not allowed.",
        name: "AudienceNotAllowedError",
      });
    },
  );
});
