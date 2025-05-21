import type { ExecutionStep, RequestOptions, WorkflowStepResult } from "@superglue/client";
import { applyJsonata } from "../utils/tools.js";
import { logMessage } from "../utils/logs.js";
import { executeApiCall } from "../graphql/resolvers/call.js";
import { generateMapping } from "../utils/transform.js";
import { Metadata } from "@superglue/shared";

export interface ExecutionStrategy {
  execute(
    step: ExecutionStep,
    payload: Record<string, any>,
    credentials: Record<string, string>,
    options: RequestOptions,
    metadata: Metadata
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
    metadata: Metadata
  ): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }
    try {
      const apiResponse = await executeApiCall(step.apiConfig, payload, credentials, options, metadata);
      const transformedData = await applyJsonata(apiResponse.data, step.responseMapping);

      result.rawData = apiResponse.data;
      result.transformedData = transformedData;
      result.success = true;
      result.config = apiResponse.endpoint;

      logMessage("info", `Direct Execution '${step.id}' - Complete`, metadata);
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
    metadata: Metadata
  ): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }

    try {
      if (!step.loopSelector) {
        if(Array.isArray(payload)) {
          step.loopSelector = "$";
        }
        else {
          throw new Error("loopSelector is required for LOOP execution mode");
        }
      }
      
      let loopItems: any[] = await applyJsonata(payload, step.loopSelector);

      if (!Array.isArray(loopItems) || loopItems.length === 0) {
        if(step.loopSelector !== "$") logMessage("error", `No input data found for '${step.id}' - regenerating data selector`, metadata);
        const newLoopSelector = await generateMapping({ type: "array" }, payload, "Find the array of selector values for the following loop: " + step.id, metadata);
        step.loopSelector = newLoopSelector.jsonata;
        loopItems = await applyJsonata(payload, step.loopSelector);
      }

      if (step.loopMaxIters > 0) {
        loopItems = loopItems.slice(0, step.loopMaxIters);
      }
      const stepResults: WorkflowStepResult[] = [];
      for (let i = 0; i < loopItems.length; i++) {
        const currentItem = loopItems[i];
        logMessage("debug", `[LOOP] Executing for ${currentItem} (${i + 1}/${loopItems.length})`, metadata);

        const loopPayload = {
          ...payload,
          currentItem: currentItem,
        };

        try {
          const apiResponse = await executeApiCall(step.apiConfig, loopPayload, credentials, options, metadata);
          const rawData = {currentItem: currentItem, ...(typeof apiResponse.data === 'object' ? apiResponse.data : {data: apiResponse.data})};
          const transformedData = await applyJsonata(rawData, step.responseMapping);
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
          const errorMessage = `[LOOP] Error processing '${currentItem}': ${String(callError)}`;
          logMessage("error", errorMessage, metadata);
          throw errorMessage;
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
    logMessage("info", `[LOOP] Execution '${step.id}' - Complete`, metadata);
    return result;
  }
};