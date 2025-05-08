import type { ExecutionStep, Metadata, RequestOptions, WorkflowStepResult } from "@superglue/shared";
import { applyJsonata } from "../utils/tools.js";
import { logMessage } from "../utils/logs.js";
import { executeApiCall } from "../graphql/resolvers/call.js";
import { generateMapping } from "../utils/transform.js";

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
      success: false
    }
    try {
      const apiResponse = await executeApiCall(step.apiConfig, payload, credentials, options, metadata);
      const transformedData = await applyJsonata(apiResponse.data, step.responseMapping);

      result.rawData = apiResponse.data;
      result.transformedData = transformedData;
      result.success = true;
      result.apiConfig = apiResponse.endpoint;

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
      success: false
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
      
      let cursors: any[] = await applyJsonata(payload, step.loopSelector);

      if (!Array.isArray(cursors) || cursors.length === 0) {
        if(step.loopSelector !== "$") logMessage("error", `[LOOP] No array found for '${step.loopSelector}' - regenerating loop selector`, metadata);
        const newLoopSelector = await generateMapping({ type: "array" }, payload, "Find the array of selector values for the following loop: " + step.id, metadata);
        step.loopSelector = newLoopSelector.jsonata;
        cursors = await applyJsonata(payload, step.loopSelector);
      }

      if(!Array.isArray(cursors) || cursors.length === 0) {
        throw new Error(`[LOOP] No values found for loop variable '${step.loopSelector}'`);
      }

      if (step.loopMaxIters > 0) {
        cursors = cursors.slice(0, step.loopMaxIters);
      }
      const stepResults: WorkflowStepResult[] = [];
      for (let i = 0; i < cursors.length; i++) {
        const cursor = cursors[i];
        logMessage("debug", `[LOOP] Executing for ${cursor} (${i + 1}/${cursors.length})`, metadata);

        const loopPayload = {
          ...payload,
          cursor: cursor,
        };

        try {
          const apiResponse = await executeApiCall(step.apiConfig, loopPayload, credentials, options, metadata);
          const rawData = {cursor: cursor, ... apiResponse.data};
          const transformedData = await applyJsonata(rawData, step.responseMapping);
          stepResults.push({ 
            stepId: step.id, 
            success: true, 
            rawData: rawData, 
            transformedData: transformedData,
            apiConfig: apiResponse.endpoint
          });

          // update the apiConfig with the new endpoint
          step.apiConfig = apiResponse.endpoint;

        } catch (callError) {
          const errorMessage = `[LOOP] Error processing '${cursor}': ${String(callError)}`;
          logMessage("error", errorMessage, metadata);
          throw errorMessage;
        }
      }
      result.apiConfig = step.apiConfig;
      result.rawData = stepResults.map(r => r.rawData);
      result.transformedData = stepResults.map(r => r.transformedData);
      result.success = stepResults.every(r => r.success);
      result.error = stepResults.filter(s => s.error).join("\n");
    } catch (error) {
      result.apiConfig = step.apiConfig;
      result.success = false;
      result.error = error.message || error;
    }
    logMessage("info", `[LOOP] Execution '${step.id}' - Complete`, metadata);
    return result;
  }
};