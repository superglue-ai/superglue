import { describe, expect, it } from "vitest";
import { Tool, ToolDiff, normalizeToolSchemas, normalizeToolDiffs } from "@superglue/shared";
import * as jsonpatch from "fast-json-patch";

/**
 * This is a 1-to-1 copy of applyDiffsToConfig from the frontend
 * We replicate it here to test the exact flow that happens in production
 */
function applyDiffsToConfig(config: Tool, diffs: ToolDiff[]): Tool {
  if (!diffs?.length) return config;
  const configCopy = JSON.parse(JSON.stringify(config));

  const normalizedConfig = normalizeToolSchemas(configCopy);
  const normalizedDiffs = normalizeToolDiffs(diffs);

  const result = jsonpatch.applyPatch(
    normalizedConfig,
    normalizedDiffs as jsonpatch.Operation[],
    true,
    true,
  );
  return result.newDocument || normalizedConfig;
}

/**
 * Simulates the exact tool-fixer return format
 */
interface ToolFixerResult {
  tool: Tool;
  diffs: ToolDiff[];
}

describe("Tool Fixer → Frontend Integration", () => {
  const createOriginalTool = (): Tool => ({
    id: "test-tool",
    instruction: "Original instruction",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        result: { type: "string" },
      },
    },
    steps: [
      {
        id: "step1",
        instruction: "Fetch users",
        config: {
          method: "GET",
          url: "https://api.example.com/users",
          systemId: "sys1",
        },
      },
    ],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });

  describe("Scenario: LLM returns object values (ideal case)", () => {
    it("should apply schema replacement with object value", () => {
      const originalTool = createOriginalTool();

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: {
            type: "object",
            properties: {
              email: { type: "string" },
              password: { type: "string" },
            },
          },
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema",
            value: {
              type: "object",
              properties: {
                email: { type: "string" },
                password: { type: "string" },
              },
            },
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
    });

    it("should apply nested schema modifications", () => {
      const originalTool = createOriginalTool();

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: {
            type: "object",
            properties: {
              userId: { type: "number" },
            },
          },
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema/properties/userId/type",
            value: "number",
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
    });
  });

  describe("Scenario: LLM returns stringified schema (bug scenario)", () => {
    it("should handle stringified inputSchema value from LLM", () => {
      const originalTool = createOriginalTool();

      const newSchema = {
        type: "object",
        properties: {
          username: { type: "string" },
          age: { type: "number" },
        },
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: newSchema,
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema",
            value: JSON.stringify(newSchema),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(newSchema);
      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
    });

    it("should handle stringified outputSchema value from LLM", () => {
      const originalTool = createOriginalTool();

      const newSchema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
          },
        },
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          outputSchema: newSchema,
        },
        diffs: [
          {
            op: "replace",
            path: "/outputSchema",
            value: JSON.stringify(newSchema),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.outputSchema).toEqual(newSchema);
      expect(result.outputSchema).toEqual(fixerResult.tool.outputSchema);
    });
  });

  describe("Scenario: Original tool has stringified schemas (from database)", () => {
    it("should handle original tool with stringified inputSchema", () => {
      const originalTool: any = {
        ...createOriginalTool(),
        inputSchema: '{"type":"object","properties":{"userId":{"type":"string"}}}',
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: {
            type: "object",
            properties: {
              userId: { type: "number" },
            },
          },
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema/properties/userId/type",
            value: "number",
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual({
        type: "object",
        properties: {
          userId: { type: "number" },
        },
      });
    });

    it("should handle both stringified schemas in original tool", () => {
      const originalTool: any = {
        ...createOriginalTool(),
        inputSchema: '{"type":"object","properties":{"id":{"type":"string"}}}',
        outputSchema: '{"type":"object","properties":{"data":{"type":"string"}}}',
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "number" },
            },
          },
          outputSchema: {
            type: "object",
            properties: {
              data: { type: "array" },
            },
          },
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema/properties/id/type",
            value: "number",
          },
          {
            op: "replace",
            path: "/outputSchema/properties/data/type",
            value: "array",
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
      expect(result.outputSchema).toEqual(fixerResult.tool.outputSchema);
    });
  });

  describe("Scenario: Worst case - both original AND diffs are stringified", () => {
    it("should handle stringified original schema + stringified diff value", () => {
      const originalTool: any = {
        ...createOriginalTool(),
        inputSchema: '{"type":"object","properties":{"oldField":{"type":"string"}}}',
      };

      const newSchema = {
        type: "object",
        properties: {
          newField: { type: "number" },
        },
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: newSchema,
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema",
            value: JSON.stringify(newSchema),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(newSchema);
      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
    });
  });

  describe("Scenario: Multiple sequential diffs with stringified values", () => {
    it("should apply multiple stringified diffs correctly", () => {
      const originalTool = createOriginalTool();

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: {
            type: "object",
            properties: {
              userId: { type: "string" },
              email: { type: "string" },
            },
          },
          steps: [
            {
              ...originalTool.steps[0],
              config: {
                ...originalTool.steps[0].config,
                headers: {
                  Authorization: "Bearer token",
                  "Content-Type": "application/json",
                },
              },
            },
          ],
        },
        diffs: [
          {
            op: "add",
            path: "/inputSchema/properties/email",
            value: JSON.stringify({ type: "string" }),
          },
          {
            op: "add",
            path: "/steps/0/config/headers",
            value: JSON.stringify({
              Authorization: "Bearer token",
              "Content-Type": "application/json",
            }),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
      expect(result.steps[0].config.headers).toEqual(fixerResult.tool.steps[0].config.headers);
    });

    it("should handle schema replacement followed by nested modification", () => {
      const originalTool = createOriginalTool();

      const intermediateSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
          },
        },
      };

      const finalSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              email: { type: "string" },
            },
          },
        },
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: finalSchema,
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema",
            value: JSON.stringify(intermediateSchema),
          },
          {
            op: "add",
            path: "/inputSchema/properties/user/properties/email",
            value: { type: "string" },
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(finalSchema);
      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
    });
  });

  describe("Scenario: Headers, QueryParams, Pagination (other object paths)", () => {
    it("should handle stringified headers", () => {
      const originalTool = createOriginalTool();

      const headers = {
        Authorization: "Bearer token",
        "X-API-Key": "secret",
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          steps: [
            {
              ...originalTool.steps[0],
              config: {
                ...originalTool.steps[0].config,
                headers,
              },
            },
          ],
        },
        diffs: [
          {
            op: "add",
            path: "/steps/0/config/headers",
            value: JSON.stringify(headers),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.steps[0].config.headers).toEqual(headers);
    });

    it("should handle stringified queryParams", () => {
      const originalTool = createOriginalTool();

      const queryParams = {
        page: "1",
        limit: "50",
        sort: "asc",
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          steps: [
            {
              ...originalTool.steps[0],
              config: {
                ...originalTool.steps[0].config,
                queryParams,
              },
            },
          ],
        },
        diffs: [
          {
            op: "add",
            path: "/steps/0/config/queryParams",
            value: JSON.stringify(queryParams),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.steps[0].config.queryParams).toEqual(queryParams);
    });

    it("should handle stringified pagination", () => {
      const originalTool = createOriginalTool();

      const pagination = {
        type: "offset",
        limit: 100,
        offsetParam: "offset",
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          steps: [
            {
              ...originalTool.steps[0],
              config: {
                ...originalTool.steps[0].config,
                pagination,
              },
            },
          ],
        },
        diffs: [
          {
            op: "add",
            path: "/steps/0/config/pagination",
            value: JSON.stringify(pagination),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.steps[0].config.pagination).toEqual(pagination);
    });
  });

  describe("Scenario: Mixed object and string values", () => {
    it("should handle some diffs with objects, some with strings", () => {
      const originalTool = createOriginalTool();

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
          },
          steps: [
            {
              ...originalTool.steps[0],
              config: {
                ...originalTool.steps[0].config,
                headers: { "X-API-Key": "secret" },
              },
            },
          ],
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema",
            value: JSON.stringify({
              type: "object",
              properties: {
                id: { type: "string" },
              },
            }),
          },
          {
            op: "add",
            path: "/steps/0/config/headers",
            value: { "X-API-Key": "secret" },
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
      expect(result.steps[0].config.headers).toEqual(fixerResult.tool.steps[0].config.headers);
    });
  });

  describe("Scenario: String fields should NOT be parsed", () => {
    it("should NOT parse body field (should stay as string)", () => {
      const originalTool = createOriginalTool();

      const bodyValue = '{"user_id": 123, "action": "create"}';

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          steps: [
            {
              ...originalTool.steps[0],
              config: {
                ...originalTool.steps[0].config,
                body: bodyValue,
              },
            },
          ],
        },
        diffs: [
          {
            op: "add",
            path: "/steps/0/config/body",
            value: bodyValue,
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.steps[0].config.body).toBe(bodyValue);
      expect(typeof result.steps[0].config.body).toBe("string");
    });

    it("should NOT parse dataSelector (should stay as string function)", () => {
      const originalTool = createOriginalTool();

      const dataSelector = "(sourceData) => { return {} }";

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          steps: [
            {
              ...originalTool.steps[0],
              dataSelector,
            },
          ],
        },
        diffs: [
          {
            op: "add",
            path: "/steps/0/dataSelector",
            value: dataSelector,
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.steps[0].dataSelector).toBe(dataSelector);
      expect(typeof result.steps[0].dataSelector).toBe("string");
    });

    it("should NOT parse outputTransform (should stay as string function)", () => {
      const originalTool = createOriginalTool();

      const outputTransform = "(sourceData) => sourceData.step1.data";

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          outputTransform,
        },
        diffs: [
          {
            op: "add",
            path: "/outputTransform",
            value: outputTransform,
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.outputTransform).toBe(outputTransform);
      expect(typeof result.outputTransform).toBe("string");
    });
  });

  describe("Verification: Result matches fixed tool", () => {
    it("should produce identical result to tool-fixer output after applying diffs", () => {
      const originalTool = createOriginalTool();

      const fixedSchema = {
        type: "object",
        properties: {
          username: { type: "string", minLength: 3 },
          password: { type: "string", minLength: 8 },
          email: { type: "string", format: "email" },
        },
        required: ["username", "password"],
      };

      const fixerResult: ToolFixerResult = {
        tool: {
          ...originalTool,
          inputSchema: fixedSchema,
          updatedAt: new Date("2024-01-02"),
        },
        diffs: [
          {
            op: "replace",
            path: "/inputSchema",
            value: JSON.stringify(fixedSchema),
          },
        ],
      };

      const result = applyDiffsToConfig(originalTool, fixerResult.diffs);

      expect(result.inputSchema).toEqual(fixerResult.tool.inputSchema);
      expect(JSON.stringify(result.inputSchema)).toBe(JSON.stringify(fixerResult.tool.inputSchema));
    });
  });
});
