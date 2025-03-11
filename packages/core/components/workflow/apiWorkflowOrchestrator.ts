import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";
import { HttpMethod } from "@superglue/shared";
import { v4 as uuidv4 } from "uuid";
import { callEndpoint, generateApiConfig } from "../../utils/api.js";
import { getDocumentation } from "../../utils/documentation.js";
import { applyJsonataWithValidation } from "../../utils/tools.js";
import type {
  ExecutionPlan,
  ExecutionPlanId,
  ExecutionStep,
  StepMapping,
  StepMappings,
  WorkflowInput,
  WorkflowResult,
} from "./domain/workflow.types.js";

export class ApiWorkflowOrchestrator {
  private apiDocumentation: string;
  private executionPlans: Record<string, ExecutionPlan>;
  private stepMappings: Record<string, StepMappings>;
  private baseApiInput: ApiInput;

  constructor(baseApiInput: ApiInput) {
    this.apiDocumentation = "";
    this.executionPlans = {};
    this.stepMappings = {};
    this.baseApiInput = baseApiInput;
  }
  
  public setBaseApiInput(input: ApiInput): void {
    this.baseApiInput = input;
  }

  public getBaseApiInput(): ApiInput {
    return this.baseApiInput;
  }

  public getApiDocumentation(): string {
    return this.apiDocumentation;
  }

  public getExecutionPlans(): Record<string, ExecutionPlan> {
    return this.executionPlans;
  }

