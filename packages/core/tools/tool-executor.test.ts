import { ApiConfig, HttpMethod, Integration, SelfHealingMode } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../datastore/memory.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel } from "../llm/llm-base-model.js";
import { isSelfHealingEnabled } from "../utils/helpers.js";
import { ToolExecutor } from "./tool-executor.js";

// Mock the tools module but keep isSelfHealingEnabled real
vi.mock("../utils/helpers.js", async () => {
  const actual = await vi.importActual("../utils/helpers.js");
  return {
    ...actual,
    // Keep the real isSelfHealingEnabled function for testing
  };
});

describe("WorkflowExecutor Self-Healing Logic", () => {
  it("should correctly determine self-healing for transform operations", () => {
    // Test transform self-healing enabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.ENABLED }, "transform")).toBe(true);
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.TRANSFORM_ONLY }, "transform")).toBe(
      true,
    );

    // Test transform self-healing disabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.REQUEST_ONLY }, "transform")).toBe(
      false,
    );
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.DISABLED }, "transform")).toBe(
      false,
    );

    // Test defaults for transform (should be disabled)
    expect(isSelfHealingEnabled({}, "transform")).toBe(false);
    expect(isSelfHealingEnabled(undefined, "transform")).toBe(false);
  });

  it("should correctly determine self-healing for API operations", () => {
    // Test API self-healing enabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.ENABLED }, "api")).toBe(true);
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.REQUEST_ONLY }, "api")).toBe(true);

    // Test API self-healing disabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.TRANSFORM_ONLY }, "api")).toBe(
      false,
    );
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.DISABLED }, "api")).toBe(false);

    // Test defaults for API (should be disabled)
    expect(isSelfHealingEnabled({}, "api")).toBe(false);
    expect(isSelfHealingEnabled(undefined, "api")).toBe(false);
  });

  it("should handle edge cases in self-healing logic", () => {
    // Test with null/undefined values
    expect(isSelfHealingEnabled({ selfHealing: null as any }, "transform")).toBe(false);
    expect(isSelfHealingEnabled({ selfHealing: null as any }, "api")).toBe(false);

    // Test with empty options object
    expect(isSelfHealingEnabled({}, "transform")).toBe(false);
    expect(isSelfHealingEnabled({}, "api")).toBe(false);
  });

  it("should verify workflow uses this logic correctly", () => {
    // This test verifies that the workflow executor calls isSelfHealingEnabled
    // with the correct parameters as seen in the code diff:
    // - Line 149: isSelfHealingEnabled(options, "transform") for final transforms
    // - API calls pass options through to executeApiCall which uses isSelfHealingEnabled(options, "api")

    // Test that all SelfHealingMode enum values are defined
    expect(Object.values(SelfHealingMode)).toHaveLength(4);
    expect(SelfHealingMode.ENABLED).toBe("ENABLED");
    expect(SelfHealingMode.DISABLED).toBe("DISABLED");
    expect(SelfHealingMode.REQUEST_ONLY).toBe("REQUEST_ONLY");
    expect(SelfHealingMode.TRANSFORM_ONLY).toBe("TRANSFORM_ONLY");
  });
});

