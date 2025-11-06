import { ApiConfig, ExecutionStep, RequestOptions, Workflow, WorkflowResult, WorkflowStepResult } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { getEvaluateStepResponseContext, getLoopSelectorContext } from "../context/context-builders.js";
import { EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { applyJsonata, isSelfHealingEnabled, maskCredentials, transformAndValidateSchema } from "../utils/tools.js";
import { evaluateTransform, generateTransformCode } from "../utils/transform.js";
import { AbortError, ApiCallError } from "./api/api.js";
import { callEndpointLegacyImplementation, generateApiConfig } from "./api/api.legacy.js";

export interface WorkflowExecutorOptions {
  workflow: Workflow;
  metadata: Metadata;
  integrations: IntegrationManager[];
}
export class WorkflowExecutor implements Workflow {
  public id: string;
  public steps: ExecutionStep[];
  public finalTransform?: string;
  public result: WorkflowResult;
  public responseSchema?: JSONSchema;
  public metadata: Metadata;
  public instruction?: string;
  public inputSchema?: JSONSchema;
  private integrations: Record<string, IntegrationManager>;

  constructor(
    { workflow, metadata, integrations }: WorkflowExecutorOptions,
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
    }, {} as Record<string, IntegrationManager>);
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
    { payload, credentials, options }: { payload: Record<string, any>, credentials: Record<string, string>, options?: RequestOptions },
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
          const stepInputPayload = await this.prepareStepInput(step, payload);
          stepResult = await this.executeStep({ step, payload: stepInputPayload, credentials, options });
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
          const finalResult = await transformAndValidateSchema(rawStepData, currentFinalTransform, this.responseSchema);
          if (!finalResult.success) {
            throw new Error(finalResult.error);
          }

          if (options?.testMode) {
            const testResult = await evaluateTransform(
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

          this.result.data = finalResult.data || {};
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
          // Check if self-healing is enabled before regenerating
          if (!isSelfHealingEnabled(options, "transform")) {
            // If self-healing is disabled, fail with the original error
            this.result.success = false;
            this.result.error = transformError?.message || transformError;
            this.result.completedAt = new Date();
            return this.result;
          }

          logMessage("info", `Preparing new final transform`, this.metadata);
          const instruction = "Generate the final transformation code." +
            (this.instruction ? " with the following instruction: " + this.instruction : "") +
            (this.finalTransform ? "\nOriginally, we used the following transformation, fix it without messing up future transformations with the original data: " + this.finalTransform : "");

          const newTransformConfig = await generateTransformCode(this.responseSchema, rawStepData, instruction, this.metadata);
          if (!newTransformConfig) {
            throw new Error("Failed to generate new final transform");
          }
          this.result.data = newTransformConfig.data || {};
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
      // DEPRECATED: Remove this once we have a proper migration path
      if (step.inputMapping) {
        // Use JS transform for input mapping
        try {
          const transformResult = await transformAndValidateSchema(
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
      return mappingContext;
    } catch (error) {
      console.error(`[Step ${step.id}] Error preparing input:`, error);
      return { ...originalPayload };
    }
  }
  private async executeStep({
    step,
    payload,
    credentials,
    options
  }: {
    step: ExecutionStep,
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options: RequestOptions
  }): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }
  
    try {
      let loopItems: any[] = [];
  
      const integrationManager = step.integrationId ? this.integrations[step.integrationId] : undefined;
      const loopSelectorResult = await transformAndValidateSchema(payload, step.loopSelector || "$", null);
      const isLoopSelectorArray = Array.isArray(loopSelectorResult.data);
      if(isLoopSelectorArray) {
        loopItems = loopSelectorResult.data;
      }
      else if(loopSelectorResult.data) {
        loopItems = [loopSelectorResult.data];
      }
      else {
        loopItems = [{}];
      }
  
      if (!loopSelectorResult.success) {
        if (!isSelfHealingEnabled(options, "api")) {
          logMessage("error", `Loop selector for '${step.id}' failed. ${loopSelectorResult.error}\nCode: ${step.loopSelector}\nPayload: ${JSON.stringify(payload).slice(0, 1000)}...`, this.metadata);
          throw new Error(`Loop selector for '${step.id}' failed. Check the loop selector code or enable self-healing and re-execute to regenerate automatically.`);
        }
  
        const loopPrompt = getLoopSelectorContext( { step: step, payload: payload, instruction: step.apiConfig.instruction }, { characterBudget: 20000 });
        const arraySchema = { type: "array", description: "Array of items to iterate over" };
        const transformResult = await generateTransformCode(arraySchema, payload, loopPrompt, this.metadata);
  
        step.loopSelector = transformResult.mappingCode;
        const retryResult = await transformAndValidateSchema(payload, step.loopSelector, null);
        loopItems = retryResult.data;
  
        if (!retryResult.success || !Array.isArray(loopItems)) {
          throw new Error("Failed to generate loop selector");
        }
      }
  
      loopItems = loopItems.slice(0, step.loopMaxIters || server_defaults.DEFAULT_LOOP_MAX_ITERS);
  
      const stepResults: WorkflowStepResult[] = [];
      let successfulConfig: ApiConfig | null = null;
  
      for (let i = 0; i < loopItems.length; i++) {
        const currentItem = loopItems[i] || "";
        if(loopItems.length > 1) {
          logMessage("debug", `Executing loop iteration ${i + 1}/${loopItems.length} with item: ${JSON.stringify(currentItem).slice(0, 50)}...`, this.metadata);
        }
        else {
          logMessage("debug", `Executing step ${step.id} with item: ${JSON.stringify(currentItem).slice(0, 50)}...`, this.metadata);
        }
  
        const loopPayload: Record<string, any> = {
          currentItem: currentItem,
          ...payload
        };
  
        try {
          const apiResponse = await this.executeConfig({
            endpoint: successfulConfig || step.apiConfig,
            integrationManager,
            payload: loopPayload,
            credentials,
            options: {
              ...options,
              testMode: false
            }
          });
  
          if (apiResponse.endpoint) {
            successfulConfig = apiResponse.endpoint;
            if (successfulConfig !== step.apiConfig) {
              logMessage("debug", `Loop iteration ${i + 1} updated configuration`, this.metadata);
            }
          } 
          const rawData = { currentItem: currentItem, data: apiResponse.data, ...(typeof apiResponse.data === 'object' && !Array.isArray(apiResponse.data) ? apiResponse.data : {}) };
          const transformedData = await applyJsonata(rawData, step.responseMapping); //LEGACY: New workflow strategy will not use response mappings, default to $
          stepResults.push({
            stepId: step.id,
            success: true,
            rawData: null,
            transformedData: transformedData,
            config: apiResponse.endpoint
          });
  
          // update the apiConfig with the new endpoint
          step.apiConfig = apiResponse.endpoint;
  
        } catch (callError) {
          const errorMessage = `Error processing item ${i + 1}/${loopItems.length} '${JSON.stringify(currentItem).slice(0, 50)}...': ${String(callError)}`;
          logMessage("error", errorMessage, this.metadata);
          throw new Error(errorMessage);
        }
      }
  
      result.config = step.apiConfig;
      result.rawData = isLoopSelectorArray ? stepResults.map(r => r.rawData) : stepResults[0].rawData;
      result.transformedData = isLoopSelectorArray ? stepResults.map(r => r.transformedData) : stepResults[0].transformedData;
      result.success = stepResults.every(r => r.success);
      result.error = stepResults.filter(s => s.error).join("\n");
    } catch (error) {
      result.config = step.apiConfig;
      result.success = false;
      result.error = error.message || error;
    }
    logMessage("info", `'${step.id}' ${result.success ? "Complete" : "Failed"}`, this.metadata);
    return result;
  }
  private async evaluateConfigResponse({
    data,
    endpoint,
    docSearchResultsForStepInstruction
  }: {
    data: any,
    endpoint: ApiConfig,
    docSearchResultsForStepInstruction?: string
  }): Promise<{ success: boolean, refactorNeeded: boolean, shortReason: string; }> {
  
    const evaluateStepResponsePrompt = getEvaluateStepResponseContext({ data, endpoint, docSearchResultsForStepInstruction }, { characterBudget: 20000 });
  
    const request = [
      {
        role: "system",
        content: EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT
      },
      {
        role: "user", content: evaluateStepResponsePrompt
      }
    ] as LLMMessage[];
  
    const response = await LanguageModel.generateObject(
      request,
      { type: "object", properties: { success: { type: "boolean" }, refactorNeeded: { type: "boolean" }, shortReason: { type: "string" } } },
      0
    );
    if (response.error) {
      throw new Error(`Error evaluating config response: ${response.error}`);
    }
    return response.response;
  }
  
  private async executeConfig({
    endpoint,
    integrationManager,
    payload,
    credentials,
    options
  }: {
    endpoint: ApiConfig,
    integrationManager: IntegrationManager,
    payload: any,
    credentials: Record<string, string>,
    options: RequestOptions
  }): Promise<{
    data: any;
    endpoint: ApiConfig;
    statusCode: number;
    headers: Record<string, any>;
  }> {
    let response: any = null;
    let retryCount = 0;
    let lastError: string | null = null;
    let messages: LLMMessage[] = [];
    let success = false;
    let isSelfHealing = isSelfHealingEnabled(options, "api");
  
    // If self healing is enabled, use the retries from the options or the default max of 10 if not specified, otherwise use 1 (no self-healing case)
    const effectiveMaxRetries = isSelfHealing ? (options?.retries !== undefined ? options.retries : server_defaults.MAX_CALL_RETRIES) : 1;
  
    do {
      try {
        if (retryCount > 0 && isSelfHealing) {
          logMessage('info', `Failed to execute API Call. Self healing the step configuration for ${endpoint?.urlHost}${retryCount > 0 ? ` (${retryCount})` : ""}`, this.metadata);
          const computedApiCallConfig = await generateApiConfig({
            failedConfig: endpoint,
            stepInput: payload,
            credentials,
            retryCount,
            messages: messages,
            integrationManager: integrationManager
          });
          if (!computedApiCallConfig) {
            throw new Error("No API config generated");
          }
          endpoint = computedApiCallConfig.config;
          messages = computedApiCallConfig.messages;
        }
  
        response = await callEndpointLegacyImplementation({ endpoint, payload, credentials, options });
  
        if (!response.data) {
          throw new Error("No data returned from API. This could be due to a configuration error.");
        }
  
        // Check if response is valid
        if (retryCount > 0 && isSelfHealing || options.testMode) {
          const result = await this.evaluateConfigResponse({
            data: response.data,
            endpoint: endpoint,
            docSearchResultsForStepInstruction: await integrationManager?.searchDocumentation(endpoint.instruction)
          });
          success = result.success;
          if (!result.success) throw new Error(result.shortReason + " " + JSON.stringify(response.data).slice(0, 1000));
        }
        else {
          success = true;
        }
        break;
      }
      catch (error) {
        const rawErrorString = error?.message || JSON.stringify(error || {});
        lastError = maskCredentials(rawErrorString, credentials).slice(0, 10000);
        if (retryCount > 0) {
          messages.push({ role: "user", content: `There was an error with the configuration, please fix: ${rawErrorString.slice(0, 10000)}` });
          logMessage('info', `API call failed. Last error: ${lastError}`, this.metadata);
        }
  
        // hack to get the status code from the error
        if (!response?.statusCode) {
          response = response || {};
          response.statusCode = error instanceof ApiCallError ? error.statusCode : 500;
        }
        if (error instanceof AbortError) {
          break;
        }
      }
      retryCount++;
    } while (retryCount < effectiveMaxRetries);
    if (!success) {
      telemetryClient?.captureException(new Error(`API call failed. Last error: ${lastError}`), this.metadata?.orgId, {
        endpoint: endpoint,
        retryCount: retryCount,
      });
      throw new ApiCallError(`API call failed. Last error: ${lastError}`, response?.statusCode);
    }
  
    return { data: response?.data, endpoint, statusCode: response?.statusCode, headers: response?.headers };
  }  
}
