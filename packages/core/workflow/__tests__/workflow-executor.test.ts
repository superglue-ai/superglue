import { ExecutionStep, HttpMethod, Integration, Workflow } from "@superglue/client";
import { describe, expect, it, vi } from "vitest";
import { WorkflowExecutor } from "../workflow-executor.js";

// Mock dependencies
vi.mock("../../utils/tools.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    applyJsonata: vi.fn().mockImplementation(async (data, expr) => {
      // Simple mock implementation that returns data for basic expressions
      if (expr === "$") return data;
      if (expr === "$.fetchTodos[0].userId") return 1;
      return data;
    }),
    applyTransformationWithValidation: vi.fn().mockImplementation(async (data, transform) => {
      return { success: true, data };
    })
  };
});

vi.mock("../../utils/transform.js", () => ({
  generateTransformCode: vi.fn().mockImplementation(async () => {
    return { 
      mappingCode: "$",
      confidence: 90,
      data: { test: "data" }
    };
  })
}));

vi.mock("../../utils/logs.js", () => ({
  logMessage: vi.fn()
}));

describe("WorkflowExecutor", () => {
  it("should initialize with proper default values", () => {
    const workflow: Workflow = {
      id: "test-workflow",
      steps: [
        {
          id: "step1",
          apiConfig: {
            id: "api1",
            urlHost: "https://api.example.com",
            urlPath: "/v1/data",
            method: HttpMethod.GET
          }
        }
      ]
    };

    const executor = new WorkflowExecutor(workflow, {});
    expect(executor.id).toBe("test-workflow");
    expect(executor.steps).toEqual(workflow.steps);
    expect(executor.finalTransform).toBe("$");
    expect(executor.result).toBeDefined();
    expect(executor.result.success).toBe(false); // Starts as false until execution
    expect(executor.result.data).toBeDefined();
    expect(executor.result.stepResults).toEqual([]);
  });

  it("should validate input properly", async () => {
    // Workflow without ID
    const invalidWorkflow1 = {
      steps: [{ id: "step1", apiConfig: { id: "api1" } }]
    } as unknown as Workflow;

    const executor1 = new WorkflowExecutor(invalidWorkflow1, {});
    await expect(executor1.execute({}, {})).rejects.toThrow("Workflow must have a valid ID");

    // Workflow without steps array
    const invalidWorkflow2 = {
      id: "test",
      steps: null
    } as unknown as Workflow;

    const executor2 = new WorkflowExecutor(invalidWorkflow2, {});
    await expect(executor2.execute({}, {})).rejects.toThrow("Execution steps must be an array");

    // Workflow with step missing ID
    const invalidWorkflow3 = {
      id: "test",
      steps: [{ apiConfig: { id: "api1" } }] as unknown as ExecutionStep[]
    } as Workflow;

    const executor3 = new WorkflowExecutor(invalidWorkflow3, {});
    await expect(executor3.execute({}, {})).rejects.toThrow("Each step must have an ID");

    // Workflow with step missing apiConfig
    const invalidWorkflow4 = {
      id: "test",
      steps: [{ id: "step1" }] as unknown as ExecutionStep[]
    } as Workflow;

    const executor4 = new WorkflowExecutor(invalidWorkflow4, {});
    await expect(executor4.execute({}, {})).rejects.toThrow("Each step must have an API config");
  });

  it("should handle integration credentials", async () => {
    const workflow: Workflow = {
      id: "test-workflow-with-integrations",
      steps: [
        {
          id: "step1",
          integrationId: "integration1",
          apiConfig: {
            id: "api1",
            urlHost: "https://api.example.com",
            urlPath: "/v1/data",
            method: HttpMethod.GET
          }
        }
      ]
    };

    const integrations: Integration[] = [
      {
        id: "integration1",
        name: "Test Integration",
        credentials: {
          apiKey: "secret-key"
        }
      }
    ];

    const executor = new WorkflowExecutor(workflow, {}, integrations);
    
    // Mock selectStrategy to prevent execution but allow testing integration mapping
    const mockStrategy = {
      execute: vi.fn().mockResolvedValue({
        stepId: "step1",
        success: true,
        transformedData: { result: "success" }
      })
    };
    vi.spyOn(require("../workflow-strategies.js"), "selectStrategy").mockReturnValue(mockStrategy);
    
    await executor.execute({}, {});
    
    // Verify integration was correctly mapped and passed to strategy execution
    expect(mockStrategy.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: "step1", integrationId: "integration1" }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ id: "integration1" })
    );
  });

  it("should handle step failures gracefully", async () => {
    const workflow: Workflow = {
      id: "test-workflow-with-failure",
      steps: [
        {
          id: "step1",
          apiConfig: {
            id: "api1",
            urlHost: "https://api.example.com",
            urlPath: "/v1/data",
            method: HttpMethod.GET
          }
        }
      ]
    };

    const executor = new WorkflowExecutor(workflow, {});
    
    // Mock selectStrategy to simulate a failed step
    const mockStrategy = {
      execute: vi.fn().mockRejectedValue(new Error("API call failed"))
    };
    vi.spyOn(require("../workflow-strategies.js"), "selectStrategy").mockReturnValue(mockStrategy);
    
    const result = await executor.execute({}, {});
    
    // Verify error handling
    expect(result.success).toBe(false);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].success).toBe(false);
    expect(result.stepResults[0].error).toBeDefined();
    expect(result.error).toBeDefined();
  });
});