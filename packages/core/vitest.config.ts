import { config } from "dotenv";
import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 12000000, // 120 minutes for integration tests
    hookTimeout: 180000, // 3 minutes for setup/teardown hooks
    // Keep vitest's default excludes (node_modules, dist, etc.) so stale
    // compiled tests under dist/ are never discovered, then add our own.
    // Defining excludes here (instead of passing --exclude on the CLI, which
    // replaces the defaults) ensures dist/** stays excluded.
    exclude: [
      ...configDefaults.exclude,
      "**/eval/integration-testing/integration.test.ts",
      "**/*integration.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "test/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
  },
  envDir: "../../",
  build: {
    sourcemap: true,
  },
});
