import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "workload-identity-discovery-example",
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
      PUBLIC_JWK_SET: bindings.json({
        keys: [
          {
            kty: "RSA",
            n: "r_FeDGYXOwHdy_A3i5rngP3Dg_9tcNqpVbdHrqHrtK8YA1ySRADYaFHMsFtKjLE5qDQcSVKJjHKZ38YXlaGGiz2XmIWPTk0oxToCFtXPibqg6KDgQhEPL4nEa9f1aVvpY-MstpwVx-45ZQnRis4I3__Oopf_Oe39hQbZqD37odAmuiNlWLgLbXAGJS8iinNBbv1NpPl_ECUvJ12AU3D1fMbbfhOIDf8xoHmmeNig0CwiXtkKYgO0ORPyeaj0sXnniiVD7piYGgkq1ESGF2BEVKNFdfRTBvSWJyBBAYd7zakVAo02QbJ7fXHiSfXmo_rhRB9to9hFXX0LWS_D9WdzUQ",
            e: "AQAB",
            alg: "RS256",
            kid: "rNUTLcAOYmwvUhobr_Q22V_hXkMnJQ_NuoBfMbGPilo",
            use: "sig",
          },
        ],
      }),
    },
  },
});
