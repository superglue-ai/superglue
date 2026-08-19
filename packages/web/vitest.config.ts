import path from "path";
import { defineConfig } from "vitest/config";

// Node environment is enough: the important mention logic lives in pure functions
// (src/lib/agent/mentions.ts, mention-context.ts) that never touch the DOM.
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" path mapping from tsconfig.json.
      "@": path.resolve(__dirname),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
