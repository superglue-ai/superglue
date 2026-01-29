import { describe, expect, it, vi, beforeEach } from "vitest";
import { Tool, ToolDiff } from "@superglue/shared";
import { ToolFixer } from "./tool-fixer.js";
import { LanguageModel } from "../llm/llm-base-model.js";

vi.mock("../llm/llm-base-model.js");
vi.mock("../utils/logs.js", () => ({
  logMessage: vi.fn(),
}));

describe("ToolFixer", () => {
  const mockMetadata = {
    orgId: "test-org",
    traceId: "test-trace",
  };

  const mockSystem = {
    id: "sys1",
    name: "Test System",
    apiUrl: "https://api.example.com",
    apiVersion: "v1",
  };

  const createBaseTool = (): Tool => ({
    id: "test-tool",
    instruction: "Test tool",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
    },
    responseSchema: {
      type: "object",
      properties: {
        result: { type: "string" },
      },
    },
    steps: [
      {
        id: "step1",
        systemId: "sys1",
        apiConfig: {
          id: "api1",
          instruction: "Test API",
          method: "GET",
          urlHost: "https://api.example.com",
          urlPath: "/users",
        },
      },
    ],
    systemIds: ["sys1"],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Constructor and Schema Normalization", () => {
    it("should normalize stringified inputSchema on construction", () => {
      const tool: any = {
        ...createBaseTool(),
        inputSchema: '{"type":"object","properties":{"name":{"type":"string"}}}',
      };

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "test",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      expect(fixer["tool"].inputSchema).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
        },
      });
    });

    it("should normalize stringified responseSchema on construction", () => {
      const tool: any = {
        ...createBaseTool(),
        responseSchema: '{"type":"array","items":{"type":"string"}}',
      };

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "test",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      expect(fixer["tool"].responseSchema).toEqual({
        type: "array",
        items: { type: "string" },
      });
    });

    it("should normalize both schemas when both are stringified", () => {
      const tool: any = {
        ...createBaseTool(),
        inputSchema: '{"type":"object","properties":{"input":{"type":"string"}}}',
        responseSchema: '{"type":"object","properties":{"output":{"type":"number"}}}',
      };

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "test",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      expect(fixer["tool"].inputSchema).toEqual({
        type: "object",
        properties: {
          input: { type: "string" },
        },
      });
      expect(fixer["tool"].responseSchema).toEqual({
        type: "object",
        properties: {
          output: { type: "number" },
        },
      });
    });

    it("should leave object schemas unchanged", () => {
      const tool = createBaseTool();
      const originalInput = tool.inputSchema;

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "test",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      expect(fixer["tool"].inputSchema).toEqual(originalInput);
    });

    it("should handle unparseable stringified schemas gracefully", () => {
      const tool: any = {
        ...createBaseTool(),
        inputSchema: "{invalid json}",
      };

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "test",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      expect(fixer["tool"].inputSchema).toBe("{invalid json}");
    });
  });

  describe("fixTool - LLM Output Handling", () => {
    it("should handle LLM returning patches with object values", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema",
              value: {
                type: "object",
                properties: {
                  email: { type: "string" },
                },
              },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add email field",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.tool.inputSchema).toEqual({
        type: "object",
        properties: {
          email: { type: "string" },
        },
      });
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].path).toBe("/inputSchema");
    });

    it("should handle LLM returning patches with stringified schema values", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema",
              value: '{"type":"object","properties":{"username":{"type":"string"}}}',
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add username field",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.tool.inputSchema).toEqual({
        type: "object",
        properties: {
          username: { type: "string" },
        },
      });
    });

    it("should handle multiple patches affecting schemas", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema/properties/userId/type",
              value: "number",
            },
            {
              op: "add",
              path: "/inputSchema/properties/email",
              value: { type: "string" },
            },
            {
              op: "replace",
              path: "/responseSchema",
              value: {
                type: "array",
                items: { type: "object" },
              },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Update schemas",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.tool.inputSchema.properties.userId.type).toBe("number");
      expect(result.tool.inputSchema.properties.email).toEqual({ type: "string" });
      expect(result.tool.responseSchema).toEqual({
        type: "array",
        items: { type: "object" },
      });
      expect(result.diffs).toHaveLength(3);
    });

    it("should handle patches with stringified headers object", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "add",
              path: "/steps/0/apiConfig/headers",
              value: {
                Authorization: "Bearer token",
                "Content-Type": "application/json",
              },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add headers",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.tool.steps[0].apiConfig.headers).toEqual({
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      });
    });

    it("should handle patches with stringified pagination object", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "add",
              path: "/steps/0/apiConfig/pagination",
              value: {
                type: "offset",
                limit: 100,
              },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add pagination",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.tool.steps[0].apiConfig.pagination).toEqual({
        type: "offset",
        limit: 100,
      });
    });

    it("should normalize tool after applying patches", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema",
              value: '{"type":"object","properties":{"field":{"type":"string"}}}',
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Fix schema",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(typeof result.tool.inputSchema).toBe("object");
      expect(result.tool.inputSchema).not.toBeInstanceOf(String);
      expect(result.tool.inputSchema).toEqual({
        type: "object",
        properties: {
          field: { type: "string" },
        },
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle tool with missing schemas", async () => {
      const tool: any = {
        id: "test",
        steps: [],
        systemIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "add",
              path: "/inputSchema",
              value: { type: "object" },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add schema",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();
      expect(result.tool.inputSchema).toEqual({ type: "object" });
    });

    it("should handle complex nested schema updates", async () => {
      const tool: any = {
        ...createBaseTool(),
        inputSchema: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                profile: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                  },
                },
              },
            },
          },
        },
      };

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "add",
              path: "/inputSchema/properties/user/properties/profile/properties/age",
              value: { type: "number" },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add age field",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();
      expect(result.tool.inputSchema.properties.user.properties.profile.properties.age).toEqual({
        type: "number",
      });
    });

    it("should preserve tool metadata after fix", async () => {
      const tool = createBaseTool();
      const originalCreatedAt = tool.createdAt;

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema/properties/userId/type",
              value: "number",
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Fix schema",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.tool.instruction).toBe(tool.instruction);
      expect(result.tool.systemIds).toEqual(tool.systemIds);
      expect(result.tool.createdAt).toBe(originalCreatedAt);
      expect(result.tool.updatedAt).toBeInstanceOf(Date);
      expect(result.tool.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime());
    });

    it("should handle empty patches array", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "No changes needed",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      await expect(fixer.fixTool()).rejects.toThrow("LLM returned no patches");
    });

    it("should retry on validation failure", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject)
        .mockResolvedValueOnce({
          success: true,
          response: {
            patches: [
              {
                op: "replace",
                path: "invalid-path",
                value: "test",
              },
            ],
          },
          messages: [],
        } as any)
        .mockResolvedValueOnce({
          success: true,
          response: {
            patches: [
              {
                op: "replace",
                path: "/inputSchema/properties/userId/type",
                value: "number",
              },
            ],
          },
          messages: [],
        } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Fix schema",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();
      expect(result.tool.inputSchema.properties.userId.type).toBe("number");
      expect(vi.mocked(LanguageModel.generateObject)).toHaveBeenCalledTimes(2);
    });
  });

  describe("Real-world Scenarios", () => {
    it("should handle complete schema replacement with stringified value", async () => {
      const tool: any = {
        ...createBaseTool(),
        inputSchema: '{"type":"object","properties":{"oldField":{"type":"string"}}}',
      };

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema",
              value: JSON.stringify({
                type: "object",
                properties: {
                  username: { type: "string", minLength: 3 },
                  password: { type: "string", minLength: 8 },
                  email: { type: "string", format: "email" },
                },
                required: ["username", "password"],
              }),
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Replace with login schema",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();
      expect(result.tool.inputSchema).toEqual({
        type: "object",
        properties: {
          username: { type: "string", minLength: 3 },
          password: { type: "string", minLength: 8 },
          email: { type: "string", format: "email" },
        },
        required: ["username", "password"],
      });
    });

    it("should handle mixed object and string values in patches", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema",
              value: '{"type":"object","properties":{"id":{"type":"string"}}}',
            },
            {
              op: "add",
              path: "/steps/0/apiConfig/headers",
              value: { "X-API-Key": "secret" },
            },
            {
              op: "replace",
              path: "/responseSchema",
              value: { type: "array", items: { type: "string" } },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Multiple updates",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();
      expect(result.tool.inputSchema).toEqual({
        type: "object",
        properties: { id: { type: "string" } },
      });
      expect(result.tool.steps[0].apiConfig.headers).toEqual({ "X-API-Key": "secret" });
      expect(result.tool.responseSchema).toEqual({
        type: "array",
        items: { type: "string" },
      });
    });

    it("should handle schema with special characters in property names", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "replace",
              path: "/inputSchema",
              value: {
                type: "object",
                properties: {
                  user_id: { type: "string" },
                  "api-key": { type: "string" },
                  "X-Custom-Header": { type: "string" },
                },
              },
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Add fields with special chars",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();
      expect(result.tool.inputSchema.properties["user_id"]).toEqual({ type: "string" });
      expect(result.tool.inputSchema.properties["api-key"]).toEqual({ type: "string" });
      expect(result.tool.inputSchema.properties["X-Custom-Header"]).toEqual({ type: "string" });
    });
  });

  describe("Diff Generation", () => {
    it("should generate diffs that match the applied patches", async () => {
      const tool = createBaseTool();

      const patches = [
        {
          op: "replace" as const,
          path: "/inputSchema/properties/userId/type",
          value: "number",
        },
        {
          op: "add" as const,
          path: "/inputSchema/properties/email",
          value: { type: "string" },
        },
      ];

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: { patches },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Update schema",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.diffs).toHaveLength(2);
      expect(result.diffs[0]).toEqual({
        op: "replace",
        path: "/inputSchema/properties/userId/type",
        value: "number",
      });
      expect(result.diffs[1]).toEqual({
        op: "add",
        path: "/inputSchema/properties/email",
        value: { type: "string" },
      });
    });

    it("should generate diffs with from field for move operations", async () => {
      const tool = createBaseTool();

      vi.mocked(LanguageModel.generateObject).mockResolvedValue({
        success: true,
        response: {
          patches: [
            {
              op: "move",
              from: "/inputSchema/properties/userId",
              path: "/inputSchema/properties/id",
            },
          ],
        },
        messages: [],
      } as any);

      const fixer = new ToolFixer({
        tool,
        fixInstructions: "Rename field",
        systems: [mockSystem],
        metadata: mockMetadata,
      });

      const result = await fixer.fixTool();

      expect(result.diffs[0]).toEqual({
        op: "move",
        path: "/inputSchema/properties/id",
        from: "/inputSchema/properties/userId",
      });
    });
  });
});