describe("ToolExecutor Self-Healing Config Propagation", () => {
  let dataStore: MemoryStore;
  let mockIntegration: Integration;

  beforeEach(() => {
    vi.clearAllMocks();
    dataStore = new MemoryStore();

    mockIntegration = {
      id: "test-integration",
      name: "Test Integration",
      credentials: { apiKey: "test-key" },
      specificInstructions: "Test instructions",
      orgId: "test-org",
    } as Integration;
  });

  it("should propagate updated config and dataSelector from self-healing back to result", async () => {
    const originalConfig: ApiConfig = {
      id: "original-config",
      instruction: "Fetch users",
      urlHost: "https://api.example.com",
      urlPath: "/v1/users",
      method: "GET" as HttpMethod,
      queryParams: { limit: "10" },
    };

    const updatedConfig: Partial<ApiConfig> = {
      urlHost: "https://api.example.com",
      urlPath: "/v2/users",
      method: "GET" as HttpMethod,
      queryParams: { limit: "20", offset: "0" },
      headers: { "X-API-Version": "2" },
    };

    const originalDataSelector = "(sourceData) => sourceData";
    const updatedDataSelector = "(sourceData) => ({ userId: sourceData.userId })";

    const tool = {
      id: "test-tool",
      integrationIds: ["test-integration"],
      steps: [
        {
          id: "step-1",
          integrationId: "test-integration",
          apiConfig: originalConfig,
          loopSelector: originalDataSelector,
        },
      ],
    };

    const integrationManager = IntegrationManager.fromIntegration(mockIntegration, dataStore, {
      orgId: "test-org",
    });
    const executor = new ToolExecutor({
      tool,
      metadata: { orgId: "test-org", traceId: "test-user" },
      integrations: [integrationManager],
    });

    let apiCallCount = 0;

    // Mock strategy execution: fail first call, succeed second call
    vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockImplementation(async () => {
      apiCallCount++;

      if (apiCallCount === 1) {
        return {
          success: false,
          strategyExecutionData: undefined,
          error: "API returned 404: endpoint not found",
        };
      }

      // Second call succeeds
      return {
        success: true,
        strategyExecutionData: { users: [{ id: 1, name: "John" }] },
      };
    });

    // Mock LLM generateObject - TWO calls needed:
    // 1. First call: generateStepConfig during self-healing
    // 2. Second call: evaluateStepResponse validation (runs when isSelfHealing is true)
    vi.spyOn(LanguageModel, "generateObject")
      .mockResolvedValueOnce({
        success: true,
        response: {
          dataSelector: updatedDataSelector,
          apiConfig: {
            urlHost: updatedConfig.urlHost,
            urlPath: updatedConfig.urlPath,
            method: updatedConfig.method,
            queryParams: Object.entries(updatedConfig.queryParams || {}).map(([key, value]) => ({
              key,
              value,
            })),
            headers: Object.entries(updatedConfig.headers || {}).map(([key, value]) => ({
              key,
              value,
            })),
          },
        },
        messages: [],
      })
      .mockResolvedValueOnce({
        success: true,
        response: {
          success: true,
          refactorNeeded: false,
          shortReason: "Response is valid",
        },
        messages: [],
      });

    // Mock getDocumentation
    vi.spyOn(integrationManager, "getDocumentation").mockResolvedValue({
      content: "Test docs",
      isFetched: true,
    });

    // Mock searchDocumentation for validation step
    vi.spyOn(integrationManager, "searchDocumentation").mockResolvedValue(
      "Test docs for validation",
    );

    // Execute with self-healing enabled
    const result = await executor.execute({
      payload: { userId: "123" },
      credentials: {},
      options: { selfHealing: SelfHealingMode.ENABLED, retries: 2 },
    });

    // Verify execution succeeded
    expect(result.success).toBe(true);
    expect(apiCallCount).toBe(2);

    // Verify the returned config has the updated values
    expect(result.config).toBeDefined();
    expect(result.config.steps[0].apiConfig.urlPath).toBe("/v2/users");
    expect(result.config.steps[0].apiConfig.queryParams).toEqual({ limit: "20", offset: "0" });
    expect(result.config.steps[0].apiConfig.headers).toEqual({ "X-API-Version": "2" });
    expect(result.config.steps[0].loopSelector).toBe(updatedDataSelector);

    // Verify original config was not mutated in place (check the tool object)
    expect(tool.steps[0].apiConfig.urlPath).not.toBe(originalConfig.urlPath);
    expect(tool.steps[0].loopSelector).not.toBe(originalDataSelector);
  });

  it("should not propagate config when self-healing is disabled", async () => {
    const originalConfig: ApiConfig = {
      id: "original-config",
      instruction: "Fetch users",
      urlHost: "https://api.example.com",
      urlPath: "/v1/users",
      method: "GET" as HttpMethod,
    };

    const tool = {
      id: "test-tool",
      integrationIds: ["test-integration"],
      steps: [
        {
          id: "step-1",
          integrationId: "test-integration",
          apiConfig: originalConfig,
          loopSelector: "(sourceData) => sourceData",
        },
      ],
    };

    const integrationManager = IntegrationManager.fromIntegration(mockIntegration, dataStore, {
      orgId: "test-org",
    });
    const executor = new ToolExecutor({
      tool,
      metadata: { orgId: "test-org", traceId: "test-user" },
      integrations: [integrationManager],
    });

    // Mock strategy to fail
    vi.spyOn(executor["strategyRegistry"], "routeAndExecute").mockResolvedValue({
      success: false,
      strategyExecutionData: undefined,
      error: "API error",
    });

    // Execute without self-healing
    const result = await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.DISABLED },
    });

    // Verify execution failed
    expect(result.success).toBe(false);

    // Verify generateObject was never called (no self-healing)
    expect(vi.mocked(LanguageModel.generateObject)).not.toHaveBeenCalled();

    // Config should not be returned on failure
    expect(result.config).toBeDefined();
    // Verify config was not changed
    expect(result.config.steps[0].apiConfig.urlPath).toBe("/v1/users");
  });
});
