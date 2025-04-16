import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";
import { callEndpoint } from "../../../utils/api.js";
import { applyJsonata } from "../../../utils/tools.js";
import type { ExecutionPlan, ExecutionStep, WorkflowResult } from "../domain/workflow.types.js";

export function extractTemplateVariables(str: string): string[] {
  if (!str) return [];
  // Only match {varName} patterns that aren't within JSON quotes
  const matches = str.match(/\{(\w+)\}/g) || [];
  return matches.map((match) => match.slice(1, -1));
}

export async function executeApiCall(
  apiConfig: ApiConfig,
  callPayload?: Record<string, unknown>,
  credentials?: Record<string, unknown>,
  options?: RequestOptions,
): Promise<unknown> {
  try {
    console.log(`[API Call] ${apiConfig.id} ${apiConfig.urlHost}${apiConfig.urlPath}`);

    const result = await callEndpoint(apiConfig, callPayload || {}, credentials || {}, options || { timeout: 60000 });

    return result.data;
  } catch (error) {
    console.error(`Error calling '${apiConfig.id || "unnamed"}': ${String(error)}`);
    throw new Error(`API call '${apiConfig.id || "unnamed"}' failed: ${String(error)}`);
  }
}

export async function processStepResult(stepId: string, result: unknown, step: ExecutionStep): Promise<unknown> {
  try {
    // If there's no mapping or it's the identity mapping, return as-is
    if (!step.responseMapping || step.responseMapping === "$") {
      return result;
    }
    const transformResult = await applyJsonata(result, step.responseMapping);
    return transformResult;
  } catch (error) {
    console.error(`Mapping Error: Step '${stepId}' - ${String(error)}`);
    return result;
  }
}

export function storeStepResult(
  stepId: string,
  result: WorkflowResult,
  rawData: unknown,
  transformedData: unknown,
  success: boolean,
  error?: string,
): void {
  const stepResult = {
    stepId,
    success,
    rawData,
    transformedData,
    error,
  };

  result.stepResults[stepId] = stepResult;

  if (success) {
    result.data[stepId] = transformedData;
    console.log(`Result Step '${stepId}' - Complete`);
  } else {
    console.error(`Result Step '${stepId}' - Failed: ${error}`);
  }
}

export async function prepareApiConfig(
  step: ExecutionStep,
  executionPlan: ExecutionPlan,
  apiDocumentation: string,
  baseApiInput?: ApiInput,
): Promise<ApiConfig> {
  // All steps must have apiConfig, so just merge in the base headers
  // TODO: could do a prepareApiConfig step to generate the apiConfig here anyway
  return {
    ...step.apiConfig,
    headers: {
      ...(baseApiInput?.headers || {}),
      ...(step.apiConfig.headers || {}),
    },
  };
}
