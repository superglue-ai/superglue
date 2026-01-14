import { ApiConfig, HttpMethod, Tool } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logs from "../utils/logs.js";
import { ToolFinder } from "./tool-finder.js";

vi.mock("../utils/logs.js", () => ({
  logMessage: vi.fn(),
}));

describe("ToolFinder", () => {
  let toolFinder: ToolFinder;
  let mockTools: Tool[];

  beforeEach(() => {
    vi.clearAllMocks();
    toolFinder = new ToolFinder({ orgId: "test-org", traceId: "test-trace-id" });

    mockTools = [
      {
        id: "send-email",
        instruction: "Send an email notification",
        steps: [
          {
            id: "step-1",
            integrationId: "gmail",
            apiConfig: {
              id: "step-1",
              instruction: "Send email via Gmail API",
              method: HttpMethod.POST,
              urlHost: "https://gmail.googleapis.com",
              urlPath: "/send",
            },
            responseMapping: "$",
          },
        ],
      },
      {
        id: "fetch-users",
        instruction: "Fetch all users from the database",
        steps: [
          {
            id: "step-1",
            integrationId: "postgres",
            apiConfig: {
              id: "step-1",
              instruction: "Query users table",
              method: HttpMethod.GET,
              urlHost: "https://db.example.com",
              urlPath: "/users",
            },
            responseMapping: "$",
          },
        ],
      },
      {
        id: "slack-notification",
        instruction: "Send a message to Slack channel",
        steps: [
          {
            id: "step-1",
            integrationId: "slack",
            apiConfig: {
              id: "step-1",
              instruction: "Post message to Slack",
              method: HttpMethod.POST,
              urlHost: "https://slack.com",
              urlPath: "/api/chat.postMessage",
            },
            responseMapping: "$",
          },
        ],
      },
      {
        id: "github-create-issue",
        instruction: "Create an issue in GitHub repository",
        steps: [
          {
            id: "step-1",
            integrationId: "github",
            apiConfig: {
              id: "step-1",
              instruction: "Create GitHub issue",
              method: HttpMethod.POST,
              urlHost: "https://api.github.com",
              urlPath: "/repos/owner/repo/issues",
            },
            responseMapping: "$",
          },
        ],
      },
    ];
  });

  describe("findTools", () => {
    it("should return all tools when no query is provided", async () => {
      const results = await toolFinder.findTools(undefined, mockTools);

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.reason === "Available tool")).toBe(true);
    });

    it("should return all tools when query is empty string", async () => {
      const results = await toolFinder.findTools("", mockTools);

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.reason === "Available tool")).toBe(true);
    });

    it('should return all tools when query is "*"', async () => {
      const results = await toolFinder.findTools("*", mockTools);

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.reason === "Available tool")).toBe(true);
    });

    it('should return all tools when query is "all"', async () => {
      const results = await toolFinder.findTools("all", mockTools);

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.reason === "Available tool")).toBe(true);
    });

    it("should return empty array when no tools are provided", async () => {
      const results = await toolFinder.findTools("email", []);

      expect(results).toHaveLength(0);
    });

    it("should find tools by keyword in tool ID", async () => {
      const results = await toolFinder.findTools("email", mockTools);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("send-email");
      expect(results[0].reason).toContain("Matched keywords: email");
    });

    it("should find tools by keyword in instruction", async () => {
      const results = await toolFinder.findTools("slack", mockTools);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("slack-notification");
      expect(results[0].reason).toContain("Matched keywords: slack");
    });

    it("should find tools by keyword in integration ID", async () => {
      const results = await toolFinder.findTools("github", mockTools);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("github-create-issue");
      expect(results[0].reason).toContain("Matched keywords: github");
    });

    it("should find tools by keyword in step instruction", async () => {
      const results = await toolFinder.findTools("query", mockTools);

      expect(results.length).toBeGreaterThan(0);
      const usersTool = results.find((r) => r.id === "fetch-users");
      expect(usersTool).toBeDefined();
      expect(usersTool?.reason).toContain("Matched keywords: query");
    });

    it("should handle multiple keywords and rank by score", async () => {
      const results = await toolFinder.findTools("send slack", mockTools);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("slack-notification");
      expect(results[0].reason).toContain("send");
      expect(results[0].reason).toContain("slack");
    });

    it("should be case insensitive", async () => {
      const results1 = await toolFinder.findTools("GITHUB", mockTools);
      const results2 = await toolFinder.findTools("github", mockTools);
      const results3 = await toolFinder.findTools("GiThUb", mockTools);

      expect(results1).toEqual(results2);
      expect(results2).toEqual(results3);
      expect(results1[0].id).toBe("github-create-issue");
    });

    it("should return all tools when no keywords match", async () => {
      const results = await toolFinder.findTools("nonexistent", mockTools);

      expect(results).toHaveLength(4);
      expect(
        results.every((r) => r.reason === "No specific match found, but this tool is available"),
      ).toBe(true);
    });

    it("should filter and rank tools correctly with partial matches", async () => {
      const results = await toolFinder.findTools("message", mockTools);

      const slackTool = results.find((r) => r.id === "slack-notification");
      expect(slackTool).toBeDefined();
      expect(slackTool?.reason).toContain("Matched keywords: message");
    });

    it("should return enriched tool data with correct structure", async () => {
      const results = await toolFinder.findTools("email", mockTools);

      expect(results[0]).toMatchObject({
        id: "send-email",
        instruction: "Send an email notification",
        inputSchema: undefined,
        responseSchema: undefined,
        steps: [
          {
            integrationId: "gmail",
            instruction: "Send email via Gmail API",
          },
        ],
        reason: expect.stringContaining("Matched keywords"),
      });
    });

    it("should handle tools with multiple steps", async () => {
      const complexTool: Tool = {
        id: "complex-workflow",
        instruction: "Complex workflow with multiple steps",
        steps: [
          {
            id: "step-1",
            integrationId: "github",
            apiConfig: {
              id: "step-1",
              instruction: "Fetch GitHub data",
              method: HttpMethod.GET,
              urlHost: "https://api.github.com",
              urlPath: "/repos",
            },
            responseMapping: "$",
          },
          {
            id: "step-2",
            integrationId: "slack",
            apiConfig: {
              id: "step-2",
              instruction: "Send notification to Slack",
              method: HttpMethod.POST,
              urlHost: "https://slack.com",
              urlPath: "/api/chat.postMessage",
            },
            responseMapping: "$",
          },
        ],
      };

      const toolsWithComplex = [...mockTools, complexTool];
      const results = await toolFinder.findTools("github slack", toolsWithComplex);

      const complexResult = results.find((r) => r.id === "complex-workflow");
      expect(complexResult).toBeDefined();
      expect(complexResult?.steps).toHaveLength(2);
      expect(complexResult?.reason).toContain("github");
      expect(complexResult?.reason).toContain("slack");
    });

    it("should handle tools without integration IDs", async () => {
      const simpleWorkflow: Tool = {
        id: "simple-http-call",
        instruction: "Make a simple HTTP call",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Call external API",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/data",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("http", [simpleWorkflow]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("simple-http-call");
      expect(results[0].steps[0].integrationId).toBeUndefined();
    });

    it("should trim and filter empty keywords", async () => {
      const results = await toolFinder.findTools("  email   ", mockTools);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("send-email");
    });

    it("should handle whitespace-only queries as empty", async () => {
      const results = await toolFinder.findTools("   ", mockTools);

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.reason === "Available tool")).toBe(true);
    });

    it("should sort results by score (most matches first)", async () => {
      const highScoreTool: Tool = {
        id: "high-score-tool",
        instruction: "Notification alert message notification",
        steps: [
          {
            id: "step-1",
            integrationId: "notification-service",
            apiConfig: {
              id: "step-1",
              instruction: "Send alert via notification system",
              method: HttpMethod.POST,
              urlHost: "https://api.notification.com",
              urlPath: "/send",
            },
            responseMapping: "$",
          },
        ],
      };

      const lowScoreTool: Tool = {
        id: "low-score-tool",
        instruction: "Process data",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Handle notification",
              method: HttpMethod.POST,
              urlHost: "https://api.example.com",
              urlPath: "/process",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("notification alert message", [
        lowScoreTool,
        highScoreTool,
      ]);

      expect(results[0].id).toBe("high-score-tool");
      expect(results[0].reason).toContain("notification");
      expect(results[0].reason).toContain("alert");
      expect(results[0].reason).toContain("message");

      expect(results[1].id).toBe("low-score-tool");
      expect(results[1].reason).toContain("notification");
    });
  });

  describe("edge cases", () => {
    it("should handle tools with undefined instruction", async () => {
      const toolWithoutInstruction: Tool = {
        id: "no-instruction-tool",
        steps: [
          {
            id: "step-1",
            integrationId: "test-integration",
            apiConfig: {
              id: "step-1",
              instruction: "Do something",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("no-instruction-tool", [toolWithoutInstruction]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("no-instruction-tool");
      expect(results[0].instruction).toBeUndefined();
    });

    it("should handle tools with empty steps array", async () => {
      const toolWithNoSteps: Tool = {
        id: "empty-steps-tool",
        instruction: "Tool with no steps",
        steps: [],
      };

      const results = await toolFinder.findTools("empty", [toolWithNoSteps]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("empty-steps-tool");
      expect(results[0].steps).toHaveLength(0);
    });

    it("should handle steps with null apiConfig", async () => {
      const toolWithNullConfig: Tool = {
        id: "null-config-tool",
        instruction: "Tool with null config",
        steps: [
          {
            id: "step-1",
            integrationId: "test",
            apiConfig: null as any,
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("test", [toolWithNullConfig]);

      expect(results).toHaveLength(1);
      expect(results[0].steps[0].instruction).toBeUndefined();
    });

    it("should handle steps with undefined apiConfig instruction", async () => {
      const toolWithUndefinedInstruction: Tool = {
        id: "undefined-instruction-tool",
        instruction: "Tool with undefined step instruction",
        steps: [
          {
            id: "step-1",
            integrationId: "test",
            apiConfig: {
              id: "step-1",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            } as unknown as ApiConfig,
          },
        ],
      } as Tool;

      const results = await toolFinder.findTools("test", [toolWithUndefinedInstruction]);
      expect(results).toHaveLength(1);
      expect(results[0].steps[0].instruction).toBeUndefined();
    });

    it("should handle special characters in query", async () => {
      const toolWithSpecialChars: Tool = {
        id: "special-chars-tool",
        instruction: "Tool with special chars @#$%",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Process data",
              method: HttpMethod.POST,
              urlHost: "https://api.example.com",
              urlPath: "/process",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("@#$% chars special", [toolWithSpecialChars]);

      const match = results.find((r) => r.id === "special-chars-tool");
      expect(match).toBeDefined();
    });

    it("should handle very long query strings", async () => {
      const longQuery =
        "email send notification alert message user gmail sendgrid smtp mail inbox outbox draft compose reply forward attachment " +
        "email send notification alert message user gmail sendgrid smtp mail inbox outbox draft compose reply forward attachment";

      const results = await toolFinder.findTools(longQuery, mockTools);

      expect(results.length).toBeGreaterThan(0);
      const emailTool = results.find((r) => r.id === "send-email");
      expect(emailTool).toBeDefined();
    });

    it("should handle unicode characters in query", async () => {
      const toolWithUnicode: Tool = {
        id: "unicode-tool",
        instruction: "Send notification to 用户",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Enviar mensaje",
              method: HttpMethod.POST,
              urlHost: "https://api.example.com",
              urlPath: "/send",
            },
            responseMapping: "$",
          },
        ],
      };

      const results1 = await toolFinder.findTools("用户", [toolWithUnicode]);
      expect(results1).toHaveLength(1);

      const results2 = await toolFinder.findTools("mensaje", [toolWithUnicode]);
      expect(results2).toHaveLength(1);
    });

    it("should handle regex special characters in query", async () => {
      const toolWithRegexChars: Tool = {
        id: "regex-tool",
        instruction: "Process data with pattern [a-z]+ and (test)",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Match pattern",
              method: HttpMethod.POST,
              urlHost: "https://api.example.com",
              urlPath: "/match",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("[a-z]+ (test)", [toolWithRegexChars]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("regex-tool");
    });

    it("should handle tools with null values in various fields", async () => {
      const toolWithNulls: Tool = {
        id: "null-fields-tool",
        instruction: null as any,
        inputSchema: null as any,
        responseSchema: null as any,
        steps: [
          {
            id: "step-1",
            integrationId: null as any,
            apiConfig: {
              id: "step-1",
              instruction: null as any,
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("null-fields-tool", [toolWithNulls]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("null-fields-tool");
      expect(results[0].instruction).toBeNull();
    });

    it("should handle tools with very long text content", async () => {
      const longInstruction = "A".repeat(10000);
      const toolWithLongText: Tool = {
        id: "long-text-tool",
        instruction: longInstruction,
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Short instruction",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("long-text-tool", [toolWithLongText]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("long-text-tool");
    });

    it("should handle empty string in step integrationId", async () => {
      const toolWithEmptyIntegrationId: Tool = {
        id: "empty-integration-id",
        instruction: "Tool with empty integration ID",
        steps: [
          {
            id: "step-1",
            integrationId: "",
            apiConfig: {
              id: "step-1",
              instruction: "Do something",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("empty", [toolWithEmptyIntegrationId]);

      expect(results).toHaveLength(1);
      expect(results[0].steps[0].integrationId).toBe("");
    });

    it("should handle query with only numbers", async () => {
      const results = await toolFinder.findTools("12345", mockTools);

      expect(results).toHaveLength(4);
      expect(
        results.every((r) => r.reason === "No specific match found, but this tool is available"),
      ).toBe(true);
    });

    it("should handle duplicate keywords in query", async () => {
      const results = await toolFinder.findTools("email email email send send", mockTools);

      expect(results.length).toBeGreaterThan(0);
      const emailTool = results.find((r) => r.id === "send-email");
      expect(emailTool).toBeDefined();
      expect(emailTool?.reason).toContain("send");
      expect(emailTool?.reason).toContain("email");
    });

    it("should handle tools with complex nested schemas", async () => {
      const toolWithSchemas: Tool = {
        id: "complex-schema-tool",
        instruction: "Tool with complex schemas",
        inputSchema: {
          type: "object",
          properties: {
            nested: {
              type: "object",
              properties: {
                deeplyNested: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
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
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Process",
              method: HttpMethod.POST,
              urlHost: "https://api.example.com",
              urlPath: "/process",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("complex", [toolWithSchemas]);

      expect(results).toHaveLength(1);
      expect(results[0].inputSchema).toBeDefined();
      expect(results[0].responseSchema).toBeDefined();
    });

    it("should handle multiple tools with same score (stable sort)", async () => {
      const tool1: Tool = {
        id: "tool-a",
        instruction: "Process data",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Step 1",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const tool2: Tool = {
        id: "tool-b",
        instruction: "Process information",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Step 1",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const tool3: Tool = {
        id: "tool-c",
        instruction: "Process records",
        steps: [
          {
            id: "step-1",
            apiConfig: {
              id: "step-1",
              instruction: "Step 1",
              method: HttpMethod.GET,
              urlHost: "https://api.example.com",
              urlPath: "/test",
            },
            responseMapping: "$",
          },
        ],
      };

      const results = await toolFinder.findTools("process", [tool1, tool2, tool3]);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.reason.includes("process"))).toBe(true);
    });

    it("should handle single character query", async () => {
      const results = await toolFinder.findTools("s", mockTools);

      const slackTool = results.find((r) => r.id === "slack-notification");
      expect(slackTool).toBeDefined();
    });

    it("should handle query with tab and newline characters", async () => {
      const results = await toolFinder.findTools("email\t\nsend\n\tgmail", mockTools);

      const emailTool = results.find((r) => r.id === "send-email");
      expect(emailTool).toBeDefined();
      expect(emailTool?.reason).toContain("email");
    });

    it("should handle tools array with undefined elements", async () => {
      const toolsWithUndefined = [mockTools[0], undefined as any, mockTools[1]];

      await expect(async () => {
        await toolFinder.findTools("email", toolsWithUndefined);
      }).rejects.toThrow();
    });

    it("should handle extremely large number of tools efficiently", async () => {
      const manyTools: Tool[] = [];
      for (let i = 0; i < 1000; i++) {
        manyTools.push({
          id: `tool-${i}`,
          instruction: `Tool number ${i}`,
          steps: [
            {
              id: "step-1",
              apiConfig: {
                id: "step-1",
                instruction: `Process ${i}`,
                method: HttpMethod.GET,
                urlHost: "https://api.example.com",
                urlPath: `/test/${i}`,
              },
              responseMapping: "$",
            },
          ],
        });
      }

      const startTime = Date.now();
      const results = await toolFinder.findTools("tool-500", manyTools);
      const endTime = Date.now();

      expect(results.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000);

      const exactMatch = results.find((r) => r.id === "tool-500");
      expect(exactMatch).toBeDefined();
    });

    it("should handle query with only stopwords", async () => {
      const results = await toolFinder.findTools("the a an", mockTools);

      expect(results).toHaveLength(4);
    });

    it("should preserve tool order when all have same score", async () => {
      const results = await toolFinder.findTools("xyz", mockTools);

      expect(results).toHaveLength(4);
      expect(results.map((r) => r.id)).toEqual([
        "send-email",
        "fetch-users",
        "slack-notification",
        "github-create-issue",
      ]);
    });
  });
});
