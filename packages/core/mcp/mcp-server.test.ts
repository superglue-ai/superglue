import { describe, expect, it, vi } from "vitest";
import { toolDefinitions } from "./mcp-server.js";

const executeTool = toolDefinitions.superglue_execute_tool.execute;
const findRelevantTools = toolDefinitions.superglue_find_relevant_tools.execute;

describe("superglue_execute_tool", () => {
  it("executes tool successfully and returns only data", async () => {
    const client = {
      runTool: vi.fn().mockResolvedValue({
        success: true,
        data: { users: [{ id: 1, name: "Alice" }] },
        config: { id: "tool-1", steps: [] },
        stepResults: [],
      }),
      listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const args = { id: "tool-1", payload: {}, client, orgId: "test-org" };
    const result = await executeTool(args, {});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ users: [{ id: 1, name: "Alice" }] });
    expect(result).not.toHaveProperty("config");
    expect(result).not.toHaveProperty("stepResults");
  });

  it("returns only error message on failure", async () => {
    const client = {
      runTool: vi.fn().mockResolvedValue({
        success: false,
        error: "API rate limit exceeded",
        config: {},
        stepResults: [],
      }),
      listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const args = { id: "tool-1", client, orgId: "test-org" };
    const result = await executeTool(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("API rate limit exceeded");
    expect(result).not.toHaveProperty("config");
    expect(result).not.toHaveProperty("stepResults");
  });

  it("rejects options parameter", async () => {
    const client = {
      runTool: vi.fn(),
      listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const args = { id: "tool-1", options: { selfHealing: "ENABLED" }, client, orgId: "test-org" };
    const result = await executeTool(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Options parameter is not supported");
  });

  it("rejects unexpected parameters", async () => {
    const client = {
      runTool: vi.fn(),
      listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const args = { id: "tool-1", unexpectedParam: "value", client, orgId: "test-org" };
    const result = await executeTool(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unexpected parameters: unexpectedParam");
  });

  it("requires id parameter", async () => {
    const client = {
      runTool: vi.fn(),
      listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const args = { payload: {}, client, orgId: "test-org" };
    const result = await executeTool(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tool ID is required");
  });

  it("truncates large results", async () => {
    const largeData = { items: new Array(10000).fill({ id: 1, data: "x".repeat(100) }) };
    const client = {
      runTool: vi.fn().mockResolvedValue({
        success: true,
        data: largeData,
        config: {},
        stepResults: [],
      }),
      listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const args = { id: "tool-1", client, orgId: "test-org" };
    const result = await executeTool(args, {});

    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("string");
    expect(result.data).toContain("[TRUNCATED:");
  });
});

describe("superglue_find_relevant_tools", () => {
  it("returns all tools when searchTerms is wildcard", async () => {
    // Mock REST API response format (OpenAPITool)
    const mockTools = [
      {
        id: "tool-1",
        instruction: "Fetch users",
        inputSchema: {},
        outputSchema: {},
        steps: [{ systemId: "crm", instruction: "Get users" }],
      },
      {
        id: "tool-2",
        instruction: "Send email",
        inputSchema: {},
        outputSchema: {},
        steps: [{ systemId: "email", instruction: "Send message" }],
      },
    ];
    const client = {
      listTools: vi.fn().mockResolvedValue(mockTools),
    };
    const args = { searchTerms: "*", client, orgId: "test-org" };
    const result = await findRelevantTools(args, {});

    expect(result.success).toBe(true);
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0]).toHaveProperty("id");
    expect(result.tools[0]).toHaveProperty("instruction");
    expect(result.tools[0]).toHaveProperty("steps");
    expect(result.tools[0]).toHaveProperty("reason");
    // Verify mapping from REST format
    expect(result.tools[0].steps[0].integrationId).toBe("crm");
  });

  it("returns filtered tools for specific search", async () => {
    const mockTools = [
      {
        id: "slack-tool",
        instruction: "Post to Slack",
        inputSchema: {},
        outputSchema: {},
        steps: [{ systemId: "slack" }],
      },
    ];
    const client = {
      listTools: vi.fn().mockResolvedValue(mockTools),
    };
    const args = { searchTerms: "slack message", client, orgId: "test-org" };
    const result = await findRelevantTools(args, {});

    expect(result.success).toBe(true);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].id).toBe("slack-tool");
  });

  it("returns empty array when no tools match", async () => {
    const client = {
      listTools: vi.fn().mockResolvedValue([]),
    };
    const args = { searchTerms: "nonexistent", client, orgId: "test-org" };
    const result = await findRelevantTools(args, {});

    expect(result.success).toBe(true);
    expect(result.tools).toEqual([]);
  });

  it("handles errors gracefully", async () => {
    const client = {
      listTools: vi.fn().mockRejectedValue(new Error("Search failed")),
    };
    const args = { searchTerms: "test", client, orgId: "test-org" };
    const result = await findRelevantTools(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Search failed");
  });
});
