import { type ApiConfig, type RequestOptions } from "@superglue/client";
import { getEvaluateStepResponseContext } from "../context/context-builders.js";
import { EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { Metadata } from "../graphql/types.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { isSelfHealingEnabled, maskCredentials } from "../utils/tools.js";
import { AbortError, ApiCallError } from "./api/api.js";
import { callEndpointLegacyImplementation, generateApiConfig } from "./api/api.legacy.js";

export async function evaluateStepResponse({
  data,
  endpoint,
  docSearchResultsForStepInstruction
}: {
  data: any,
  endpoint: ApiConfig,
  docSearchResultsForStepInstruction?: string
}): Promise<{ success: boolean, refactorNeeded: boolean, shortReason: string; }> {

  const evaluateStepResponsePrompt = getEvaluateStepResponseContext({ data, endpoint, docSearchResultsForStepInstruction }, { characterBudget: LanguageModel.contextLength / 10 });

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
  return response.response;
}

export async function executeStep({
  endpoint,
  payload,
  credentials,
  integrationManager,
  options,
  metadata,
}: {
  endpoint: ApiConfig,
  payload: any,
  credentials: Record<string, string>,
  integrationManager: IntegrationManager,
  options: RequestOptions,
  metadata: Metadata,
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
        logMessage('info', `Failed to execute API Call. Self healing the step configuration for ${endpoint?.urlHost}${retryCount > 0 ? ` (${retryCount})` : ""}`, metadata);
        const computedApiCallConfig = await generateApiConfig({
          apiConfig: endpoint,
          payload,
          credentials,
          retryCount,
          messages,
          integrationManager
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
        const result = await evaluateStepResponse({
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
      lastError = maskCredentials(rawErrorString, credentials).slice(0, 2000);
      if (retryCount > 0) {
        messages.push({ role: "user", content: `There was an error with the configuration, please fix: ${rawErrorString.slice(0, 4000)}` });
        logMessage('info', `API call failed. Last error: ${lastError}`, metadata);
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
    telemetryClient?.captureException(new Error(`API call failed. Last error: ${lastError}`), metadata.orgId, {
      endpoint: endpoint,
      retryCount: retryCount,
    });
    throw new ApiCallError(`API call failed. Last error: ${lastError}`, response?.statusCode);
  }

  return { data: response?.data, endpoint, statusCode: response?.statusCode, headers: response?.headers };
}
