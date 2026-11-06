import {
  buildWorkloadFederationMetadata,
  validatePublicJwkSet,
  workloadIdentityDiscoveryPath,
  workloadIdentityJwksPath,
} from "workload-identity-profile";

// Validate arbitrary JWK Set objects at the runtime boundary.
export type WorkloadIdentityDiscoveryEnv = Omit<Cloudflare.Env, "PUBLIC_JWK_SET"> & {
  PUBLIC_JWK_SET: object;
};

const publicJsonHeaders = {
  "cache-control": "public, max-age=300",
  "content-type": "application/json; charset=utf-8",
};

export async function handleDiscoveryRequest(
  request: Request,
  env: WorkloadIdentityDiscoveryEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { headers: { allow: "GET" }, status: 405 });
  }

  switch (new URL(request.url).pathname) {
    case workloadIdentityDiscoveryPath: {
      const metadata = buildWorkloadFederationMetadata(env.ISSUER);
      await validatePublicJwkSet(env.PUBLIC_JWK_SET);
      return Response.json(metadata, { headers: publicJsonHeaders });
    }
    case workloadIdentityJwksPath: {
      const jwkSet = await validatePublicJwkSet(env.PUBLIC_JWK_SET);
      return Response.json(jwkSet, { headers: publicJsonHeaders });
    }
    default:
      return new Response("Not Found", { status: 404 });
  }
}

export default {
  fetch: handleDiscoveryRequest,
} satisfies ExportedHandler<WorkloadIdentityDiscoveryEnv>;
