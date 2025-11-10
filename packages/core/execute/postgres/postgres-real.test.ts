import { ApiConfig } from "@superglue/client";
import { describe, expect, it } from "vitest";
import { callPostgres } from "./postgres.js";

let shouldSkip = true;

describe("callPostgres", () => {
  const testConfig: ApiConfig = {
    id: "1",
    instruction: "test",
    urlHost: "postgres://user:password@localhost:5432",
    urlPath: "/testdb",
    body: JSON.stringify({
      query: "SELECT NOW()",
    }),
  };

  it.skipIf(shouldSkip)(
    "should connect and execute a simple query",
    async () => {
      const result = await callPostgres({
        endpoint: testConfig,
        payload: {},
        credentials: {},
        options: { timeout: 5000, retries: 1 },
      });

      expect(result).toBeDefined();
    },
  );
});
