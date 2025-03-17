import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";
import { callEndpoint, generateApiConfig } from "../../../utils/api.js";
import { applyJsonataWithValidation } from "../../../utils/tools.js";
import type { ExecutionPlan, ExecutionStep, StepMapping, WorkflowResult } from "../domain/workflow.types.js";

export function extractTemplateVariables(text: string): string[] {
  const matches = text.match(/\$\{([^}]+)\}/g) || [];
  return matches.map((match) => match.slice(2, -1));
}

export async function executeApiCall(
  apiConfig: ApiConfig,
  callPayload?: Record<string, unknown>,
  credentials?: Record<string, unknown>,
  options?: RequestOptions,
): Promise<unknown> {
  try {
    console.log(`[API Call] ${apiConfig.id || 'unnamed'}: ${apiConfig.urlHost}${apiConfig.urlPath}`);
    
    const result = await callEndpoint(apiConfig, callPayload || {}, credentials || {}, options || { timeout: 60000 });
    
    return result.data;
  } catch (error) {
    console.error(`Error calling '${apiConfig.id || 'unnamed'}': ${String(error)}`);
    throw new Error(`API call '${apiConfig.id || 'unnamed'}' failed: ${String(error)}`);
  }
}

export async function processStepResult(stepId: string, result: unknown, stepMapping?: StepMapping): Promise<unknown> {
  try {
    // If there's no mapping or it's the identity mapping, return as-is
    if (!stepMapping?.responseMapping || stepMapping.responseMapping === "$") {
      return result;
    }

    const transformResult = await applyJsonataWithValidation(result, stepMapping.responseMapping, undefined);

    if (!transformResult.success) {
      console.error(`Mapping Error: Step '${stepId}' - Failed to apply response mapping`);
      throw new Error(`Response mapping failed: ${transformResult.error}`);
    }

    console.log(`Transform Step '${stepId}' - Applied response mapping`);
    return transformResult.data;
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
  urlPath: string = step.endpoint,
): Promise<ApiConfig> {
  // If step already has a config, just merge in the base headers
  if (step.apiConfig) {
    return {
      ...step.apiConfig,
      headers: {
        ...(baseApiInput?.headers || {}),
        ...(step.apiConfig.headers || {})
      }
    };
  }

  const apiInput: ApiInput = {
    ...(baseApiInput || {}),
    urlHost: executionPlan.apiHost,
    urlPath: urlPath,
    instruction: step.instruction,
  };

  const { config } = await generateApiConfig(apiInput, apiDocumentation || "");
  return config;
}
