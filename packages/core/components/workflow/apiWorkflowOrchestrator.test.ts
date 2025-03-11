import { HttpMethod } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWorkflowOrchestrator } from "./apiWorkflowOrchestrator.js";
import type { ExecutionPlan } from "./domain/workflow.types.js";

// Mock the tools module
vi.mock("../../utils/tools.js", () => ({
  applyJsonataWithValidation: vi.fn().mockImplementation(() => {
    return {
      success: true,
      data: {
        getUserData: { id: 1, name: "Test User" },
        getData: { id: 2, name: "Test Data" },
      },
    };
  }),
}));

// Mock the api module
vi.mock("../../utils/api.js", () => ({
  callEndpoint: vi.fn().mockImplementation(() => {
    return Promise.resolve({ data: { result: "mocked data" } });
  }),
  generateApiConfig: vi.fn().mockImplementation((apiInput) => {
    return Promise.resolve({
      config: {
        id: "mock_config_id",
        urlHost: apiInput.urlHost,
        urlPath: apiInput.urlPath,
        method: apiInput.method,
        instruction: apiInput.instruction,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
    });
  }),
}));

// Mock documentation module
vi.mock("../../utils/documentation.js", () => ({
  getDocumentation: vi.fn().mockImplementation(() => {
    return Promise.resolve("Mock API documentation");
  }),
}));

// Mock schema module
vi.mock("../../utils/schema.js", () => ({
  generateSchema: vi.fn().mockImplementation(() => {
    return Promise.resolve("{}");
  }),
}));

describe("ApiWorkflowOrchestrator", () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should orchestrate a simple chain of two calls", async () => {
    const orchestrator = new ApiWorkflowOrchestrator();
    const result = await orchestrator.handleSimpleChain({ foo: "bar" }, {});
    expect(result).toHaveProperty("firstResult");
    expect(result).toHaveProperty("secondResult");
  });

  it("should execute a manually defined workflow plan", async () => {
    // Create a minimal workflow orchestrator
    const orchestrator = new ApiWorkflowOrchestrator();

    // Set up API documentation
    await orchestrator.retrieveApiDocumentation(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      "https://jsonplaceholder.typicode.com",
    );

    // Define a simple execution plan
    const plan: ExecutionPlan = {
      id: "test_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
      steps: [
        {
          id: "getUserData",
          description: "Get user data",
          endpoint: "/users/1",
          method: HttpMethod.GET,
        },
      ],
      finalTransform: "$",
    };

    // Register the plan
    const planId = await orchestrator.registerExecutionPlan(plan);
    expect(planId).toBe("test_plan");

    // Define input/output mappings for steps
    await orchestrator.setStepMapping(planId, "getUserData", {
      inputMapping: "$",
      responseMapping: "$",
    });

    // Execute the workflow plan
    const result = await orchestrator.executeWorkflowPlan(planId, { query: "test" }, { apiKey: "fake-key" });

    // Check the result
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("getUserData");
    expect(result.stepResults).toHaveProperty("getUserData");
    expect(result.stepResults.getUserData.success).toBe(true);
  });

  it("should handle a workflow with a complete input object", async () => {
    const orchestrator = new ApiWorkflowOrchestrator();

    // Set up API documentation first
    await orchestrator.retrieveApiDocumentation(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      "https://jsonplaceholder.typicode.com",
    );

    // Create a plan to include directly in the input
    const plan: ExecutionPlan = {
      id: "inline_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
      steps: [
        {
          id: "getData",
          description: "Get data",
          endpoint: "/users/1",
          method: HttpMethod.GET,
        },
      ],
      finalTransform: "$",
    };

    // Use the executeWorkflow method with a complete input object
    const result = await orchestrator.executeWorkflow({
      plan,
      payload: { test: true },
      credentials: { apiKey: "test-key" },
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.stepResults).toHaveProperty("getData");
  });
});
