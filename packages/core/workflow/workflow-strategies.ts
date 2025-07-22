import type { ApiConfig, ExecutionStep, RequestOptions, WorkflowStepResult } from "@superglue/client";
import { SelfHealingMode } from "@superglue/client";
import { Integration, Metadata } from "@superglue/shared";
import { executeWorkflowStep } from "../graphql/resolvers/call.js";
import { logMessage } from "../utils/logs.js";
import { applyJsonata, applyTransformationWithValidation, flattenObject } from "../utils/tools.js";
import { generateTransformCode, generateTransformJsonata } from "../utils/transform.js";

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
    integration?: Integration
  ): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }
    try {
      const apiResponse = await executeWorkflowStep(
        step.apiConfig,
        payload,
        credentials,
        options,
        metadata,
        integration
      );
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
    integration?: Integration
  ): Promise<WorkflowStepResult> {
    const result: WorkflowStepResult = {
      stepId: step.id,
      success: false,
      config: step.apiConfig
    }

    try {
      if (!step.loopSelector) {
        if (Array.isArray(payload)) {
          // LEGACY: Default to JSONata "$" for backwards compatibility
          // New workflows should use JavaScript: "(data) => data"
          step.loopSelector = "$";
        }
        else {
          throw new Error("loopSelector is required for LOOP execution mode");
        }
      }

      let loopItems: any[] = [];

      // Apply loop selector using transformation validation to support both JSONata and JS
      const loopSelectorResult = await applyTransformationWithValidation(payload, step.loopSelector, null);
      if (loopSelectorResult.success) {
        loopItems = Array.isArray(loopSelectorResult.data) ? loopSelectorResult.data : [];
      }

      if (!Array.isArray(loopItems) || loopItems.length === 0) {
        logMessage("error", `No input data found for '${step.id}' - regenerating data selector`, metadata);

        // Detect if the original selector is JavaScript (starts with arrow function)
        const isJavaScript = typeof step.loopSelector === 'string' &&
          (step.loopSelector.trim().startsWith('(sourceData) =>') ||
            step.loopSelector.trim().startsWith('(sourceData)=>'));

        if (isJavaScript) {
          const instruction = `Create a JavaScript function that extracts the array of items to loop over for step: ${step.id}. 
          
Step instruction: ${step.apiConfig.instruction}

The function should:
1. Extract an array of ACTUAL DATA ITEMS (not metadata or property definitions)
2. Return an empty array if no valid data is found
3. Apply any filtering based on the step's instruction

Available data in sourceData:
${Object.keys(payload).map(key => {
            const value = payload[key];
            const type = Array.isArray(value) ? `array[${value.length}]` : typeof value;
            return `- ${key}: ${type}`;
          }).join('\n')}

The function should return an array of items that this step will iterate over.`;
          const arraySchema = { type: "array", description: "Array of items to iterate over" };
          const transformResult = await generateTransformCode(arraySchema, payload, instruction, metadata);

          if (transformResult?.mappingCode) {
            step.loopSelector = transformResult.mappingCode;
            const retryResult = await applyTransformationWithValidation(payload, step.loopSelector, null);
            if (retryResult.success) {
              loopItems = Array.isArray(retryResult.data) ? retryResult.data : [];
            }
          }
        } else {
          // LEGACY: Generate JSONata for existing workflows
          const newLoopSelector = await generateTransformJsonata({ type: "array" }, payload, "Find the array of selector values for the following loop: " + step.id, metadata);
          if (newLoopSelector?.jsonata) {
            step.loopSelector = newLoopSelector.jsonata;
            const retryResult = await applyTransformationWithValidation(payload, step.loopSelector, null);
            if (retryResult.success) {
              loopItems = Array.isArray(retryResult.data) ? retryResult.data : [];
            }
          }
        }
      }

      if (step.loopMaxIters > 0) {
        loopItems = loopItems.slice(0, step.loopMaxIters);
      }

      const stepResults: WorkflowStepResult[] = [];
      let successfulConfig: ApiConfig | null = null;

      for (let i = 0; i < loopItems.length; i++) {
        const currentItem = loopItems[i] || "";
        logMessage("debug", `Executing for ${JSON.stringify(currentItem).slice(0, 100)} (${i + 1}/${loopItems.length})`, metadata);

        const loopPayload: Record<string, any> = {
          ...payload,
          currentItem: currentItem,
          ...flattenObject(currentItem, 'currentItem')
        };

        try {
          let apiResponse;

          // First iteration OR after a failure: use executeApiCall with loop context
          if (i === 0 || !successfulConfig) {
            // Pass loop context in options
            const loopOptions = {
              ...options,
              testMode: options?.testMode && i === 0,
              loopContext: {
                isLoop: true,
                currentIteration: i + 1,
                totalIterations: loopItems.length,
                currentItem: currentItem,
                previousSuccesses: i,
                hasSuccessfulConfig: !!successfulConfig
              }
            };

            apiResponse = await executeWorkflowStep(
              successfulConfig || step.apiConfig,
              loopPayload,
              credentials,
              loopOptions,
              metadata,
              integration
            );

            // Store the successful configuration
            if (apiResponse.endpoint) {
              successfulConfig = apiResponse.endpoint;
              logMessage("debug", `Loop iteration ${i + 1} succeeded with self-healing, storing config`, metadata);
            }
          } else {
            // We have a successful config, try direct call for efficiency
            const { callEndpoint } = await import('../utils/api.js');

            try {
              const response = await callEndpoint(
                successfulConfig,
                loopPayload,
                credentials,
                options || {}
              );

              apiResponse = {
                data: response.data,
                endpoint: successfulConfig
              };
            } catch (directError) {
              // Direct call failed - fall back to executeApiCall with error context
              logMessage("warn", `Direct call failed at iteration ${i + 1}, falling back to self-healing: ${directError}`, metadata);

              const loopOptions = {
                ...options,
                selfHealing: SelfHealingMode.ENABLED,
                loopContext: {
                  isLoop: true,
                  currentIteration: i + 1,
                  totalIterations: loopItems.length,
                  currentItem: currentItem,
                  previousSuccesses: i,
                  hasSuccessfulConfig: true,
                  lastError: String(directError),
                  lastWorkingConfig: successfulConfig
                }
              };

              apiResponse = await executeWorkflowStep(
                successfulConfig,
                loopPayload,
                credentials,
                loopOptions,
                metadata,
                integration
              );

              // Update config if it changed
              if (apiResponse.endpoint && apiResponse.endpoint !== successfulConfig) {
                successfulConfig = apiResponse.endpoint;
                logMessage("info", `Loop self-healing updated configuration at iteration ${i + 1}`, metadata);
              }
            }
          }

          const rawData = { currentItem: currentItem, ...(typeof apiResponse.data === 'object' ? apiResponse.data : { data: apiResponse.data }) };
          const transformedData = await applyJsonata(rawData, step.responseMapping); //LEGACY: New workflow strategy will not use respone mappings
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

          successfulConfig = null;
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