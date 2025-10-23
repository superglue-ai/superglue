import { CodeConfig, type ApiConfig, type RequestOptions } from "@superglue/client";
import { Message } from "@superglue/shared";
import { AxiosRequestConfig } from "axios";
import { server_defaults } from "../default.js";
import { generateConfigImplementation } from "../generate/config.js";
import { evaluateStepResponse } from "../generate/step-evaluation.js";
import { Metadata } from "../graphql/types.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { isSelfHealingEnabled, maskCredentials } from "../utils/tools.js";
import { callEndpointLegacyImplementation } from "./api.legacy.js";
import { executeCodeConfig, ExecutionResult } from "./execute.js";
import { AbortError, ApiCallError } from "./http.js";

export async function executeStep({
  endpoint,
  codeConfig,
  inputData,
  credentials,
  integrationManager,
  options,
  metadata,
}: {
  endpoint?: ApiConfig,
  codeConfig?: CodeConfig,
  inputData: Record<string, any>,
  credentials: Record<string, string>,
  integrationManager: IntegrationManager,
  options: RequestOptions,
  metadata: Metadata,
}): Promise<{
  data: any;
  endpoint?: ApiConfig;
  codeConfig?: CodeConfig;
  statusCode: number;
  request: AxiosRequestConfig;
}> {
  let response: ExecutionResult = null;
  let retryCount = 0;
  let lastError: string | null = null;
  let messages: Message[] = [];
  let success = false;
  let isSelfHealing = isSelfHealingEnabled(options, "api");

  // Validate that at least one config type is provided
  if (!codeConfig && !endpoint) {
    throw new Error("Either codeConfig or apiConfig must be provided");
  }

  // If self healing is enabled, use the retries from the options or the default max of 10 if not specified, otherwise use 0 (no self-healing case)
  const effectiveMaxRetries = isSelfHealing ? (options?.retries !== undefined ? options.retries : server_defaults.MAX_CALL_RETRIES) : 0;

  do {
    try {
      const integration = await integrationManager?.getIntegration();
      const integrationId = integration?.id;
      const scopedCredentials = integrationId 
      ? Object.entries(credentials)
          .filter(([key]) => key.startsWith(`${integrationId}_`) || !key.includes('_'))
          .reduce((acc, [key, val]) => ({ ...acc, [key.replace(`${integrationId}_`, '')]: val }), {})
      : credentials;

      if (retryCount > 0 && isSelfHealing) {
        logMessage('info', `Generating code config (retry ${retryCount})`, metadata);
        const currentConfig = codeConfig || endpoint;
        const result = await generateConfigImplementation({}, {
          runId: metadata.runId,
          orgId: metadata.orgId,
          currentConfig,
          inputData,
          credentials: scopedCredentials,
          retryCount,
          messages,
          integrationManager
        });
        messages = result.data?.updatedMessages || [];
        if (!result.success || !result.data) {
          throw new Error(result.error || "Failed to generate code config");
        }
        
        codeConfig = result.data?.config as CodeConfig;
      }

      if (codeConfig) {
        // Scope credentials to only the relevant integration for security
        response = await executeCodeConfig({
          codeConfig,
          inputData,
          credentials: scopedCredentials,
          integration,
          options,
          metadata
        });
      } else if (endpoint) {
        // Legacy execution (only on first attempt without self-healing)
        response = await callEndpointLegacyImplementation({ 
          endpoint: endpoint as ApiConfig, 
          payload: inputData, 
          credentials: credentials, 
          options 
        });
      }
      else {
        throw new Error("No config type provided");
      }

      if (!response.data) {
        throw new Error("No data returned from API. This could be due to a configuration error.");
      }

      // Check if response is valid
      if (retryCount > 0 && isSelfHealing || options.testMode) {
        const stepConfigString = `<step_config>${JSON.stringify(codeConfig || endpoint)}</step_config>\n<generated_config>${JSON.stringify(response.request)}</generated_config>`;
        const instruction = codeConfig?.stepInstruction || endpoint?.instruction;
        const result = await evaluateStepResponse({
          data: response.data,
          stepConfigString,
          docSearchResultsForStepInstruction: await integrationManager?.searchDocumentation(instruction)
        });
        success = result.success;
        if (!result.success) throw new Error(result?.shortReason.slice(0, 2000) + " " + JSON.stringify(response.data).slice(0, 1000) + " for request: " + JSON.stringify(response.request).slice(0, 1000));
      }
      else {
        success = true;
      }
      break;
    }
    catch (error: any) {
      const rawErrorString = error?.message || JSON.stringify(error || {});
      lastError = maskCredentials(rawErrorString, credentials).slice(0, 2000);
      if (retryCount > 0) {
        messages.push({ 
          id: `retry-${retryCount}`,
          role: "user", 
          content: `There was an error with the configuration, please fix: ${rawErrorString}`,
          timestamp: new Date()
        });
        logMessage('warn', `API call failed. ${lastError}`, metadata);
      }

      if (!response?.statusCode) {
        response = { ...response, statusCode: error instanceof ApiCallError ? error.statusCode : 500 };
      }
      if (error instanceof AbortError) {
        break;
      }
    }
    retryCount++;
  } while (retryCount <= effectiveMaxRetries);
  
  if (!success) {
    const config = codeConfig || endpoint;
    telemetryClient?.captureException(new Error(`API call failed. Last error: ${lastError}`), metadata.orgId, {
      config,
      retryCount: retryCount,
    });
    throw new ApiCallError(`API call failed. Last error: ${lastError}`, response?.statusCode);
  }

  return { 
    data: response?.data, 
    endpoint, 
    codeConfig,
    statusCode: response?.statusCode, 
    request: response?.request 
  };
}
