import {
  buildWorkloadFederationMetadata,
  validatePublicJwkSet,
  workloadIdentityDiscoveryPath,
  workloadIdentityJwksPath,
} from "workload-identity-profile";

export type WorkloadIdentityDiscoveryEnv = WorkloadIdentityDiscoveryBindings;

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
  fetch(request, env: WorkloadIdentityDiscoveryEnv): Promise<Response> {
    return handleDiscoveryRequest(request, env);
  },
} satisfies ExportedHandler<WorkloadIdentityDiscoveryEnv>;
