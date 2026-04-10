import {
  HttpMethod,
  RunStatus,
  Tool,
  isRequestConfig,
  mapFailureBehavior,
  mapPaginationType,
  validateToolStructure,
} from "@superglue/shared";
import { describe, expect, it } from "vitest";
import { buildRunResponse } from "./tools.js";

describe("tools API helpers", () => {
  describe("mapPaginationType", () => {
    it("should map all known pagination types", () => {
      expect(mapPaginationType("OFFSET_BASED")).toBe("offsetBased");
      expect(mapPaginationType("PAGE_BASED")).toBe("pageBased");
      expect(mapPaginationType("CURSOR_BASED")).toBe("cursorBased");
      expect(mapPaginationType("DISABLED")).toBe("disabled");
    });

    it("should return disabled for undefined input", () => {
      expect(mapPaginationType(undefined)).toBe("disabled");
    });

    it("should return unknown types as-is", () => {
      expect(mapPaginationType("CUSTOM_TYPE")).toBe("CUSTOM_TYPE");
    });
  });

  describe("mapFailureBehavior", () => {
    it("should map fail behavior", () => {
      expect(mapFailureBehavior("FAIL")).toBe("fail");
      expect(mapFailureBehavior("fail")).toBe("fail");
    });

    it("should map continue behavior", () => {
      expect(mapFailureBehavior("CONTINUE")).toBe("continue");
      expect(mapFailureBehavior("continue")).toBe("continue");
    });

    it("should return undefined for undefined input", () => {
      expect(mapFailureBehavior(undefined)).toBeUndefined();
    });
  });

  describe("tool validation", () => {
    it("should reject steps without an id", () => {
      const result = validateToolStructure({
        id: "list-drive-files",
        instruction: "List files",
        steps: [{}],
      });

      expect(result).toEqual({
        valid: false,
        error: "Step 1: missing 'id'",
      });
    });

    it("should reject steps without a config", () => {
      const result = validateToolStructure({
        id: "list-drive-files",
        instruction: "List files",
        steps: [{ id: "listFiles" }],
      });

      expect(result).toEqual({
        valid: false,
        error: "Step 1 (listFiles): missing 'config'",
      });
    });

    it("should reject request steps without a url", () => {
      const result = validateToolStructure({
        id: "list-drive-files",
        instruction: "List files",
        steps: [
          {
            id: "listFiles",
            config: {
              method: HttpMethod.GET,
            },
          },
        ],
      });

      expect(result).toEqual({
        valid: false,
        error: "Step 1 (listFiles): request step missing 'url'",
      });
    });

    it("should reject request steps with a non-string url", () => {
      const result = validateToolStructure({
        id: "list-drive-files",
        instruction: "List files",
        steps: [
          {
            id: "listFiles",
            config: {
              method: HttpMethod.GET,
              url: 123,
            },
          },
        ],
      });

      expect(result).toEqual({
        valid: false,
        error: "Step 1 (listFiles): request step missing 'url'",
      });
    });

    it("should accept valid request steps", () => {
      const result = validateToolStructure({
        id: "list-drive-files",
        instruction: "List files",
        steps: [
          {
            id: "listFiles",
            config: {
              method: HttpMethod.GET,
              url: "https://example.com/files",
            },
          },
        ],
      });

      expect(result).toEqual({ valid: true });
    });
  });

  describe("isRequestConfig", () => {
    it("should return false for undefined config", () => {
      expect(isRequestConfig(undefined)).toBe(false);
      expect(isRequestConfig(null)).toBe(false);
    });

    it("should return true for url-based request configs without an explicit type", () => {
      expect(
        isRequestConfig({
          url: "https://example.com/files",
          method: HttpMethod.GET,
        } as any),
      ).toBe(true);
    });
  });

  describe("buildRunResponse", () => {
    const baseTool: Tool = {
      id: "tool-123",
      instruction: "Test tool",
      steps: [],
    };

    const baseParams = {
      runId: "run-456",
      tool: baseTool,
      status: RunStatus.SUCCESS,
      requestSource: "api",
      startedAt: new Date("2024-01-01T10:00:00Z"),
    };

    it("should build basic run response", () => {
      const result = buildRunResponse(baseParams);

      expect(result.runId).toBe("run-456");
      expect(result.toolId).toBe("tool-123");
      // Tool is passed through as-is (full tool object)
      expect(result.tool).toEqual(baseTool);
      expect(result.status).toBe("success");
      expect(result.requestSource).toBe("api");
    });

    it("should include metadata with startedAt", () => {
      const result = buildRunResponse(baseParams);

      expect(result.metadata.startedAt).toBe("2024-01-01T10:00:00.000Z");
      expect(result.metadata.completedAt).toBeUndefined();
      expect(result.metadata.durationMs).toBeUndefined();
    });

    it("should calculate duration when completedAt is provided", () => {
      const result = buildRunResponse({
        ...baseParams,
        completedAt: new Date("2024-01-01T10:01:00Z"),
      });

      expect(result.metadata.completedAt).toBe("2024-01-01T10:01:00.000Z");
      expect(result.metadata.durationMs).toBe(60000);
    });

    it("should include optional fields", () => {
      const result = buildRunResponse({
        ...baseParams,
        toolPayload: { input: "test" },
        data: { output: "result" },
        error: "Some error",
        traceId: "trace-789",
        options: { timeout: 30000 },
      });

      expect(result.toolPayload).toEqual({ input: "test" });
      expect(result.data).toEqual({ output: "result" });
      expect(result.error).toBe("Some error");
      expect(result.traceId).toBe("trace-789");
      expect(result.options).toEqual({ timeout: 30000 });
    });

    it("should map stepResults without data to reduce payload size", () => {
      const result = buildRunResponse({
        ...baseParams,
        stepResults: [
          { stepId: "step-1", success: true, data: { foo: "bar" } },
          { stepId: "step-2", success: false, error: "Failed" },
        ],
      });

      // Data is excluded from step results to reduce response size
      expect(result.stepResults).toEqual([
        { stepId: "step-1", success: true, error: undefined },
        { stepId: "step-2", success: false, error: "Failed" },
      ]);
    });

    it("should map all run statuses correctly", () => {
      expect(buildRunResponse({ ...baseParams, status: RunStatus.RUNNING }).status).toBe("running");
      expect(buildRunResponse({ ...baseParams, status: RunStatus.SUCCESS }).status).toBe("success");
      expect(buildRunResponse({ ...baseParams, status: RunStatus.FAILED }).status).toBe("failed");
      expect(buildRunResponse({ ...baseParams, status: RunStatus.ABORTED }).status).toBe("aborted");
    });

    it("should use tool version if provided", () => {
      const toolWithVersion = { ...baseTool, version: "2.5.0" };
      const result = buildRunResponse({ ...baseParams, tool: toolWithVersion });

      // Tool is passed through as-is (full tool object)
      expect(result.tool).toEqual(toolWithVersion);
    });
  });
});
