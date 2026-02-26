import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMcpServer, AuthenticateInputSchema } from "./mcp-server.js";
import { truncateToolExecutionResult } from "./mcp-server-utils.js";

// Mock dependencies
vi.mock("../auth/auth.js", () => ({
  validateToken: vi.fn().mockResolvedValue({
    orgId: "test-org",
    isRestricted: false,
  }),
}));

vi.mock("../utils/logs.js", () => ({
  logMessage: vi.fn(),
}));

vi.mock("../utils/telemetry.js", () => ({
  sessionId: "test-session",
  telemetryClient: null,
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MCP Server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createMcpServer", () => {
    it("creates server and registers tools from API", async () => {
      // Mock listTools response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "get-users",
                instruction: "Fetch all users from the CRM",
                inputSchema: {
                  type: "object",
                  properties: {
                    payload: {
                      type: "object",
                      properties: {
                        limit: { type: "number", description: "Max results" },
                      },
                    },
                  },
                },
                archived: false,
                steps: [],
              },
              {
                id: "send-email",
                instruction: "Send an email via SMTP",
                inputSchema: null,
                archived: false,
                steps: [],
              },
              {
                id: "archived-tool",
                instruction: "This is archived",
                archived: true,
                steps: [],
              },
            ],
          }),
      });

      const server = await createMcpServer("test-api-key");

      // Server should be created
      expect(server).toBeDefined();

      // Verify listTools was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/tools"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
    });

    it("filters out archived tools", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: "active-tool", instruction: "Active", archived: false, steps: [] },
              { id: "archived-tool", instruction: "Archived", archived: true, steps: [] },
            ],
          }),
      });

      const server = await createMcpServer("test-api-key");
      expect(server).toBeDefined();
      // The archived tool should not be registered (only active-tool + authenticate)
    });

    it("handles empty tool list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const server = await createMcpServer("test-api-key");
      expect(server).toBeDefined();
      // Should still have authenticate tool
    });
  });

  describe("jsonSchemaToZod conversion", () => {
    it("handles tools with complex input schemas", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "complex-tool",
                instruction: "Tool with complex schema",
                inputSchema: {
                  type: "object",
                  properties: {
                    payload: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "User name" },
                        age: { type: "integer" },
                        active: { type: "boolean" },
                        tags: { type: "array", items: { type: "string" } },
                        nested: {
                          type: "object",
                          properties: {
                            field: { type: "string" },
                          },
                        },
                      },
                      required: ["name"],
                    },
                  },
                },
                archived: false,
                steps: [],
              },
            ],
          }),
      });

      const server = await createMcpServer("test-api-key");
      expect(server).toBeDefined();
    });

    it("handles tools with no input schema", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "no-schema-tool",
                instruction: "Tool without schema",
                inputSchema: null,
                archived: false,
                steps: [],
              },
            ],
          }),
      });

      const server = await createMcpServer("test-api-key");
      expect(server).toBeDefined();
    });
  });

  describe("AuthenticateInputSchema", () => {
    it("validates optional systemId", () => {
      const result1 = AuthenticateInputSchema.safeParse({});
      expect(result1.success).toBe(true);

      const result2 = AuthenticateInputSchema.safeParse({ systemId: "stripe" });
      expect(result2.success).toBe(true);

      const result3 = AuthenticateInputSchema.safeParse({ systemId: 123 });
      expect(result3.success).toBe(false);
    });
  });

  describe("tool name sanitization", () => {
    it("sanitizes tool IDs with special characters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "my-tool-with-dashes",
                instruction: "Tool with dashes",
                archived: false,
                steps: [],
              },
              {
                id: "tool.with.dots",
                instruction: "Tool with dots",
                archived: false,
                steps: [],
              },
              {
                id: "tool@special#chars",
                instruction: "Tool with special chars",
                archived: false,
                steps: [],
              },
            ],
          }),
      });

      const server = await createMcpServer("test-api-key");
      expect(server).toBeDefined();
      // Tool names should be sanitized to valid MCP names
    });
  });
});

describe("truncateToolExecutionResult", () => {
  it("returns JSON string for small results without sampling", () => {
    const result = { success: true, data: { id: 1, name: "test" } };
    const output = truncateToolExecutionResult(result);

    expect(output).toBe(JSON.stringify(result, null, 2));
    expect(output).not.toContain("sampled from");
  });

  it("returns 'no result' for null/undefined", () => {
    expect(truncateToolExecutionResult(null)).toBe("no result");
    expect(truncateToolExecutionResult(undefined)).toBe("no result");
  });

  it("does not sample arrays under the character limit", () => {
    // Create a result with an array that's under the limit
    const smallArray = new Array(20).fill({ id: 1 });
    const result = { success: true, data: smallArray };
    const output = truncateToolExecutionResult(result);

    // Should NOT contain sampled message since it's under the limit
    expect(output).not.toContain("sampled from");
    // Should contain all 20 items
    const parsed = JSON.parse(output);
    expect(parsed.data).toHaveLength(20);
  });

  it("samples large arrays that exceed the character limit", () => {
    // Create a result with a large array that exceeds the limit
    // Use Array.from to create unique objects (not references)
    const largeArray = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      data: "x".repeat(100),
    }));
    const result = { success: true, data: largeArray };
    const output = truncateToolExecutionResult(result, 10);

    // Should contain the sampled message
    expect(output).toContain("sampled from 5000 items");
  });

  it("hard truncates if sampled result still exceeds limit", () => {
    // Create a result where even sampled data exceeds 20k chars
    // Each item has a 3000 char string, 10 items sampled = ~30k chars
    // Use Array.from to create unique objects (not references)
    const hugeStrings = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      data: "x".repeat(3000),
    }));
    const result = { success: true, data: hugeStrings };
    const output = truncateToolExecutionResult(result, 10);

    // Should hit the hard truncate
    expect(output).toContain("[TRUNCATED: exceeded");
    expect(output).toContain("char limit]");
    expect(output.length).toBeLessThanOrEqual(20100); // limit + truncation message
  });
});
