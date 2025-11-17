import { type ApiConfig, HttpMethod } from "@superglue/client";
import { describe, expect, it } from "vitest";
import { runStepConfig } from "../tools/tool-steps/tool-step-strategies/api/api.legacy.js";
import { MockServerFactory } from "./test-utils.js";

describe("Rate Limit Integration Test with real server", () => {
  const mockServer = new MockServerFactory();
  let requestCount = 0;

  // Mock server that returns 429 responses
  mockServer.addGetRoute("/api/test-rate-limit", (req, res) => {
    requestCount++;
    if (requestCount === 1) {
      res.setHeader("Retry-After", "1");
      res.status(429).json({ error: "Rate limit exceeded" });
    } else {
      res.status(200).json({ success: true, data: "Rate limit test passed" });
    }
  });

  mockServer.addGetRoute("/api/always-rate-limited", (req, res) => {
    res.setHeader("Retry-After", "61"); // 61 seconds is greater than the hardcoded 60s limit
    res.status(429).json({ error: "Rate limit exceeded" });
  });

  // Setup before/after hooks
  mockServer.setupHooks();

  it("should successfully retry after a 429 response", async () => {
    requestCount = 0;

    const config: ApiConfig = {
      id: "test-rate-limit-integration",
      urlHost: mockServer.getBaseUrl(),
      urlPath: "api/test-rate-limit",
      method: HttpMethod.GET,
      instruction: "Test rate limit integration",
      // maxRateLimitWaitSec: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await runStepConfig({config: config, payload: {}, credentials: {}, options: {}});
    // Should have made 2 requests (one 429, one 200)
    expect(requestCount).toBe(2);
    expect(result.data).toEqual({ success: true, data: "Rate limit test passed" });
  });

  it("should fail when rate limit wait time exceeds maximum", async () => {
    // Modify the server to return a retry time that exceeds the hardcoded 60s limit
    const config: ApiConfig = {
      id: "test-always-rate-limited",
      urlHost: mockServer.getBaseUrl(),
      urlPath: "api/always-rate-limited",
      method: HttpMethod.GET,
      instruction: "Test always rate limited",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Should throw an error about rate limit exceeded
    await expect(runStepConfig({config: config, payload: {}, credentials: {}, options: {}})).rejects.toThrow(/Rate limit exceeded/);
  });
});
