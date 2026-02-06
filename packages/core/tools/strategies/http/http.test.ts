import { RequestStepConfig, HttpMethod, PaginationTypeValue } from "@superglue/shared";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server_defaults } from "../../../default.js";
import { convertBasicAuthToBase64 } from "../../../utils/helpers.js";
import * as httpModule from "./http.js";
import { HttpStepExecutionStrategy } from "./http.js";

vi.mock("axios");
vi.mock("openai");

const { callAxios, callHttp: runStepConfig } = httpModule;

describe("api utility functions", () => {
  describe("callAxios automatic retry", () => {
    it("retries quick failures up to maxRetries and returns metadata", async () => {
      (axios as any).mockReset();
      (axios as any)
        .mockImplementationOnce(async (_cfg: any) => ({
          status: 500,
          data: Buffer.from("X"),
          headers: {},
          config: {},
        }))
        .mockImplementationOnce(async (_cfg: any) => ({
          status: 502,
          data: Buffer.from("X"),
          headers: {},
          config: {},
        }))
        .mockImplementationOnce(async (_cfg: any) => ({
          status: 200,
          data: Buffer.from("OK"),
          headers: {},
          config: {},
        }));

      const { response, retriesAttempted, lastFailureStatus } = await callAxios(
        { method: "GET", url: "https://example.com" } as any,
        { retries: 2, retryDelay: 1 } as any,
      );
      expect(response.status).toBe(200);
      expect(retriesAttempted).toBe(2);
      expect(lastFailureStatus).toBe(502);
      (axios as any).mockReset();
    });

    it("returns immediately for 429 beyond max wait budget without throwing", async () => {
      (axios as any).mockReset();
      const tooLongSeconds = Math.ceil(server_defaults.HTTP.MAX_RATE_LIMIT_WAIT_MS / 1000) + 1;
      (axios as any).mockImplementation(async (_cfg: any) => ({
        status: 429,
        data: Buffer.from("rate"),
        headers: { "retry-after": String(tooLongSeconds) },
        config: {},
      }));

      const { response, retriesAttempted } = await callAxios(
        { method: "GET", url: "https://example.com" } as any,
        { retries: 1, retryDelay: 1 } as any,
      );
      expect(response.status).toBe(429);
      expect(retriesAttempted).toBe(0);
      (axios as any).mockReset();
    });
  });
});

