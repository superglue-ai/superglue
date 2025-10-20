import { type ApiConfig, type RequestOptions } from "@superglue/client";
import { Message } from "@superglue/shared";
import { server_defaults } from "../default.js";
import { type CodeConfig, generateConfigImplementation } from "../generate/config.js";
import { evaluateStepResponse } from "../generate/step-evaluation.js";
import { Metadata } from "../graphql/types.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { isSelfHealingEnabled, maskCredentials } from "../utils/tools.js";
import { callEndpointLegacyImplementation } from "./api.legacy.js";
import { executeCodeConfig } from "./execute.js";
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
  headers: Record<string, any>;
}> {
  let response: any = null;
  let retryCount = 0;
  let lastError: string | null = null;
  let messages: Message[] = [];
  let success = false;
  let isSelfHealing = isSelfHealingEnabled(options, "api");

  // Validate that at least one config type is provided
  if (!codeConfig && !endpoint) {
    throw new Error("Either codeConfig or endpoint (apiConfig) must be provided");
  }

  // If self healing is enabled, use the retries from the options or the default max of 10 if not specified, otherwise use 1 (no self-healing case)
  const effectiveMaxRetries = isSelfHealing ? (options?.retries !== undefined ? options.retries : server_defaults.MAX_CALL_RETRIES) : 1;

  do {
    try {
      if (retryCount > 0 && isSelfHealing) {
        // Always use new generation for self-healing (works for both config types)
        logMessage('info', `Generating code config (retry ${retryCount})`, metadata);
        const currentConfig = codeConfig || endpoint;
        const result = await generateConfigImplementation({}, {
          runId: metadata.runId,
          orgId: metadata.orgId,
          apiConfig: currentConfig as any,
          inputData,
          credentials,
          retryCount,
          messages,
          integrationManager
        });
        
        if (!result.success || !result.data) {
          throw new Error(result.error || "Failed to generate code config");
        }
        
        // Always use codeConfig for self-healing (converts legacy on retry)
        codeConfig = result.data as CodeConfig;
      }

      const integration = await integrationManager?.getIntegration();
      const integrationId = integration?.id;
      const scopedCredentials = integrationId 
        ? Object.entries(credentials)
            .filter(([key]) => key.startsWith(`${integrationId}_`))
            .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {})
        : credentials;

      // Execute the appropriate config type
      // If we have codeConfig (either from start or from self-healing conversion), use code executor
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
          credentials: scopedCredentials, 
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
        const instruction = codeConfig?.stepInstruction || endpoint?.instruction;
        const result = await evaluateStepResponse({
          data: response.data,
          endpoint: endpoint || { instruction } as ApiConfig,
          documentation: await integrationManager?.searchDocumentation(instruction || '')
        });
        success = result.success;
        if (!result.success) throw new Error(result.shortReason + " " + JSON.stringify(response.data).slice(0, 1000));
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
          content: `There was an error with the configuration, please fix: ${rawErrorString.slice(0, 4000)}`,
          timestamp: new Date()
        });
        logMessage('warn', `API call failed. ${lastError}`, metadata);
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
    headers: response?.headers 
  };
}
