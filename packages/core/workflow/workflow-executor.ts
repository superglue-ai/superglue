import { ExecutionStep, Integration, RequestOptions, Workflow, WorkflowResult, WorkflowStepResult } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { logMessage } from "../utils/logs.js";
import { applyTransformationWithValidation } from "../utils/tools.js";
import { evaluateMapping, generateTransformCode } from "../utils/transform.js";
import { selectStrategy } from "./workflow-strategies.js";

export class WorkflowExecutor implements Workflow {
  public id: string;
  public steps: ExecutionStep[];
  public finalTransform?: string;
  public result: WorkflowResult;
  public responseSchema?: JSONSchema;
  public metadata: Metadata;
  public instruction?: string;
  public inputSchema?: JSONSchema;
  private integrations: Record<string, Integration>;

  constructor(
    workflow: Workflow,
    metadata: Metadata,
    integrations: Integration[] = []
  ) {
    this.id = workflow.id;
    this.steps = workflow.steps;
    this.finalTransform = workflow.finalTransform || "(sourceData) => sourceData";
    this.responseSchema = workflow.responseSchema;
    this.instruction = workflow.instruction;
    this.metadata = metadata;
    this.inputSchema = workflow.inputSchema;
    this.integrations = integrations.reduce((acc, int) => {
      acc[int.id] = int;
      return acc;
    }, {} as Record<string, Integration>);
    this.result = {
      id: crypto.randomUUID(),
      success: false,
      data: {},
      stepResults: [],
      startedAt: new Date(),
      completedAt: undefined,
      config: workflow,
    } as WorkflowResult;
  }
  public async execute(
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options?: RequestOptions,
  ): Promise<WorkflowResult> {
    this.result = {
      ...this.result,
      id: crypto.randomUUID(),
      success: false,
      data: {} as Record<string, unknown>,
      stepResults: [] as WorkflowStepResult[],
      startedAt: new Date(),
      completedAt: undefined
    } as WorkflowResult;
    try {
      if (!payload) payload = {};
      if (!credentials) credentials = {};
      this.validate({ payload, credentials });
      logMessage("info", `Executing workflow ${this.id}`, this.metadata);

      // Execute each step in order
      for (const step of this.steps) {
        let stepResult: WorkflowStepResult;
        try {
          const strategy = selectStrategy(step);
          const stepInputPayload = await this.prepareStepInput(step, payload);
          const integration = step.integrationId ? this.integrations[step.integrationId] : undefined;
          stepResult = await strategy.execute(
            step,
            stepInputPayload,
            credentials,
            options || {},
            this.metadata,
            integration
          );
          step.apiConfig = stepResult.config;
        } catch (stepError) {
          stepResult = {
            stepId: step.id,
            success: false,
            error: stepError,
            config: step.apiConfig
          };
        }
        this.result.stepResults.push(stepResult);

        // abort if failure occurs
        if (!stepResult.success) {
          this.result.completedAt = new Date();
          this.result.success = false;
          this.result.error = stepResult.error;
          return this.result;
        }
      }

      // Apply final transformation if specified
      if (this.finalTransform || this.responseSchema) {
        const rawStepData = {
          ...payload,
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
          let currentFinalTransform = this.finalTransform || "(sourceData) => sourceData";
          const finalResult = await applyTransformationWithValidation(rawStepData, currentFinalTransform, this.responseSchema);
          if (!finalResult.success) {
            throw new Error(finalResult.error);
          }

          if (options?.testMode) {
            const testResult = await evaluateMapping(
              finalResult.data,
              currentFinalTransform,
              rawStepData,
              this.responseSchema,
              this.instruction,
              this.metadata
            );
            if (!testResult.success) {
              throw new Error(testResult.reason);
            }
          }

          this.result.data = finalResult.data as Record<string, unknown> || {};
          this.result.config = {
            id: this.id,
            steps: this.steps,
            finalTransform: currentFinalTransform,
            inputSchema: this.inputSchema,
            responseSchema: this.responseSchema,
            instruction: this.instruction
          } as Workflow; // Store the successful transform
          this.result.error = undefined; // Clear any previous transform error
          this.result.success = true; // Ensure success is true if transform succeeds
        } catch (transformError) {
          logMessage("info", `Preparing new final transform`, this.metadata);
          const instruction = "Generate the final transformation code." +
            (this.instruction ? " with the following instruction: " + this.instruction : "") +
            (this.finalTransform ? "\nOriginally, we used the following transformation, fix it without messing up future transformations with the original data: " + this.finalTransform : "");

          const newTransformConfig = await generateTransformCode(this.responseSchema, rawStepData, instruction, this.metadata);
          if (!newTransformConfig) {
            throw new Error("Failed to generate new final transform");
          }
          this.result.data = newTransformConfig.data as Record<string, unknown> || {};
          this.result.config = {
            id: this.id,
            steps: this.steps,
            finalTransform: newTransformConfig.mappingCode,
            inputSchema: this.inputSchema,
            responseSchema: this.responseSchema,
            instruction: this.instruction
          } as Workflow; // Store the successful transform
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

  private validate(payload: Record<string, unknown>): void {
    if (!this.id) {
      throw new Error("Workflow must have a valid ID");
    }

    if (!this.steps || !Array.isArray(this.steps)) {
      throw new Error("Execution steps must be an array");
    }

    for (const step of this.steps) {
      if (!step.id) {
        throw new Error("Each step must have an ID");
      }

      if (!step.apiConfig) {
        throw new Error("Each step must have an API config");
      }
    }

    /* we don't validate the input schema until we have figured out how to fix the edge cases
    if (this.inputSchema) {
      const validator = new Validator();
      const optionalSchema = addNullableToOptional(this.inputSchema);
      const validation = validator.validate(payload, optionalSchema);
      if (!validation.valid) {
        throw new Error("Invalid payload: " + validation.errors.map(e => e.message).join(", "));
      }
    }*/
  }

  private async prepareStepInput(
    step: ExecutionStep,
    originalPayload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      // if explicit mapping exists, use it first
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

      if (step.inputMapping) {
        // Use JS transform for input mapping
        try {
          const transformResult = await applyTransformationWithValidation(
            mappingContext,
            step.inputMapping,
            null // No schema validation for input mappings
          );

          if (!transformResult.success) {
            throw new Error(`Input mapping failed: ${transformResult.error}`);
          }

          return transformResult.data as Record<string, unknown>;
        } catch (err) {
          console.warn(`[Step ${step.id}] Input mapping failed, falling back to auto-detection`, err);
        }
      }
      // Default to simple merging of payload with previous step data
      return { ...mappingContext };
    } catch (error) {
      console.error(`[Step ${step.id}] Error preparing input:`, error);
      return { ...originalPayload };
    }
  }
}
