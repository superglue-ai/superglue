import type { ExecutionStep, RequestOptions, Workflow, WorkflowResult, WorkflowStepResult, TransformConfig } from "@superglue/shared";
import { applyJsonata, applyJsonataWithValidation } from "../utils/tools.js";
import { selectStrategy } from "./workflow-strategies.js";
import { logMessage } from "../utils/logs.js";
import { Metadata } from "@playwright/test";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { generateMapping, prepareTransform } from "../utils/transform.js";

export class WorkflowExecutor implements Workflow {
  public id: string;
  public steps: ExecutionStep[];
  public finalTransform?: string;
  public result: WorkflowResult;
  public responseSchema?: JSONSchema;
  public metadata: Metadata;

  constructor(
    workflow: Workflow,
    metadata: Metadata,
  ) {
    this.id = workflow.id;
    this.steps = workflow.steps;
    this.finalTransform = workflow.finalTransform || "$";
    this.responseSchema = workflow.responseSchema;
    this.metadata = metadata;
    this.result = {
      success: true,
      data: {},
      stepResults: [],
      startedAt: new Date(),
      completedAt: undefined,
    };
  }
  public async execute(
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options?: RequestOptions,
  ): Promise<WorkflowResult> {
    this.result = {
      success: true,
      data: {},
      stepResults: [],
      startedAt: new Date(),
      completedAt: undefined,
    };
    try {
      this.validateSteps();
      logMessage("info", `Executing workflow ${this.id}`);

      // Execute each step in order
      for (const step of this.steps) {
        let stepResult: WorkflowStepResult;
        try {
          const strategy = selectStrategy(step);
          const stepInputPayload = await this.prepareStepInput(step, payload);
          stepResult = await strategy.execute(step, stepInputPayload, credentials, options, this.metadata);
          step.apiConfig = stepResult.apiConfig;
        } catch (stepError) {
          stepResult = {
            stepId: step.id,
            success: false,
            error: stepError
          };
        }
        this.result.stepResults.push(stepResult);

        // abort if failure occurs
        if(!stepResult.success){
          this.result.completedAt = new Date();
          this.result.success = false;
          logMessage("error", `Step ${step.id} failed: ${stepResult.error}`, this.metadata);
          return this.result;
        }
      }

      // Apply final transformation if specified
      if (this.finalTransform || this.responseSchema) {
        const rawStepData = {
          ...Object.entries(this.result.stepResults).reduce(
            (acc, [stepIndex, stepResult]) => {
              acc[this.result.stepResults[stepIndex].stepId] = stepResult.transformedData;
              return acc;
            },
            {} as Record<string, unknown>,
          ),
        };
          try {
            // Apply the final transform using the original data
            let currentFinalTransform = this.finalTransform || "$";
            const finalResult = await applyJsonataWithValidation(rawStepData, currentFinalTransform, this.responseSchema);
            if(!finalResult.success) {
              throw new Error(finalResult.error);
            }
            this.result.data = finalResult.data as Record<string, unknown> || {};
            this.result.finalTransform = currentFinalTransform; // Store the successful transform
            this.result.error = undefined; // Clear any previous transform error
            this.result.success = true; // Ensure success is true if transform succeeds
          } catch (transformError) {
            logMessage("info", `Preparing new final transform`, this.metadata);
            const newTransformConfig = await generateMapping(this.responseSchema, rawStepData, "Generate the final transformation expression in JSONata format.", this.metadata);
            if(!newTransformConfig) {
              throw new Error("Failed to generate new final transform");
            }
            const finalResult = await applyJsonataWithValidation(rawStepData, newTransformConfig.jsonata, this.responseSchema);
            if(!finalResult.success) {
              throw new Error(finalResult.error);
            }
            this.result.data = finalResult.data as Record<string, unknown> || {};
            this.result.finalTransform = newTransformConfig.jsonata; // Store the successful transform
            this.result.error = undefined; // Clear any previous transform error
            this.result.success = true; // Ensure success is true if transform succeeds
          }
      }
      this.result.completedAt = new Date();
      return this.result;
    } catch (error) {
      this.result.success = false;
      this.result.error = error?.message || error;
      this.result.completedAt = new Date();
      return this.result;
    }
  }

  private validateSteps(): void {
    if (!this.steps || !Array.isArray(this.steps) || this.steps.length === 0) {
      throw new Error("Execution plan must have at least one step");
    }

    for (const step of this.steps) {
      if (!step.id) {
        throw new Error("Each step must have an ID");
      }

      if (!step.apiConfig) {
        throw new Error("Each step must have an API config");
      }
    }
  }

  private async prepareStepInput(
    step: ExecutionStep,
    originalPayload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      // if explicit mapping exists, use it first
      if (step.inputMapping) {
        // Prepare context for JSONata expression
        const mappingContext = {
          ...originalPayload,
          // Include step results at root level for easier access
          ...Object.entries(this.result?.stepResults).reduce(
            (acc, [stepIndex, stepResult]) => {
              if (stepResult?.transformedData) {
                acc[this.result.stepResults[stepIndex].stepId] = stepResult.transformedData;
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
      // Default to simple merging of payload with previous step data
      return { ...originalPayload };
    } catch (error) {
      console.error(`[Step ${step.id}] Error preparing input:`, error);
      return { ...originalPayload };
    }
  }
}
