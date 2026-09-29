// Only Worker entrypoints belong in the deployed module. Keep the package's
// ordinary functions, types and constants available through src/index.ts.
export { default, WorkloadIdentityIssuer } from "./index.ts";
