import { defineConfig } from "orval";

export default defineConfig({
  superglue: {
    input: "./openapi.yaml",
    output: {
      mode: "single",
      target: "./src/generated/client.ts",
      schemas: "./src/generated/models",
      client: "fetch",
      clean: true,
      prettier: true,
      namingConvention: "camelCase",
      override: {
        mutator: {
          path: "./src/fetcher.ts",
          name: "customFetch",
        },
      },
    },
  },
});
