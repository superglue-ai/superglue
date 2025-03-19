import type { ApiInput, RequestOptions } from "@superglue/shared";
import { v4 as uuidv4 } from "uuid";
import { getDocumentation } from "../../utils/documentation.js";
import { applyJsonata } from "../../utils/tools.js";

import type { ExecutionPlan, ExecutionPlanId, ExecutionStep, WorkflowResult } from "./domain/workflow.types.js";

import { executeWorkflowStep } from "./execution/workflowExecutionStrategy.js";
import { extractTemplateVariables, storeStepResult } from "./execution/workflowUtils.js";

export class ApiWorkflowOrchestrator {
  private apiDocumentation: string;
  private executionPlans: Record<string, ExecutionPlan>;
  private baseApiInput: ApiInput;

  constructor(baseApiInput: ApiInput) {
    this.apiDocumentation = "";
    this.executionPlans = {};
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

  public async registerExecutionPlan(plan: ExecutionPlan): Promise<ExecutionPlanId> {
    try {
      const planWithDefaultModes: ExecutionPlan = {
        ...plan,
        steps: plan.steps.map((step) => ({
          ...step,
          executionMode: step.executionMode || "DIRECT",
        })),
      };

      this.validateExecutionPlan(planWithDefaultModes);
      const planId = planWithDefaultModes.id || this.generatePlanId();
      const planWithId: ExecutionPlan = {
        ...planWithDefaultModes,
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
  ): Promise<void> {
    try {
      if (!documentationUrl) {
        throw new Error("Documentation URL is required");
      }
      const documentation = await getDocumentation(documentationUrl, headers || {}, queryParams || {});
      this.apiDocumentation = documentation;
    } catch (error) {
      throw new Error(`Failed to retrieve API documentation: ${String(error)}`);
    }
  }

  public async executeWorkflowPlan(
    planId: ExecutionPlanId,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<WorkflowResult> {
    try {
      const executionPlan = this.executionPlans[planId];

      if (!executionPlan) {
        throw new Error(`No execution plan found with ID ${planId}`);
      }

      const result: WorkflowResult = {
        success: true,
        data: {},
        stepResults: {},
        startedAt: new Date(),
        completedAt: undefined,
      };

      console.log("Executing workflow plan: ", executionPlan);

      // Execute each step in order
      for (const step of executionPlan.steps) {
        console.log("Executing step: ", step);
        try {
          const stepInputPayload = await this.prepareStepInput(step, result, payload);
          const success = await executeWorkflowStep(
            step,
            executionPlan,
            result,
            this.apiDocumentation,
            stepInputPayload,
            credentials,
            this.baseApiInput,
            options,
          );

          if (success) {
            console.log(`Result Step '${step.id}' - Complete`);
          } else {
            console.log(`Result Step '${step.id}' - Failed`);
          }
        } catch (stepError) {
          console.error(`Error executing step ${step.id}:`, stepError);

          // If a step fails, record the error but continue with other steps if possible
          storeStepResult(step.id, result, undefined, undefined, false, String(stepError));
        }
      }

      // Apply final transformation if specified
      if (executionPlan.finalTransform) {
        try {
          // Object to easily access just the step raw data for transform
          const rawStepData = {
            ...Object.entries(result.stepResults).reduce(
              (acc, [stepId, stepResult]) => {
                acc[stepId] = stepResult.rawData;
                return acc;
              },
              {} as Record<string, unknown>,
            ),
          };

          // Apply the final transform using the original data
          const finalResult = await applyJsonata(rawStepData, executionPlan.finalTransform);
          console.log("Final transform result: ", finalResult);

          result.data = finalResult as Record<string, unknown>;
          result.success = true;
          // TODO: add schema validation
        } catch (transformError) {
          console.error("Final transform error:", transformError);
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

  private generatePlanId(): ExecutionPlanId {
    return `wfplan_${uuidv4()}`;
  }

  private validateExecutionPlan(plan: ExecutionPlan): void {
    if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error("Execution plan must have at least one step");
    }

    for (const step of plan.steps) {
      if (!step.id) {
        throw new Error("Each step must have an ID");
      }

      if (!step.apiConfig) {
        throw new Error("Each step must have an API config");
      }
      // TODO: should also work without one in the end (e.g. root path for API call)
      if (!step.apiConfig.urlPath) {
        throw new Error("Each step's API config must have a URL path");
      }
    }
  }

  private async prepareStepInput(
    step: ExecutionStep,
    currentResult: WorkflowResult,
    originalPayload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      // if explicit mapping exists, use it first
      if (step.inputMapping && step.inputMapping !== "$") {
        // Prepare context for JSONata expression
        const mappingContext = {
          payload: originalPayload,
          previousSteps: currentResult.data,
          // Include step results at root level for easier access
          ...Object.entries(currentResult.stepResults).reduce(
            (acc, [stepId, stepResult]) => {
              if (stepResult?.transformedData) {
                acc[stepId] = stepResult.transformedData;
              }
              return acc;
            },
            {} as Record<string, unknown>,
          ),
        };

        try {
          const result = await applyJsonata(mappingContext, step.inputMapping || "$");
          return result as Record<string, unknown>;
        } catch (err) {
          console.warn(`[Step ${step.id}] Input mapping failed, falling back to auto-detection`, err);
        }
      }

      // Detect template variables if present
      const templateVars = extractTemplateVariables(step.apiConfig.urlPath || "");
      if (templateVars.length > 0) {
        const autoVars: Record<string, unknown> = {};

        // Find variables from previous step results or payload
        for (const varName of templateVars) {
          let found = false;

          for (const stepResult of Object.values(currentResult.stepResults)) {
            if (!stepResult?.transformedData || typeof stepResult.transformedData !== "object") continue;

            const data = stepResult.transformedData as Record<string, unknown>;
            if (varName in data) {
              autoVars[varName] = data[varName];
              found = true;
              break;
            }
          }

          // look in payload
          if (!found && varName in originalPayload) {
            autoVars[varName] = originalPayload[varName];
          }
        }

        // If we found any variables, merge them with payload
        if (Object.keys(autoVars).length > 0) {
          return { ...originalPayload, ...autoVars };
        }
      }
      // Default to simple merging of payload with previous step data
      return {
        ...originalPayload,
        previousResults: Object.entries(currentResult.stepResults).reduce(
          (acc, [stepId, stepResult]) => {
            if (stepResult?.transformedData) {
              acc[stepId] = stepResult.transformedData;
            }
            return acc;
          },
          {} as Record<string, unknown>,
        ),
      };
    } catch (error) {
      console.error(`[Step ${step.id}] Error preparing input:`, error);
      return { ...originalPayload };
    }
  }
}
