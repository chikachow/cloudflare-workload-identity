import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

import { signingPrivateKeyPem } from "./test/support/signing-key.ts";

export default defineConfig({
  plugins: [
    cloudflareTest({
      additionalExports: { WorkloadIdentityIssuer: "WorkerEntrypoint" },
      miniflare: {
        bindings: {
          // A real Secrets Store binding is deliberately not provisioned by this test.
          // The unit suite covers the asynchronous SecretsStoreSecret boundary.
          SIGNING_PRIVATE_KEY: signingPrivateKeyPem,
        },
      },
      remoteBindings: false,
      wrangler: { configPath: "./workers/workload-identity-issuer/wrangler.jsonc" },
    }),
  ],
  test: {
    allowOnly: false,
    coverage: {
      exclude: ["workers/**/*.generated.d.ts"],
      include: ["packages/**/src/**/*.ts", "workers/**/src/**/*.ts"],
      provider: "istanbul",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/issuer-workerd",
    },
    detectAsyncLeaks: true,
    include: ["test/workers/issuer/**/*.test.ts"],
    name: "issuer-workerd",
    testTimeout: 10_000,
  },
});
