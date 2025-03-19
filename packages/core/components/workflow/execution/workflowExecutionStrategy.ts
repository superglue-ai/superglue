import type { ApiInput, RequestOptions } from "@superglue/shared";
import type {
  ExecutionPlan,
  ExecutionStep,
  StepAnalysis,
  VariableMapping,
  WorkflowResult,
} from "../domain/workflow.types.js";
import { extractValues, findValue } from "./dataExtractor.js";
import {
  executeApiCall,
  extractTemplateVariables,
  prepareApiConfig,
  processStepResult,
  storeStepResult,
} from "./workflowUtils.js";

export interface ExecutionContext {
  step: ExecutionStep;
  executionPlan: ExecutionPlan;
  result: WorkflowResult;
  apiDocumentation: string;
  stepAnalysis?: StepAnalysis;
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
  stepAnalysis?: StepAnalysis,
  baseApiInput?: ApiInput,
  options?: RequestOptions,
): Promise<boolean> {
  const ctx: ExecutionContext = {
    step,
    executionPlan,
    result,
    apiDocumentation,
    stepAnalysis,
    baseApiInput,
  };

  const strategy = getStrategy(step.executionMode);
  return strategy.execute(ctx, payload, credentials, options);
}

// ======= Helper functions =======

function findLoopVariable(ctx: ExecutionContext): [string, VariableMapping | undefined] {
  const { step, stepAnalysis, result } = ctx;

  // If the step has a loopVariable defined, use it first
  if (step.loopVariable) {
    console.log(`Using explicitly configured loop variable: ${step.loopVariable}`);

    // Find this variable in the mappings
    if (stepAnalysis?.variableMapping?.[step.loopVariable]) {
      return [step.loopVariable, stepAnalysis.variableMapping[step.loopVariable]];
    }

    // Create a default mapping using a previous step as source
    const previousStepIds = Object.keys(result.stepResults);
    if (previousStepIds.length > 0) {
      const lastStepId = previousStepIds[previousStepIds.length - 1];
      const defaultMapping: VariableMapping = {
        source: lastStepId,
        path: step.loopVariable,
        isArray: true,
      };
      return [step.loopVariable, defaultMapping];
    }
  }

  // Otherwise, find first array variable in mappings
  if (stepAnalysis?.variableMapping) {
    for (const [varName, mapping] of Object.entries(stepAnalysis.variableMapping)) {
      if (mapping.isArray) {
        return [varName, mapping];
      }
    }
  }

  return ["", undefined];
}

