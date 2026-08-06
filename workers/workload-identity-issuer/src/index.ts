import { WorkerEntrypoint } from "cloudflare:workers";
import {
  issueWorkloadIdentityToken,
  type IssuedToken,
  type WorkloadIdentityIssuerEnv,
  type WorkloadIdentityIssuerProps,
} from "./issuer.ts";

export * from "./issuer.ts";

export class WorkloadIdentityIssuer extends WorkerEntrypoint<
  WorkloadIdentityIssuerEnv,
  WorkloadIdentityIssuerProps
> {
  public issueToken(audience: string): Promise<IssuedToken> {
    return issueWorkloadIdentityToken(audience, this.env, this.ctx.props);
  }
}

export default WorkloadIdentityIssuer;
