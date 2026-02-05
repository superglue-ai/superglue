import { getToolSystemIds, HttpMethod, System, Tool } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../datastore/memory.js";
import { SystemManager } from "../systems/system-manager.js";
import { ToolExecutor } from "./tool-executor.js";

describe("ToolExecutor", () => {
  let dataStore: MemoryStore;
  let mockSystem: System;

  beforeEach(() => {
    vi.clearAllMocks();
    dataStore = new MemoryStore();

    mockSystem = {
      id: "test-system",
      name: "Test System",
      credentials: { apiKey: "test-key" },
      specificInstructions: "Test instructions",
      orgId: "test-org",
    } as System;
  });

  describe("constructor", () => {
    it("should initialize with tool configuration", () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch data",
            config: {
              url: "https://api.example.com/data",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org", traceId: "test-trace" },
        systems: [systemManager],
      });

      expect(executor.id).toBe("test-tool");
      expect(executor.steps).toHaveLength(1);
      expect(getToolSystemIds(executor)).toEqual(["test-system"]);
    });

    it("should register execution strategies", () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [],
      });

      // Verify strategy registry is initialized (private, but we can test behavior)
      expect(executor).toBeDefined();
    });
  });

  describe("validation", () => {
    it("should throw error when tool has no ID", async () => {
      const tool = {
        id: "",
        steps: [],
      } as Tool;

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [],
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool must have a valid ID");
    });

    it("should throw error when steps is not an array", async () => {
      const tool = {
        id: "test-tool",
        steps: null as any,
      } as Tool;

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [],
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Execution steps must be an array");
    });

    it("should throw error when step has no ID", async () => {
      const tool = {
        id: "test-tool",
        steps: [
          {
            id: "",
            config: { url: "https://example.com" },
          },
        ],
      } as Tool;

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [],
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Each step must have an ID");
    });

    it("should throw error when step has no config", async () => {
      const tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            config: null as any,
          },
        ],
      } as Tool;

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [],
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Each step must have a config");
    });
  });

  describe("step execution", () => {
    it("should execute a simple step successfully", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch users",
            config: {
              url: "https://api.example.com/users",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org", traceId: "test-trace" },
        systems: [systemManager],
      });

      // Mock strategy execution
      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockResolvedValue({
        success: true,
        strategyExecutionData: { users: [{ id: 1, name: "John" }] },
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].success).toBe(true);
    });

    it("should fail when system is not found", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch data",
            config: {
              url: "https://api.example.com/data",
              method: "GET" as HttpMethod,
              systemId: "missing-system",
            },
          },
        ],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [], // No systems provided
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("System 'missing-system' not found");
    });

    it("should handle step failure with CONTINUE behavior", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch data",
            config: {
              url: "https://api.example.com/data",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
            failureBehavior: "continue",
          },
          {
            id: "step-2",
            instruction: "Fetch more data",
            config: {
              url: "https://api.example.com/more-data",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [systemManager],
      });

      let callCount = 0;
      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            success: false,
            strategyExecutionData: undefined,
            error: "First step failed",
          };
        }
        return {
          success: true,
          strategyExecutionData: { data: "success" },
        };
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      // With CONTINUE behavior, execution should continue to step 2
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[1].success).toBe(true);
    });

    it("should stop execution on step failure without CONTINUE behavior", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch data",
            config: {
              url: "https://api.example.com/data",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
            failureBehavior: "fail", // Default behavior
          },
          {
            id: "step-2",
            instruction: "Should not run",
            config: {
              url: "https://api.example.com/never",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [systemManager],
      });

      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockResolvedValue({
        success: false,
        strategyExecutionData: undefined,
        error: "API error",
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      // Only first step should have been attempted
      expect(result.stepResults).toHaveLength(1);
    });
  });

  describe("loop execution", () => {
    it("should execute loop steps with array data selector output", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch user details",
            config: {
              url: "https://api.example.com/users/{{currentItem.id}}",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
            dataSelector: "(data) => [{ id: 1 }, { id: 2 }, { id: 3 }]",
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [systemManager],
      });

      let callCount = 0;
      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockImplementation(async () => {
        callCount++;
        return {
          success: true,
          strategyExecutionData: { userId: callCount, name: `User ${callCount}` },
        };
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(3); // Should have executed 3 times
      expect(result.stepResults[0].data).toHaveLength(3);
    });

    it("should handle loop iteration failures with CONTINUE behavior", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch user details",
            config: {
              url: "https://api.example.com/users/{{currentItem.id}}",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
            dataSelector: "(data) => [{ id: 1 }, { id: 2 }, { id: 3 }]",
            failureBehavior: "continue",
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [systemManager],
      });

      let callCount = 0;
      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          return {
            success: false,
            strategyExecutionData: undefined,
            error: "Second iteration failed",
          };
        }
        return {
          success: true,
          strategyExecutionData: { userId: callCount },
        };
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(3); // All 3 iterations should run
      expect(result.stepResults[0].data).toHaveLength(3);
      expect(result.stepResults[0].data[1].success).toBe(false); // Second iteration failed
    });
  });

  describe("config propagation", () => {
    it("should return updated config in result", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch users",
            config: {
              url: "https://api.example.com/v1/users",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
            dataSelector: "(data) => data",
          },
        ],
        instruction: "Test instruction",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [systemManager],
      });

      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockResolvedValue({
        success: true,
        strategyExecutionData: { users: [] },
      });

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(true);
      expect(result.tool).toBeDefined();
      expect(result.tool.id).toBe("test-tool");
      expect(getToolSystemIds(result.tool)).toEqual(["test-system"]);
      expect(result.tool.steps).toHaveLength(1);
      expect(result.tool.instruction).toBe("Test instruction");
    });
  });

  describe("credential handling", () => {
    it("should merge system credentials with provided credentials", async () => {
      const tool: Tool = {
        id: "test-tool",
        steps: [
          {
            id: "step-1",
            instruction: "Fetch data",
            config: {
              url: "https://api.example.com/data",
              method: "GET" as HttpMethod,
              systemId: "test-system",
            },
          },
        ],
      };

      const systemManager = SystemManager.fromSystem(mockSystem, dataStore, {
        orgId: "test-org",
      });

      const executor = new ToolExecutor({
        tool,
        metadata: { orgId: "test-org" },
        systems: [systemManager],
      });

      let capturedCredentials: Record<string, string> | undefined;
      vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockImplementation(
        async ({ credentials }) => {
          capturedCredentials = credentials;
          return {
            success: true,
            strategyExecutionData: { data: "test" },
          };
        },
      );

      await executor.execute({
        payload: {},
        credentials: { customKey: "custom-value" },
        options: {},
      });

      // Should have both system credentials (namespaced) and custom credentials
      expect(capturedCredentials).toBeDefined();
      expect(capturedCredentials?.customKey).toBe("custom-value");
      // System credentials should be namespaced with system ID
      expect(capturedCredentials?.["test-system_apiKey"]).toBe("test-key");
    });
  });
});
