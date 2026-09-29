import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "workload-identity-issuer-example",
    compatibilityDate: "2026-08-04",
    compatibilityFlags: ["no_nodejs_compat", "no_nodejs_compat_v2"],
    entrypoint,
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
    },
    env: {
      ISSUER: bindings.text<string>("https://issuer.example"),
      SIGNING_PRIVATE_KEY: bindings.secret(),
    },
  },
});
