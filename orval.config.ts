import { defineConfig } from "orval";

export default defineConfig({
  booking: {
    input: {
      target: "./openapi.yaml",
    },
    output: {
      target: "./web/src/api/sdk.ts",
      mode: "single",
      client: "fetch",
      baseUrl: "/api",
      override: {
        requestOptions: false,
      },
    },
  },
});
