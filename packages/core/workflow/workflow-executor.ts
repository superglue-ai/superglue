import { Metadata } from "@playwright/test";
import { ExecutionStep, Integration, RequestOptions, Workflow, WorkflowResult, WorkflowStepResult } from "@superglue/client";
import { Context } from "@superglue/shared";
import { Validator } from "jsonschema";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { logMessage } from "../utils/logs.js";
import { addNullableToOptional, applyJsonata, applyTransformationWithValidation } from "../utils/tools.js";
import { generateTransformCode } from "../utils/transform.js";
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
    this.finalTransform = workflow.finalTransform || "$";
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
              if (stepResult && stepResult.transformedData !== undefined) {
                acc[this.result.stepResults[stepIndex].stepId] = stepResult.transformedData;
              }
              return acc;
            },
            {} as Record<string, unknown>,
          ),
        };
        
        try {
          // Apply the final transform using the original data
          let currentFinalTransform = this.finalTransform || "$";
          logMessage("info", `Applying final transform: ${currentFinalTransform.slice(0, 100)}${currentFinalTransform.length > 100 ? '...' : ''}`, this.metadata);
          
          const finalResult = await applyTransformationWithValidation(rawStepData, currentFinalTransform, this.responseSchema);
          
          if (!finalResult.success) {
            logMessage("warn", `Transform failed: ${finalResult.error}`, this.metadata);
            throw new Error(finalResult.error);
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
          logMessage("warn", `Transform error: ${transformError.message}. Attempting to generate new transform.`, this.metadata);
          
          try {
            const instruction = "Generate the final transformation code." +
              (this.instruction ? " with the following instruction: " + this.instruction : "") +
              (this.finalTransform ? "\nOriginally, we used the following transformation, fix it without messing up future transformations with the original data: " + this.finalTransform : "");

            logMessage("info", `Preparing new final transform with instruction: ${instruction.slice(0, 200)}...`, this.metadata);
            
            const newTransformConfig = await generateTransformCode(this.responseSchema, rawStepData, instruction, this.metadata);
            
            if (!newTransformConfig || !newTransformConfig.mappingCode) {
              logMessage("error", "Failed to generate new transform", this.metadata);
              throw new Error("Failed to generate new final transform");
            }
            
            logMessage("info", `New transform generated with confidence: ${newTransformConfig.confidence}%`, this.metadata);
            const finalResult = await applyTransformationWithValidation(rawStepData, newTransformConfig.mappingCode, this.responseSchema);
            
            if (!finalResult.success) {
              logMessage("error", `New transform validation failed: ${finalResult.error}`, this.metadata);
              throw new Error(finalResult.error);
            }
            
            logMessage("info", "New transform applied successfully", this.metadata);
            this.result.data = finalResult.data as Record<string, unknown> || {};
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
          } catch (regenerationError) {
            logMessage("error", `Transform regeneration failed: ${regenerationError.message}`, this.metadata);
            throw new Error(`Transform failed and regeneration failed: ${regenerationError.message}`);
          }
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

    if (this.inputSchema) {
      const validator = new Validator();
      const optionalSchema = addNullableToOptional(this.inputSchema);
      const validation = validator.validate(payload, optionalSchema);
      if (!validation.valid) {
        throw new Error("Invalid payload: " + validation.errors.map(e => e.message).join(", "));
      }
    }
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
        // Prepare context for JSONata expression
        try {
          const result = await applyJsonata(mappingContext, step.inputMapping || "$");
          return result as Record<string, unknown>;
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