describe("API Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("runStepConfig", () => {
    const testEndpoint: ApiConfig = {
      urlHost: "https://api.example.com",
      urlPath: "v1/test",
      method: HttpMethod.GET,
    };
    const testPayload = { query: "test" };
    const testCredentials = { api_key: "secret-key" };
    const testOptions = {};

    it("should make successful API call", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ result: "success" })),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: testPayload,
        credentials: testCredentials,
        options: testOptions,
        metadata: {},
      });

      expect(result).toEqual({ data: { result: "success" }, statusCode: 200, headers: {} });
    });

    it("should handle pagination", async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: "pageBased" as PaginationTypeValue,
          pageSize: "2",
        },
      } as ApiConfig;

      const mockResponses = [
        {
          status: 200,
          data: Buffer.from(JSON.stringify([{ id: 1 }, { id: 2 }])),
          statusText: "OK",
          headers: {},
          config: {} as any,
        },
        {
          status: 200,
          data: Buffer.from(JSON.stringify([{ id: 3 }])),
          statusText: "OK",
          headers: {},
          config: {} as any,
        },
      ];

      (axios as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await runStepConfig({
        config: config,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(result.data).toHaveLength(3);
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(axios).toHaveBeenCalledTimes(2);
    });

    it("should handle offset-based pagination", async () => {
      const config = {
        ...testEndpoint,
        queryParams: {
          offset: "<<offset>>",
          limit: "<<limit>>",
        },
        pagination: {
          type: "offsetBased" as PaginationTypeValue,
          pageSize: "2",
        },
      } as ApiConfig;

      const mockResponses = [
        {
          status: 200,
          data: Buffer.from(JSON.stringify([{ id: 1 }, { id: 2 }])),
          statusText: "OK",
          headers: {},
          config: {} as any,
        },
        {
          status: 200,
          data: Buffer.from(JSON.stringify([{ id: 3 }])),
          statusText: "OK",
          headers: {},
          config: {} as any,
        },
      ];

      (axios as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await runStepConfig({
        config: config,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(result.data).toHaveLength(3);
      expect(axios).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          params: { offset: "0", limit: "2" },
        }),
      );
      expect(axios).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          params: { offset: "2", limit: "2" },
        }),
      );
    });

    it("should handle cursor-based pagination", async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: "cursorBased" as PaginationTypeValue,
          pageSize: "2",
          cursorPath: "meta.next_cursor",
          stopCondition: "!response.data.meta.next_cursor",
        },
      } as ApiConfig;

      const mockResponses = [
        {
          status: 200,
          data: Buffer.from(
            JSON.stringify({
              data: [{ id: 1 }, { id: 2 }],
              meta: { next_cursor: "cursor123" },
            }),
          ),
          statusText: "OK",
          headers: {},
          config: {} as any,
        },
        {
          status: 200,
          data: Buffer.from(
            JSON.stringify({
              data: [{ id: 3 }],
              meta: { next_cursor: null },
            }),
          ),
          statusText: "OK",
          headers: {},
          config: {} as any,
        },
      ];

      (axios as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await runStepConfig({
        config: config,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(result.data).toEqual({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        meta: { next_cursor: null },
      });
    });

    it("should stop pagination when receiving duplicate data", async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: "pageBased" as PaginationTypeValue,
          pageSize: "2",
        },
      } as ApiConfig;

      const sameResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify([{ id: 1 }, { id: 2 }])),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      (axios as any).mockResolvedValueOnce(sameResponse).mockResolvedValueOnce(sameResponse);

      const result = await runStepConfig({
        config: config,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(result.data).toHaveLength(2);
      expect(axios).toHaveBeenCalledTimes(2);
    });

    it("should stop after 500 iterations", async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: "offsetBased" as PaginationTypeValue,
          pageSize: "1",
        },
        headers: {
          "x-superglue-test": "<<offset>>",
        },
      } as ApiConfig;

      for (let i = 0; i < 505; i++) {
        (axios as any).mockResolvedValueOnce({
          status: 200,
          data: Buffer.from(JSON.stringify([{ id: i }])),
          statusText: "OK",
          headers: {},
          config: {} as any,
        });
      }
      const result = await runStepConfig({
        config: config,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });
      expect(axios).toHaveBeenCalledTimes(500);
    });

    it("if 2 responses are the same, stop pagination", async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: "offsetBased" as PaginationTypeValue,
          pageSize: "1",
        },
        headers: {
          "x-superglue-test": "<<offset>>",
        },
      } as ApiConfig;

      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify([{ id: 1 }])),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      (axios as any).mockResolvedValue(mockResponse);

      const result = await runStepConfig({
        config: config,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(axios).toHaveBeenCalledTimes(2);
    });

    it("should handle error responses", async () => {
      const errorResponse = {
        status: 400,
        data: Buffer.from("Bad Request"),
        statusText: "Bad Request",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValue(errorResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
        }),
      ).rejects.toThrow(/API call failed/);
    });

    it("should handle GraphQL error responses", async () => {
      const config = {
        ...testEndpoint,
        method: HttpMethod.POST,
        body: "query { test }",
      } as ApiConfig;

      const graphqlErrorResponse = {
        status: 200,
        data: Buffer.from(
          JSON.stringify({
            errors: [
              {
                message: 'Field "test" not found',
                locations: [{ line: 1, column: 9 }],
                path: ["test"],
              },
            ],
            data: null,
          }),
        ),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(graphqlErrorResponse);

      await expect(
        runStepConfig({ config: config, payload: {}, credentials: {}, options: {}, metadata: {} }),
      ).rejects.toThrow(/appears to be an error/i);
    });

    it("should not flag benign 2xx responses with similar-sounding keys", async () => {
      const mockData = {
        profile: "ok",
        errorCount: 0,
        stats: { failureProbability: 0 },
        items: [],
        failedItems: [],
      };
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify(mockData)),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual(mockData);
    });

    it("should flag 2xx responses with nested error_message keys", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(
          JSON.stringify({
            data: { id: 1 },
            details: { error_message: "boom" },
          }),
        ),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: {},
          metadata: {},
        }),
      ).rejects.toThrow(/appears to be an error/i);
    });

    it("should flag 2xx responses with top-level failure key", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(
          JSON.stringify({
            failure: true,
            result: null,
          }),
        ),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: {},
          metadata: {},
        }),
      ).rejects.toThrow(/appears to be an error/i);
    });

    it("should flag 2xx responses if any nested errors key exists (non-empty)", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(
          JSON.stringify({
            data: { id: 1 },
            meta: { errors: [{ message: "boom" }] },
          }),
        ),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: {},
          metadata: {},
        }),
      ).rejects.toThrow(/appears to be an error/i);
    });

    it("should NOT flag 2xx responses when nested errors key is an empty array", async () => {
      const mockData = {
        data: { id: 1 },
        meta: { errors: [] },
      };
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify(mockData)),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual(mockData);
    });

    it("should parse HTML responses with 200 status as valid data", async () => {
      const htmlResponse = {
        status: 200,
        data: Buffer.from("<!DOCTYPE html><html><body><h1>Success</h1></body></html>"),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(htmlResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(result.statusCode).toBe(200);
      expect(result.data).toHaveProperty("html");
      expect(result.data.html.body.h1.content).toBe("Success");
    });

    it("should parse XML responses with 200 status as valid data", async () => {
      const xmlResponse = {
        status: 200,
        data: Buffer.from('<?xml version="1.0"?><response><status>success</status></response>'),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(xmlResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: {},
        metadata: {},
      });

      expect(result.statusCode).toBe(200);
      // XML parser uppercases keys
      expect(result.data).toHaveProperty("RESPONSE");
      expect(result.data.RESPONSE.STATUS).toBe("success");
    });

    it("should reject HTML responses with non-200 status", async () => {
      const htmlErrorResponse = {
        status: 404,
        data: Buffer.from("<!DOCTYPE html><html><body><h1>Not Found</h1></body></html>"),
        statusText: "Not Found",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValue(htmlErrorResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
        }),
      ).rejects.toThrow(/API call failed with status 404/);
    });

    it("should reject XML responses with error status code", async () => {
      const xmlErrorResponse = {
        status: 500,
        data: Buffer.from('<?xml version="1.0"?><error><message>Server Error</message></error>'),
        statusText: "Internal Server Error",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValue(xmlErrorResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
        }),
      ).rejects.toThrow(/API call failed with status 500/);
    });
  });

  describe("Error Detection Modes", () => {
    const testEndpoint: ApiConfig = {
      urlHost: "https://api.example.com",
      urlPath: "v1/test",
      method: HttpMethod.GET,
    };

    it("SMART mode should detect JSON error keys in 200 response", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ error: "Something went wrong" })),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
          continueOnFailure: false,
        }),
      ).rejects.toThrow(/appears to be an error/);
    });

    it("continueOnFailure=true should NOT detect JSON error keys in 200 response", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ error: "Something went wrong" })),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: { retries: 0 },
        metadata: {},
        continueOnFailure: true,
      });

      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ error: "Something went wrong" });
    });

    it("continueOnFailure=true should NOT detect any errors in 200 response", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ error: "Something went wrong", failure: true })),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: { retries: 0 },
        metadata: {},
        continueOnFailure: true,
      });

      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ error: "Something went wrong", failure: true });
    });

    it("default mode should still reject non-2xx status codes", async () => {
      const mockResponse = {
        status: 400,
        data: Buffer.from(JSON.stringify({ message: "Bad request" })),
        statusText: "Bad Request",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValue(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
          continueOnFailure: false,
        }),
      ).rejects.toThrow(/API call failed with status 400/);
    });

    it("continueOnFailure=true should NOT reject non-2xx status codes", async () => {
      const mockResponse = {
        status: 400,
        data: Buffer.from(JSON.stringify({ message: "Bad request" })),
        statusText: "Bad Request",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      const result = await runStepConfig({
        config: testEndpoint,
        payload: {},
        credentials: {},
        options: { retries: 0 },
        metadata: {},
        continueOnFailure: true,
      });

      expect(result.statusCode).toBe(400);
      expect(result.data).toEqual({ message: "Bad request" });
    });

    it("default mode should detect status field with error code in 200 response", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ status: 404, message: "Not found" })),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
          continueOnFailure: false,
        }),
      ).rejects.toThrow(/appears to be an error/);
    });

    it("defaults to smart error detection when continueOnFailure not specified", async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ error: "Something failed" })),
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
      (axios as any).mockResolvedValueOnce(mockResponse);

      await expect(
        runStepConfig({
          config: testEndpoint,
          payload: {},
          credentials: {},
          options: { retries: 0 },
          metadata: {},
        }),
      ).rejects.toThrow(/appears to be an error/);
    });
  });

  describe("Basic Auth Utilities", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    describe("convertBasicAuthToBase64", () => {
      it("should encode username:password format", () => {
        expect(convertBasicAuthToBase64("Basic test:1234")).toBe("Basic dGVzdDoxMjM0");
      });

      it("should leave already encoded credentials unchanged", () => {
        expect(convertBasicAuthToBase64("Basic dGVzdDoxMjM0")).toBe("Basic dGVzdDoxMjM0");
      });

      it("should leave non-Basic Auth headers unchanged", () => {
        expect(convertBasicAuthToBase64("Bearer token123")).toBe("Bearer token123");
      });

      it("should handle undefined or null values", () => {
        expect(convertBasicAuthToBase64(undefined)).toBeUndefined();
        expect(convertBasicAuthToBase64(null)).toBeNull();
      });
    });
  });

  describe("HttpStepExecutionStrategy", () => {
    const strategy = new HttpStepExecutionStrategy();

    describe("shouldExecute", () => {
      it("should return true for http:// URLs", () => {
        expect(strategy.shouldExecute("http://api.example.com")).toBe(true);
      });

      it("should return true for https:// URLs", () => {
        expect(strategy.shouldExecute("https://api.example.com")).toBe(true);
      });

      it("should return false for postgres:// URLs", () => {
        expect(strategy.shouldExecute("postgres://user:pass@localhost:5432")).toBe(false);
      });

      it("should return false for ftp:// URLs", () => {
        expect(strategy.shouldExecute("ftp://files.example.com")).toBe(false);
      });

      it("should return false for empty URL", () => {
        expect(strategy.shouldExecute("")).toBe(false);
      });
    });
  });
});
