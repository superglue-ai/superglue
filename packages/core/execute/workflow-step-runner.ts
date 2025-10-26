import { CodeConfig, type ApiConfig, type RequestOptions } from "@superglue/client";
import { Message } from "@superglue/shared";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { server_defaults } from "../default.js";
import { generateConfigImplementation, validateConfigWithAgent } from "../generate/config.js";
import { Metadata } from "../graphql/types.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { isSelfHealingEnabled } from "../utils/tools.js";
import { callEndpointLegacyImplementation } from "./api.legacy.js";
import { executeCodeConfig } from "./execute.js";
import { ApiCallError } from "./http.js";

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
  let response: Partial<AxiosResponse> = null;
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
  const integration = await integrationManager?.getIntegration();
  const integrationId = integration?.id;
  const scopedCredentials = integrationId 
    ? Object.entries(credentials)
        .filter(([key]) => key.startsWith(`${integrationId}_`) || !key.includes('_'))
        .reduce((acc, [key, val]) => ({ ...acc, [key.replace(`${integrationId}_`, '')]: val }), {})
    : credentials;

  do {

    // Generate config only on first iteration
    if (retryCount === 0 && !codeConfig && !endpoint) {
      throw new Error("Either codeConfig or apiConfig must be provided");
    }
    if (retryCount > 0 && isSelfHealing) {
      logMessage('info', `Generating code config (${retryCount})`, metadata);
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
      if (!result.success) {
        throw new Error(`Failed to generate code config: ${result.error}`);
      }
      codeConfig.code = result.data?.config?.code;
      codeConfig.pagination = result.data?.config?.pagination;
    }
  // Execute config (wrapped in try-catch)
    let executionError: string | null = null;
    try {
      if (codeConfig) {
        response = await executeCodeConfig({
          codeConfig,
          inputData,
          credentials: scopedCredentials,
          integration,
          options,
          metadata
        });
      } else if (endpoint) {
        response = await callEndpointLegacyImplementation({ 
          endpoint: endpoint as ApiConfig, 
          payload: inputData, 
          credentials: credentials, 
          options 
        });
      }

      if (!response?.data) {
        executionError = "No data returned from API";
      }
    } catch (execError: any) {
      executionError = execError?.message || JSON.stringify(execError || {});
      if (!response?.status) {
        response = { ...response, status: execError instanceof ApiCallError ? execError.statusCode : 500 };
      }
    }

    // ALWAYS validate (whether execution succeeded or failed)
    const shouldValidate = isSelfHealing || options.testMode || retryCount > 0;
    
    if (shouldValidate && codeConfig) {
      const validationResult = await validateConfigWithAgent({
        currentConfig: codeConfig,
        inputData,
        credentials: scopedCredentials,
        response,
        executionError,
        integrationManager,
        messages,
        runId: metadata.runId,
        orgId: metadata.orgId
      });
      
      if (validationResult.validated) {
        success = true;
        break;
      }
    } else {
      // No validation - check execution result
      if (executionError) {
        lastError = executionError;
        logMessage('warn', `Execution failed: ${lastError}`, metadata);
      }
      success = true;
      break;
    }

    retryCount++;
  } while (retryCount <= effectiveMaxRetries && isSelfHealing);
  
  if (!success) {
    const config = codeConfig || endpoint;
    telemetryClient?.captureException(new Error(`API call failed. Last error: ${lastError}`), metadata.orgId, {
      config,
      retryCount: retryCount,
    });
    throw new ApiCallError(`API call failed. Last error: ${lastError}`, response?.status);
  }

  return { 
    data: response?.data, 
    endpoint, 
    codeConfig,
    statusCode: response?.status, 
    request: response?.request 
  };
}
