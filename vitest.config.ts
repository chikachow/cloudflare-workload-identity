import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    coverage: {
      exclude: ["workers/**/*.generated.d.ts"],
      include: ["packages/**/src/**/*.ts", "workers/**/src/**/*.ts"],
      provider: "istanbul",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/unit",
    },
    detectAsyncLeaks: true,
    exclude: ["**/node_modules/**", "test/workers/**"],
  },
});