async function getLoopValues(
  ctx: ExecutionContext,
  mapping: VariableMapping,
  loopVarName: string,
  payload: Record<string, unknown>,
): Promise<any[]> {
  const { executionPlan, result } = ctx;

  // Use explicitly selected values if available
  if (mapping.selectedValues && mapping.selectedValues.length > 0) {
    console.log(`[LOOP] Using explicitly selected values: ${mapping.selectedValues.length} items`);
    return mapping.selectedValues;
  }

  // Get values from payload if that's the source
  if (mapping.source === "payload") {
    const payloadValue = payload[loopVarName];
    if (Array.isArray(payloadValue)) {
      console.log(`[LOOP] Using array from payload: ${payloadValue.length} items`);
      return payloadValue;
    }

    if (payloadValue !== undefined) {
      console.log("[LOOP] Using single value from payload");
      return [payloadValue];
    }
    return [];
  }

  // Get values from a previous step
  const sourceResult = result.stepResults[mapping.source]?.transformedData;
  if (!sourceResult) {
    console.log(`[LOOP] No data found for source step ${mapping.source}`);
    return [];
  }

  // Find the source step to check configuration for extracting array values
  const sourceStep = executionPlan.steps.find((s) => s.id === mapping.source);

  // Extract values using multiple strategies
  if (sourceStep) {
    // Check responseField and objectKeysAsArray flag
    if (sourceStep.responseField && typeof sourceResult === "object" && sourceResult !== null) {
      const fieldName = sourceStep.responseField;
      if (fieldName in (sourceResult as Record<string, unknown>)) {
        const fieldValue = (sourceResult as Record<string, unknown>)[fieldName];

        // If fieldValue is an object and objectKeysAsArray is true, use its keys
        if (
          sourceStep.objectKeysAsArray &&
          fieldValue &&
          typeof fieldValue === "object" &&
          !Array.isArray(fieldValue)
        ) {
          const keys = Object.keys(fieldValue as Record<string, unknown>);
          console.log(`[LOOP] Using keys from responseField '${fieldName}': ${keys.length} keys`);
          return keys;
        }

        // If fieldValue is an array, use it directly
        if (Array.isArray(fieldValue)) {
          console.log(`[LOOP] Using array from responseField '${fieldName}': ${fieldValue.length} items`);
          return fieldValue;
        }
      }
    }

    // Check for arrayPath
    if (sourceStep.arrayPath && typeof sourceResult === "object" && sourceResult !== null) {
      let currentValue: unknown = sourceResult;
      const pathParts = sourceStep.arrayPath.split(".");

      for (const part of pathParts) {
        if (currentValue && typeof currentValue === "object" && part in (currentValue as Record<string, unknown>)) {
          currentValue = (currentValue as Record<string, unknown>)[part];
        } else {
          currentValue = undefined;
          break;
        }
      }

      if (Array.isArray(currentValue)) {
        console.log(`[LOOP] Found array at path '${sourceStep.arrayPath}': ${currentValue.length} items`);
        return currentValue;
      }

      // Path led to an object, if objectKeysAsArray is true, return its keys
      if (sourceStep.objectKeysAsArray && currentValue && typeof currentValue === "object") {
        const keys = Object.keys(currentValue as Record<string, unknown>);
        console.log(`[LOOP] Using keys at path '${sourceStep.arrayPath}': ${keys.length} keys`);
        return keys;
      }
    }
  }

  // Try using data extractor with the provided path
  try {
    const values = extractValues(sourceResult as Record<string, unknown>, mapping.path);
    if (values.length > 0) {
      console.log(`[LOOP] Extracted ${values.length} values using path '${mapping.path}'`);
      return values;
    }
  } catch (error) {
    console.warn(`[LOOP] Error extracting values using path '${mapping.path}'`);
  }

  // Check if the source has a property matching the loop variable name
  if (
    typeof sourceResult === "object" &&
    !Array.isArray(sourceResult) &&
    sourceResult !== null &&
    loopVarName in (sourceResult as Record<string, unknown>)
  ) {
    const varValue = (sourceResult as Record<string, unknown>)[loopVarName];
    if (Array.isArray(varValue)) {
      console.log(`[LOOP] Found array property matching variable name: ${varValue.length} items`);
      return varValue;
    }
  }

  // If sourceStep has objectKeysAsArray, use object keys
  if (
    sourceStep?.objectKeysAsArray &&
    typeof sourceResult === "object" &&
    sourceResult !== null &&
    !Array.isArray(sourceResult)
  ) {
    const keys = Object.keys(sourceResult as Record<string, unknown>);
    console.log(`[LOOP] Using object keys from source result: ${keys.length} keys`);
    return keys;
  }

  // If the source result itself is an array, use it
  if (Array.isArray(sourceResult)) {
    console.log(`[LOOP] Source result is already an array: ${sourceResult.length} items`);
    return sourceResult;
  }

  // Try to find any array in the source result's properties
  if (typeof sourceResult === "object" && sourceResult !== null) {
    for (const [key, value] of Object.entries(sourceResult)) {
      if (Array.isArray(value) && value.length > 0) {
        console.log(`[LOOP] Found array in property '${key}': ${value.length} items`);
        return value;
      }
    }
  }

  console.log(`[LOOP] No array values found for loop variable '${loopVarName}'`);
  return [];
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

      // Verify step analysis exists
      if (!ctx.stepAnalysis) {
        throw new Error("Step analysis is required for LOOP execution mode");
      }

      const [loopVarName, loopMapping] = findLoopVariable(ctx);

      if (!loopVarName || !loopMapping) {
        console.error(`[LOOP] No loop variable found for step ${step.id}`);
        storeStepResult(step.id, result, undefined, undefined, false, "No loop variable found");
        return false;
      }

      console.log(`[LOOP] Step '${step.id}' - Using variable '${loopVarName}' from '${loopMapping.source}'`);

      const loopValues = await getLoopValues(ctx, loopMapping, loopVarName, payload);

      if (loopValues.length === 0) {
        console.error(`[LOOP] No values found for loop variable '${loopVarName}'`);
        storeStepResult(step.id, result, undefined, undefined, false, "No loop values found");
        return false;
      }

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

      console.log(`[LOOP] Found ${effectiveLoopValues.length} values, example: '${effectiveLoopValues[0]}'`);

      const apiConfig = await prepareApiConfig(step, executionPlan, apiDocumentation, baseApiInput);
      const results = [];
      for (let i = 0; i < effectiveLoopValues.length; i++) {
        const loopValue = effectiveLoopValues[i];
        console.log(`[LOOP] Processing value ${i + 1}/${effectiveLoopValues.length}: ${loopValue}`);

        // Create payload with loop variable
        const loopPayload = {
          ...payload,
          [loopVarName]: loopValue,
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
