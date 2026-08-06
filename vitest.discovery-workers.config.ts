import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./workers/workload-identity-discovery/wrangler.jsonc" },
    }),
  ],
  test: {
    allowOnly: false,
    coverage: {
      exclude: ["workers/**/*.generated.d.ts"],
      include: ["packages/**/src/**/*.ts", "workers/**/src/**/*.ts"],
      provider: "istanbul",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/discovery-workerd",
    },
    detectAsyncLeaks: true,
    include: ["test/workers/discovery/**/*.test.ts"],
    name: "discovery-workerd",
  },
});
