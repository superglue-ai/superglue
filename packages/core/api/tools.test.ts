import {
  HttpMethod,
  RunStatus,
  Tool,
  mapFailureBehavior,
  mapPaginationType,
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
      expect(result.tool).toEqual({ id: "tool-123", version: "1.0.0" });
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

    it("should map stepResults", () => {
      const result = buildRunResponse({
        ...baseParams,
        stepResults: [
          { stepId: "step-1", success: true, data: { foo: "bar" } },
          { stepId: "step-2", success: false, error: "Failed" },
        ],
      });

      expect(result.stepResults).toEqual([
        { stepId: "step-1", success: true, data: { foo: "bar" }, error: undefined },
        { stepId: "step-2", success: false, data: undefined, error: "Failed" },
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

      expect(result.tool).toEqual({ id: "tool-123", version: "2.5.0" });
    });
  });
});
