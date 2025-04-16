import type { ApiInput, RequestOptions } from "@superglue/shared";
import type { ExecutionPlan, ExecutionStep, VariableMapping, WorkflowResult } from "../domain/workflow.types.js";
import { extractValues, findValue } from "./dataExtractor.js";
import {
  executeApiCall,
  extractTemplateVariables,
  prepareApiConfig,
  processStepResult,
  storeStepResult,
} from "./workflowUtils.js";
import { applyJsonata } from "../../../utils/tools.js";

export interface ExecutionContext {
  step: ExecutionStep;
  executionPlan: ExecutionPlan;
  result: WorkflowResult;
  apiDocumentation: string;
  baseApiInput?: ApiInput;
}

export interface ExecutionStrategy {
  execute(
    ctx: ExecutionContext,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean>;
}

// Registry of execution strategies
const strategyRegistry = new Map<string, ExecutionStrategy>();

export function registerStrategy(mode: string, strategy: ExecutionStrategy): void {
  strategyRegistry.set(mode, strategy);
}

export function getStrategy(mode: string): ExecutionStrategy {
  const strategy = strategyRegistry.get(mode);
  if (!strategy) {
    throw new Error(`No strategy registered for execution mode: ${mode}`);
  }
  return strategy;
}

export async function executeWorkflowStep(
  step: ExecutionStep,
  executionPlan: ExecutionPlan,
  result: WorkflowResult,
  apiDocumentation: string,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  baseApiInput?: ApiInput,
  options?: RequestOptions,
): Promise<boolean> {
  const ctx: ExecutionContext = {
    step,
    executionPlan,
    result,
    apiDocumentation,
    baseApiInput,
  };

  const strategy = getStrategy(step.executionMode);
  return strategy.execute(ctx, payload, credentials, options);
}

// ======= Strategy implementations =======

const directStrategy: ExecutionStrategy = {
  async execute(
    ctx: ExecutionContext,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      const { step, executionPlan, result, apiDocumentation, baseApiInput } = ctx;
      const apiConfig = await prepareApiConfig(step, executionPlan, apiDocumentation, baseApiInput);
      const templateVars = extractTemplateVariables(apiConfig.urlPath || "");
      const enhancedPayload = { ...payload };

      // Add template variables from previous steps
      for (const varName of templateVars) {
        // Skip if already in payload
        if (varName in enhancedPayload) continue;

        // Try to find in previous steps
        for (const [stepId, stepResult] of Object.entries(result.stepResults)) {
          const depResult = stepResult?.transformedData;
          if (depResult && typeof depResult === "object") {
            const value = findValue(depResult as Record<string, unknown>, varName);
            if (value !== undefined) {
              enhancedPayload[varName] = value;
              break;
            }
          }
        }
      }

      const apiResponse = await executeApiCall(apiConfig, enhancedPayload, credentials, options);
      const processedResult = await processStepResult(step.id, apiResponse, step);
      storeStepResult(step.id, result, apiResponse, processedResult, true);

      return true;
    } catch (error) {
      const { step, result } = ctx;
      console.error(`Error in direct execution for step ${step.id}:`, error);
      storeStepResult(step.id, result, undefined, undefined, false, String(error));
      return false;
    }
  },
};

const loopStrategy: ExecutionStrategy = {
  async execute(
    ctx: ExecutionContext,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      const { step, executionPlan, result, apiDocumentation, baseApiInput } = ctx;

      // LOOP mode requires an explicit loopSelector
      if (!step.loopSelector) {
        if(!Array.isArray(payload)) {
          step.loopSelector = "$";
        }
        else {
          throw new Error("loopSelector is required for LOOP execution mode");
        }
      }
      
      const loopValues: any[] = await applyJsonata(payload, step.loopSelector);

      if (!Array.isArray(loopValues) || loopValues.length === 0) {
        console.error(`[LOOP] No values found for loop variable '${step.loopSelector}'`);
        storeStepResult(step.id, result, undefined, undefined, false, "No loop values found");
        return false;
      }
      console.log(`[LOOP] Step '${step.id}' - Using variable '${step.loopSelector}' with ${loopValues.length}`);

      // Apply loop max iterations limit if specified
      let effectiveLoopValues = loopValues;
      if (step.loopMaxIters !== undefined && step.loopMaxIters >= 0) {
        if (loopValues.length > step.loopMaxIters) {
          console.log(
            `[LOOP] Limiting to ${step.loopMaxIters} of ${loopValues.length} values due to loopMaxIters=${step.loopMaxIters}`,
          );
          effectiveLoopValues = loopValues.slice(0, step.loopMaxIters);
        }
      }

      const apiConfig = await prepareApiConfig(step, executionPlan, apiDocumentation, baseApiInput);
      const results = [];
      for (let i = 0; i < effectiveLoopValues.length; i++) {
        const loopValue = effectiveLoopValues[i];
        console.log(`[LOOP] Processing value ${i + 1}/${effectiveLoopValues.length}: ${loopValue}`);

        // Create payload with loop variable
        const loopPayload = {
          ...payload,
          value: loopValue,
        };

        // TODO: create api config per call?
        // For each loop value, create a copy of the API config with the variables replaced
        // const urlPathWithVars = apiConfig.urlPath?.replace(new RegExp(`\\{${loopVarName}\\}`, "g"), String(loopValue));
        // const apiConfig = {
        //   ...baseApiConfig,
        //   urlPath: urlPathWithVars,
        // };
        try {
          const apiResponse = await executeApiCall(apiConfig, loopPayload, credentials, options);
          const processedResult = await processStepResult(step.id, apiResponse, step);
          results.push({ raw: apiResponse, processed: processedResult });
        } catch (callError) {
          console.error(`[LOOP] Error processing value '${loopValue}': ${String(callError)}`);
          // Continue with other values even if one fails
        }
      }

      // Handle results
      if (results.length === 0) {
        console.error(`[LOOP] All API calls failed for step ${step.id}`);
        storeStepResult(step.id, result, undefined, undefined, false, "All loop iterations failed");
        return false;
      }
      const rawResponses = results.map((r) => r.raw);
      const processedResults = results.map((r) => r.processed);

      storeStepResult(step.id, result, rawResponses, processedResults, true);
      return true;
    } catch (error) {
      const { step, result } = ctx;
      console.error(`[LOOP] Error in step ${step.id}: ${String(error)}`);
      storeStepResult(step.id, result, undefined, undefined, false, String(error));
      return false;
    }
  },
};

// Register built-in strategies
registerStrategy("DIRECT", directStrategy);
registerStrategy("LOOP", loopStrategy);
