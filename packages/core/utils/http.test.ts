import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAxios, ApiCallError } from "./http.js";

// We need to mock axios at the module level
vi.mock("axios", () => {
  const mockAxios = vi.fn();
  return { default: mockAxios };
});

// Get the mocked axios
import axios from "axios";
const mockAxios = vi.mocked(axios);

describe("callAxios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("return type soundness", () => {
    it("returns CallAxiosResult on successful response", async () => {
      mockAxios.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("ok"),
        headers: {},
        statusText: "OK",
        config: {},
      });

      const result = await callAxios(
        { method: "GET", url: "https://example.com" },
        { timeout: 5000 },
      );

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.response.status).toBe(200);
      expect(result.retriesAttempted).toBe(0);
    });

    it("returns CallAxiosResult on non-success response after exhausting retries", async () => {
      // Return 500 multiple times — should exhaust retries and return (not undefined)
      mockAxios.mockResolvedValue({
        status: 500,
        data: Buffer.from("error"),
        headers: {},
        statusText: "Internal Server Error",
        config: {},
      });

      const result = await callAxios(
        { method: "GET", url: "https://example.com" },
        { timeout: 5000, retries: 0 },
      );

      // Must be a proper CallAxiosResult, not undefined
      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.response.status).toBe(500);
    });

    it("throws ApiCallError on network errors after exhausting retries", async () => {
      mockAxios.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        callAxios({ method: "GET", url: "https://example.com" }, { timeout: 5000, retries: 0 }),
      ).rejects.toThrow(ApiCallError);
    });

    it("result is destructurable without TypeError", async () => {
      mockAxios.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("{}"),
        headers: {},
        statusText: "OK",
        config: {},
      });

      const result = await callAxios(
        { method: "POST", url: "https://example.com/webhook" },
        { timeout: 5000 },
      );

      // This pattern is used by webhook.ts — would crash with
      // "Cannot destructure property 'response' of undefined"
      // if callAxios ever returned undefined
      const { response, retriesAttempted } = result;
      expect(response.status).toBe(200);
      expect(retriesAttempted).toBe(0);
    });
  });

  describe("retry behavior", () => {
    it("retries on network error and succeeds", async () => {
      mockAxios.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("ok"),
        headers: {},
        statusText: "OK",
        config: {},
      });

      const result = await callAxios(
        { method: "GET", url: "https://example.com" },
        { timeout: 5000, retries: 1, retryDelay: 10 },
      );

      expect(result.response.status).toBe(200);
      expect(result.retriesAttempted).toBe(1);
      expect(mockAxios).toHaveBeenCalledTimes(2);
    });

    it("returns 429 response when rate limit wait exceeds maximum", async () => {
      mockAxios.mockResolvedValue({
        status: 429,
        data: Buffer.from("rate limited"),
        headers: { "retry-after": "999999" }, // Exceeds MAX_RATE_LIMIT_WAIT_MS
        statusText: "Too Many Requests",
        config: {},
      });

      const result = await callAxios(
        { method: "GET", url: "https://example.com" },
        { timeout: 5000, retries: 0 },
      );

      expect(result).toBeDefined();
      expect(result.response.status).toBe(429);
    });
  });
});