  public async executeWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
    try {
      // If we have a plan directly in the input, register it first
      if (input.plan) {
        const planId = input.plan.id || this.generatePlanId();
        await this.registerExecutionPlan(input.plan);
        return this.executeWorkflowPlan(planId, input.payload, input.credentials, input.options);
      }

      if (!input.planId) {
        throw new Error("Either a plan or a planId must be provided");
      }

      return this.executeWorkflowPlan(input.planId, input.payload, input.credentials, input.options);
    } catch (error) {
      return {
        success: false,
        error: String(error),
        data: {},
        stepResults: {},
        startedAt: new Date(),
        completedAt: new Date(),
      };
    }
  }

  public async registerExecutionPlan(plan: ExecutionPlan): Promise<ExecutionPlanId> {
    try {
      this.validateExecutionPlan(plan);
      const planId = plan.id || this.generatePlanId();
      const planWithId: ExecutionPlan = {
        ...plan,
        id: planId,
      };

      this.executionPlans[planId] = planWithId;

      return planId;
    } catch (error) {
      throw new Error(`Failed to register execution plan: ${String(error)}`);
    }
  }

  public async retrieveApiDocumentation(
    documentationUrl: string,
    headers?: Record<string, any>,
    queryParams?: Record<string, any>,
    apiHost?: string,
  ): Promise<void> {
    try {
      if (!documentationUrl) {
        throw new Error("Documentation URL is required");
      }
      const documentation = await getDocumentation(documentationUrl, headers || {}, queryParams || {}, apiHost);
      this.apiDocumentation = documentation;
    } catch (error) {
      throw new Error(`Failed to retrieve API documentation: ${String(error)}`);
    }
  }

  public async setStepMapping(planId: ExecutionPlanId, stepId: string, mapping: StepMapping): Promise<void> {
    // Initialize mappings for this plan if they don't exist
    if (!this.stepMappings[planId]) {
      this.stepMappings[planId] = {};
    }

    // Set the mapping for this step
    this.stepMappings[planId][stepId] = mapping;
  }

  // TODO: simplified method for testing
  public async handleSimpleChain(
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Record<string, unknown>> {
    // This is a simplified example of chaining two calls
    // In a real implementation, this would use a proper execution plan

    // Define a mock first step, using baseApiInput as template if available
    const firstStepConfig: ApiConfig = {
      ...(this.baseApiInput ? await generateApiConfig(this.baseApiInput, "").then(result => result.config) : {}),
      id: "first_step", 
      urlHost: "https://api.example.com",
      urlPath: "/first-endpoint",
      method: HttpMethod.GET,
      instruction: "Get initial data",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Make the first call
    const firstResult = await this.handleSingleApiCall(firstStepConfig, payload, credentials, options);

    // Define a mock second step that uses the first result
    const secondStepConfig: ApiConfig = {
      ...(this.baseApiInput ? await generateApiConfig(this.baseApiInput, "").then(result => result.config) : {}),
      id: "second_step",
      urlHost: "https://api.example.com",
      urlPath: "/second-endpoint",
      method: HttpMethod.GET,
      instruction: "Get additional data using the first result",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Make the second call
    const secondResult = await this.handleSingleApiCall(
      secondStepConfig,
      { ...payload, firstResult },
      credentials,
      options,
    );

    // Return the combined results
    return {
      firstResult,
      secondResult,
    };
  }

  public async executeWorkflowPlan(
    planId: ExecutionPlanId,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<WorkflowResult> {
    try {
      // 1. Get the execution plan
      const executionPlan = this.executionPlans[planId];

      if (!executionPlan) {
        throw new Error(`No execution plan found with ID ${planId}`);
      }

      // 2. Initialize the result object
      const result: WorkflowResult = {
        success: true,
        data: {},
        stepResults: {},
        startedAt: new Date(),
        completedAt: undefined,
      };

      console.log("Execution Plan: ", executionPlan);

      // 3. Execute each step in order
      for (const step of executionPlan.steps) {
        console.log("Step: ", step);
        try {
          // 4. Check dependencies (if any)
          if (step.dependencies && step.dependencies.length > 0) {
            for (const depId of step.dependencies) {
              if (!result.stepResults[depId] || !result.stepResults[depId].success) {
                throw new Error(`Dependency step ${depId} has not been executed successfully`);
              }
            }
          }

          // 5. Prepare input for this step using mappings if available
          const stepMapping = this.stepMappings[planId]?.[step.id];
          const stepInput = await this.prepareStepInput(step, stepMapping, result, payload);

          // 6. Configure the API call
          let apiConfig: ApiConfig;

          // Use manually configured API if available
          if (step.apiConfig) {
            apiConfig = step.apiConfig;
          }
          // Otherwise, generate it from the step information
          else {
            // Create an ApiInput derived from the baseApiInput if available and the step
            const apiInput: ApiInput = {
              ...(this.baseApiInput || {}),
              urlHost: executionPlan.apiHost,
              urlPath: step.endpoint,
              method: step.method as any,
              instruction: step.description,
            };

            // Fetch documentation if we don't have it yet
            if (!this.apiDocumentation) {
              throw new Error("No API documentation available. Please call retrieveApiDocumentation first.");
            }

            // Generate API config using existing utility
            const { config } = await generateApiConfig(apiInput, this.apiDocumentation);

            apiConfig = config;
          }

          // 7. Execute the API call
          const apiResponse = await this.handleSingleApiCall(apiConfig, stepInput, credentials, options);
          console.log("API Response: ", apiResponse);

          // 8. Process the result using response mapping
          let processedResult = apiResponse;
          if (stepMapping?.responseMapping) {
            processedResult = await this.processStepResult(step, apiResponse, stepMapping);
          }

          // 9. Store the result
          result.stepResults[step.id] = {
            stepId: step.id,
            success: true,
            rawData: apiResponse,
            transformedData: processedResult,
          };

          // 10. Update the aggregated data
          result.data[step.id] = processedResult;
        } catch (stepError) {
          console.error(`Error executing step ${step.id}:`, stepError);

          // If a step fails, record the error but continue with other steps if possible
          result.stepResults[step.id] = {
            stepId: step.id,
            success: false,
            error: String(stepError),
          };

          // If steps depend on this one, we can't continue
          const dependentSteps = executionPlan.steps.filter((s) => s.dependencies?.includes(step.id));

          if (dependentSteps.length > 0) {
            const dependentIds = dependentSteps.map((s) => s.id).join(", ");
            throw new Error(
              `Step ${step.id} failed and has dependent steps: ${dependentIds}. Workflow execution cannot continue.`,
            );
          }
        }
      }

      // Apply final transformation if specified
      if (executionPlan.finalTransform) {
        try {
          const finalResult = await applyJsonataWithValidation(result.data, executionPlan.finalTransform, undefined);

          if (finalResult.success) {
            result.data = finalResult.data as Record<string, unknown>;
          } else {
            throw new Error(`Final transform failed: ${finalResult.error}`);
          }
        } catch (transformError) {
          result.error = `Final transformation error: ${String(transformError)}`;
          result.success = false;
        }
      }

      result.completedAt = new Date();
      return result;
    } catch (error) {
      return {
        success: false,
        error: String(error),
        data: {},
        stepResults: {},
        startedAt: new Date(),
        completedAt: new Date(),
      };
    }
  }

  private async handleSingleApiCall(
    apiConfig: ApiConfig,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<unknown> {
    try {
      if (!apiConfig) {
        throw new Error("No API configuration provided");
      }

      const result = await callEndpoint(apiConfig, payload, credentials, options || { timeout: 60000 });

      return result.data;
    } catch (error) {
      throw new Error(`API call '${apiConfig.id}' failed: ${String(error)}`);
    }
  }

  private generatePlanId(): ExecutionPlanId {
    return `wfplan_${uuidv4()}`;
  }

  private validateExecutionPlan(plan: ExecutionPlan): void {
    // Validate that the execution plan has the required properties
    if (!plan.apiHost) {
      throw new Error("Execution plan must have an API host");
    }

    if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error("Execution plan must have at least one step");
    }

    // Validate each step
    for (const step of plan.steps) {
      if (!step.id) {
        throw new Error("Each step must have an ID");
      }

      if (!step.endpoint && !step.apiConfig) {
        throw new Error("Each step must have either an endpoint or an API config");
      }

      if (!step.method && !step.apiConfig) {
        throw new Error("Each step must have either a method or an API config");
      }
    }

    // Check for circular dependencies
    this.checkForCircularDependencies(plan.steps);
  }

  private checkForCircularDependencies(steps: ExecutionStep[]): void {
    // Create a dependency graph
    const graph: Record<string, string[]> = {};

    // Initialize
    for (const step of steps) {
      graph[step.id] = [];
    }

    // Build the graph
    for (const step of steps) {
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!graph[depId]) {
            throw new Error(`Step ${step.id} depends on non-existent step ${depId}`);
          }
          graph[depId].push(step.id);
        }
      }
    }

    // Check for cycles using DFS
    const visited = new Set<string>();
    const currentPath = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (currentPath.has(nodeId)) {
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      currentPath.add(nodeId);

      for (const neighbor of graph[nodeId]) {
        if (hasCycle(neighbor)) {
          return true;
        }
      }

      currentPath.delete(nodeId);
      return false;
    };

    for (const stepId in graph) {
      if (hasCycle(stepId)) {
        throw new Error("Execution plan contains circular dependencies");
      }
    }
  }

  private async prepareStepInput(
    step: ExecutionStep,
    mapping: StepMapping | undefined,
    currentResult: WorkflowResult,
    originalPayload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      // Prepare the context for the input mapping
      const context = {
        payload: originalPayload,
        previousSteps: currentResult.data,
      };

      // If there's no mapping or it's just the identity mapping, return a simple merge
      if (!mapping?.inputMapping || mapping.inputMapping === "$") {
        return {
          ...originalPayload,
          ...(step.dependencies
            ? {
                previousResults: step.dependencies.reduce(
                  (acc, depId) => {
                    if (currentResult.stepResults[depId]?.transformedData) {
                      acc[depId] = currentResult.stepResults[depId].transformedData;
                    }
                    return acc;
                  },
                  {} as Record<string, unknown>,
                ),
              }
            : {}),
        };
      }

      // Apply the JSONata mapping to transform the input
      const transformResult = await applyJsonataWithValidation(context, mapping.inputMapping, undefined);

      // Handle the result
      if (!transformResult.success) {
        throw new Error(`Input mapping failed: ${transformResult.error}`);
      }

      return transformResult.data as Record<string, unknown>;
    } catch (error) {
      // Fall back to simple merging if mapping fails
      console.error(`Error applying input mapping for step ${step.id}:`, error);
      return { ...originalPayload };
    }
  }

  private async processStepResult(step: ExecutionStep, result: unknown, mapping: StepMapping): Promise<unknown> {
    try {
      // If there's no mapping or it's just the identity mapping, return the result as-is
      if (!mapping?.responseMapping || mapping.responseMapping === "$") {
        return result;
      }

      // Apply the JSONata mapping to transform the result
      const transformResult = await applyJsonataWithValidation(result, mapping.responseMapping, undefined);

      if (!transformResult.success) {
        throw new Error(`Response mapping failed: ${transformResult.error}`);
      }

      return transformResult.data;
    } catch (error) {
      // Fall back to returning the raw result if mapping fails
      console.error(`Error applying response mapping for step ${step.id}:`, error);
      return result;
    }
  }
}
