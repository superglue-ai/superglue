import { ApiConfig, HttpMethod, System, ExecutionStep, Tool } from "@superglue/shared";
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
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch data",
              urlHost: "https://api.example.com",
              urlPath: "/data",
              method: "GET" as HttpMethod,
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
      expect(executor.systemIds).toEqual(["test-system"]);
    });

    it("should register execution strategies", () => {
      const tool: Tool = {
        id: "test-tool",
        systemIds: [],
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
        systemIds: [],
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
        systemIds: [],
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
        systemIds: [],
        steps: [
          {
            id: "",
            apiConfig: { id: "config-1" },
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

    it("should throw error when step has no apiConfig", async () => {
      const tool = {
        id: "test-tool",
        systemIds: [],
        steps: [
          {
            id: "step-1",
            apiConfig: null as any,
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
      expect(result.error).toContain("Each step must have an API config");
    });
  });

  describe("step execution", () => {
    it("should execute a simple step successfully", async () => {
      const apiConfig: ApiConfig = {
        id: "config-1",
        instruction: "Fetch users",
        urlHost: "https://api.example.com",
        urlPath: "/users",
        method: "GET" as HttpMethod,
      };

      const tool: Tool = {
        id: "test-tool",
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig,
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
        systemIds: ["missing-system"],
        steps: [
          {
            id: "step-1",
            systemId: "missing-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch data",
              urlHost: "https://api.example.com",
              urlPath: "/data",
              method: "GET" as HttpMethod,
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
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch data",
              urlHost: "https://api.example.com",
              urlPath: "/data",
              method: "GET" as HttpMethod,
            },
            failureBehavior: "CONTINUE",
          },
          {
            id: "step-2",
            systemId: "test-system",
            apiConfig: {
              id: "config-2",
              instruction: "Fetch more data",
              urlHost: "https://api.example.com",
              urlPath: "/more-data",
              method: "GET" as HttpMethod,
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
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch data",
              urlHost: "https://api.example.com",
              urlPath: "/data",
              method: "GET" as HttpMethod,
            },
            failureBehavior: "FAIL", // Default behavior
          },
          {
            id: "step-2",
            systemId: "test-system",
            apiConfig: {
              id: "config-2",
              instruction: "Should not run",
              urlHost: "https://api.example.com",
              urlPath: "/never",
              method: "GET" as HttpMethod,
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
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch user details",
              urlHost: "https://api.example.com",
              urlPath: "/users/{{currentItem.id}}",
              method: "GET" as HttpMethod,
            },
            loopSelector: "(data) => [{ id: 1 }, { id: 2 }, { id: 3 }]",
            executionMode: "LOOP",
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
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch user details",
              urlHost: "https://api.example.com",
              urlPath: "/users/{{currentItem.id}}",
              method: "GET" as HttpMethod,
            },
            loopSelector: "(data) => [{ id: 1 }, { id: 2 }, { id: 3 }]",
            executionMode: "LOOP",
            failureBehavior: "CONTINUE",
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
      const originalConfig: ApiConfig = {
        id: "config-1",
        instruction: "Fetch users",
        urlHost: "https://api.example.com",
        urlPath: "/v1/users",
        method: "GET" as HttpMethod,
      };

      const tool: Tool = {
        id: "test-tool",
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: originalConfig,
            loopSelector: "(data) => data",
          },
        ],
        instruction: "Test instruction",
        inputSchema: { type: "object" },
        responseSchema: { type: "object" },
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
      expect(result.config).toBeDefined();
      expect(result.config.id).toBe("test-tool");
      expect(result.config.systemIds).toEqual(["test-system"]);
      expect(result.config.steps).toHaveLength(1);
      expect(result.config.instruction).toBe("Test instruction");
    });
  });

  describe("credential handling", () => {
    it("should merge system credentials with provided credentials", async () => {
      const tool: Tool = {
        id: "test-tool",
        systemIds: ["test-system"],
        steps: [
          {
            id: "step-1",
            systemId: "test-system",
            apiConfig: {
              id: "config-1",
              instruction: "Fetch data",
              urlHost: "https://api.example.com",
              urlPath: "/data",
              method: "GET" as HttpMethod,
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
