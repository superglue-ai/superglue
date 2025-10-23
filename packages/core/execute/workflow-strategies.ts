import type { ApiConfig, CodeConfig, ExecutionStep, RequestOptions, WorkflowStepResult } from "@superglue/client";
import { Integration, Metadata } from "@superglue/shared";
import { getLoopSelectorContext } from "../context/context-builders.js";
import { server_defaults } from "../default.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel } from "../llm/language-model.js";
import { logMessage } from "../utils/logs.js";
import { applyJsonata, isSelfHealingEnabled, transformAndValidateSchema } from "../utils/tools.js";
import { generateTransformCode } from "../utils/transform.js";
import { executeStep } from "./workflow-step-runner.js";

export interface ExecutionStrategy {
  execute(
    step: ExecutionStep,
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options: RequestOptions,
    metadata: Metadata,
    integration?: Integration
  ): Promise<WorkflowStepResult>;
}

export function selectStrategy(step: ExecutionStep): ExecutionStrategy {
  const strategy = step.executionMode == "LOOP" ? loopStrategy : directStrategy;
  return strategy;
}

// ======= Strategy implementations =======

const directStrategy: ExecutionStrategy = {
  async execute(
    step: ExecutionStep,
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options: RequestOptions = {},
    metadata: Metadata,
    integrationManager?: IntegrationManager
  ): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }
    try {
      const apiResponse = await executeStep({
        endpoint: step.apiConfig,
        codeConfig: step.codeConfig,
        inputData: payload,
        credentials,
        options,
        metadata,
        integrationManager
      });
      const transformedData = await applyJsonata(apiResponse.data, step.responseMapping); //LEGACY: New workflow strategy will not use respone mappings

      result.rawData = apiResponse.data;
      result.transformedData = transformedData;
      result.success = true;
      result.config = apiResponse.endpoint;

      logMessage("info", `'${step.id}' ${result.success ? "Complete" : "Failed"}`, metadata);
    } catch (error) {
      const errorMessage = `Error in direct execution for step ${step.id}: ${error}`;

      result.error = errorMessage;
      result.success = false;
      logMessage("error", errorMessage, metadata);
    }
    return result;
  },
};

const loopStrategy: ExecutionStrategy = {
  async execute(
    step: ExecutionStep,
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options: RequestOptions = {},
    metadata: Metadata,
    integrationManager?: IntegrationManager
  ): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }

    try {
      let loopItems: any[] = [];

      const loopSelectorResult = await transformAndValidateSchema(payload, step.loopSelector || "$", null);
      loopItems = loopSelectorResult.data;

      if (!loopSelectorResult.success || !Array.isArray(loopItems)) {
        if (!isSelfHealingEnabled(options, "api")) {
          throw new Error(`Loop selector for '${step.id}' did not return an array. Check the loop selector code or enable self-healing and re-execute to regenerate automatically.`);
        }
        logMessage("warn", `Loop selector for '${step.id}' did not return an array. Regenerating loop selector.`, metadata);
        const instruction = step.codeConfig ? step.codeConfig.stepInstruction : step.apiConfig?.instruction;
        const loopPrompt = getLoopSelectorContext( { step, payload, instruction }, { characterBudget: LanguageModel.contextLength / 10 });
        const arraySchema = { type: "array", description: "Array of items to iterate over" };
        const transformResult = await generateTransformCode(arraySchema, payload, loopPrompt, metadata);

        step.loopSelector = transformResult.mappingCode;
        const retryResult = await transformAndValidateSchema(payload, step.loopSelector, null);
        loopItems = retryResult.data;

        if (!retryResult.success || !Array.isArray(loopItems)) {
          throw new Error("Failed to generate loop selector");
        }
      }

      loopItems = loopItems.slice(0, step.loopMaxIters || server_defaults.DEFAULT_LOOP_MAX_ITERS);

      const stepResults: WorkflowStepResult[] = [];
      let successfulApiConfig: ApiConfig | null = null;
      let successfulCodeConfig: CodeConfig | null = null;

      for (let i = 0; i < loopItems.length; i++) {
        const currentItem = loopItems[i] || "";
        logMessage("debug", `Executing loop iteration ${i + 1}/${loopItems.length}`, metadata);

        const loopPayload: Record<string, any> = {
          ...payload,
          currentItem: currentItem
        };

        try {
          const apiResponse = await executeStep({
            endpoint: successfulApiConfig || step.apiConfig,
            codeConfig: successfulCodeConfig || step.codeConfig,
            inputData: loopPayload,
            credentials,
            options: {
              ...options,
              testMode: false
            },
            integrationManager,
            metadata
          });

          if (apiResponse.endpoint) {
            successfulApiConfig = apiResponse.endpoint;
            if (successfulApiConfig !== step.apiConfig) {
              logMessage("debug", `Loop iteration ${i + 1} updated configuration`, metadata);
            }
          }
          if (apiResponse.codeConfig) {
            successfulCodeConfig = apiResponse.codeConfig;
            if (successfulCodeConfig !== step.codeConfig) {
              logMessage("debug", `Loop iteration ${i + 1} updated code configuration`, metadata);
            }
          }

          const rawData = { currentItem: currentItem, data: apiResponse.data, ...(typeof apiResponse.data === 'object' ? apiResponse.data : {}) };
          const transformedData = await applyJsonata(rawData, step.responseMapping); //LEGACY: New workflow strategy will not use response mappings, default to $

          stepResults.push({
            stepId: step.id,
            success: true,
            rawData: rawData,
            transformedData: transformedData,
            config: apiResponse.endpoint
          });

          // update the apiConfig with the new endpoint
          step.apiConfig = apiResponse.endpoint;

        } catch (callError) {
          const errorMessage = `Error processing item ${i + 1}/${loopItems.length} '${JSON.stringify(currentItem).slice(0, 50)}...': ${String(callError)}`;
          logMessage("error", errorMessage, metadata);
          throw new Error(errorMessage);
        }
      }

      result.config = step.apiConfig;
      result.rawData = stepResults.map(r => r.rawData);
      result.transformedData = stepResults.map(r => r.transformedData);
      result.success = stepResults.every(r => r.success);
      result.error = stepResults.filter(s => s.error).join("\n");
    } catch (error) {
      result.config = step.apiConfig;
      result.success = false;
      result.error = error.message || error;
    }
    logMessage("info", `'${step.id}' ${result.success ? "Complete" : "Failed"}`, metadata);
    return result;
  }
};