import { ApiConfig, ApiInputRequest, CacheMode, Integration, RequestOptions, SelfHealingMode, TransformConfig } from "@superglue/client";
import type { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import OpenAI from "openai";
import { LanguageModel } from "../../llm/llm.js";
import { SELF_HEALING_API_AGENT_PROMPT } from "../../llm/prompts.js";
import { callEndpoint, evaluateResponse } from "../../utils/api.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { composeUrl, generateId, maskCredentials, sample } from "../../utils/tools.js";
import { executeTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { searchDocumentationToolDefinition, submitToolDefinition } from "../../workflow/workflow-tools.js";


export async function executeApiCall(
  endpoint: ApiConfig,
  payload: any,
  credentials: Record<string, string>,
  options: RequestOptions,
  metadata: Metadata,
  integration?: Integration,
): Promise<{
  data: any;
  endpoint: ApiConfig;
}> {
  let response: any = null;
  let retryCount = 0;
  let lastError: string | null = null;
  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  let success = false;
  let isSelfHealing = isSelfHealingEnabled(options);

  let documentationString = "";
  if (!integration && isSelfHealing) {
    logMessage('debug', `Self-healing enabled but no integration provided; skipping documentation-based healing.`, metadata);
  } else if (integration && integration.documentationPending) {
    logMessage('warn', `Documentation for integration ${integration.id} is still being fetched. Proceeding without documentation.`, metadata);
  } else if (integration.documentation) {
    documentationString = integration.documentation;
  }
  do {
    try {
      if (retryCount > 0 && isSelfHealing) {
        logMessage('info', `Generating API config for ${endpoint?.urlHost}${retryCount > 0 ? ` (${retryCount})` : ""}`, metadata);
        const computedApiCallConfig = await generateApiConfig(endpoint, documentationString, payload, credentials, retryCount, messages, { integration });
        endpoint = computedApiCallConfig.config;
        messages = computedApiCallConfig.messages;
      }

      response = await callEndpoint(endpoint, payload, credentials, options);

      if (!response.data) {
        throw new Error("No data returned from API. This could be due to a configuration error.");
      }

      // Check if response is valid
      if (retryCount > 0 && isSelfHealing) {
        const result = await evaluateResponse(response.data, endpoint.responseSchema, endpoint.instruction, documentationString);
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
      lastError = maskCredentials(rawErrorString, credentials).slice(0, 1000);
      if (retryCount === 0) {
        logMessage('info', `The initial configuration is not valid. Generating a new configuration. If you are creating a new configuration, this is expected.\n${lastError}`, metadata);
      }
      else if (retryCount > 0) {
        messages.push({ role: "user", content: `There was an error with the configuration, please fix: ${rawErrorString.slice(0, 2000)}` });
        logMessage('warn', `API call failed. ${lastError}`, metadata);
      }
    }
    retryCount++;
  } while (retryCount < (options?.retries !== undefined ? options.retries : 8));
  if (!success) {
    telemetryClient?.captureException(new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`), metadata.orgId, {
      endpoint: endpoint,
      retryCount: retryCount,
    });
    throw new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`);
  }

  return { data: response?.data, endpoint };
}


export async function generateApiConfig(
  apiConfig: Partial<ApiConfig>,
  documentation: string,
  payload: Record<string, any>,
  credentials: Record<string, any>,
  retryCount = 0,
  messages: OpenAI.Chat.ChatCompletionMessageParam[] = [],
  context?: any
): Promise<{ config: ApiConfig; messages: OpenAI.Chat.ChatCompletionMessageParam[]; }> {

  if (messages.length === 0) {
    const userPrompt = `Generate API configuration for the following:

<instruction>
${apiConfig.instruction}
</instruction>

<user_provided_information>
Also, the user provided the following information. Ensure to at least try where it makes sense:
Base URL: ${composeUrl(apiConfig.urlHost, apiConfig.urlPath)}
${apiConfig.headers ? `Headers: ${JSON.stringify(apiConfig.headers)}` : ""}
${apiConfig.queryParams ? `Query Params: ${JSON.stringify(apiConfig.queryParams)}` : ""}
${apiConfig.body ? `Body: ${JSON.stringify(apiConfig.body)}` : ''}
${apiConfig.authentication ? `Authentication: ${apiConfig.authentication}` : ''}
${apiConfig.dataPath ? `Data Path: ${apiConfig.dataPath}` : ''}
${apiConfig.pagination ? `Pagination: ${JSON.stringify(apiConfig.pagination)}` : ''}
${apiConfig.method ? `Method: ${apiConfig.method}` : ''}
</user_provided_information>

<documentation>
${documentation}
</documentation>

<available_credentials>
${Object.keys(credentials || {}).map(v => `<<${v}>>`).join(", ")}
</available_credentials>

<example_payload>
${JSON.stringify(sample(payload || {}, 5)).slice(0, LanguageModel.contextLength / 10)}
</example_payload>`;

    messages.push({
      role: "system",
      content: SELF_HEALING_API_AGENT_PROMPT
    });
    messages.push({
      role: "user",
      content: userPrompt
    });
  }

  const temperature = Math.min(retryCount * 0.1, 1);
  const { response: generatedConfig, messages: updatedMessages } = await LanguageModel.generateObject(
    messages,
    submitToolDefinition.arguments,
    temperature,
    [searchDocumentationToolDefinition],
    context
  );

  return {
    config: {
      instruction: apiConfig.instruction,
      urlHost: generatedConfig.apiConfig.urlHost,
      urlPath: generatedConfig.apiConfig.urlPath,
      method: generatedConfig.apiConfig.method,
      queryParams: generatedConfig.apiConfig.queryParams,
      headers: generatedConfig.apiConfig.headers,
      body: generatedConfig.apiConfig.body,
      authentication: generatedConfig.apiConfig.authentication,
      pagination: generatedConfig.apiConfig.pagination,
      dataPath: generatedConfig.apiConfig.dataPath,
      documentationUrl: apiConfig.documentationUrl,
      responseSchema: apiConfig.responseSchema,
      responseMapping: apiConfig.responseMapping,
      createdAt: apiConfig.createdAt || new Date(),
      updatedAt: new Date(),
      id: apiConfig.id || generateId(generatedConfig.apiConfig.urlHost, generatedConfig.apiConfig.urlPath),
    } as ApiConfig,
    messages: updatedMessages
  };
}


function isSelfHealingEnabled(options: RequestOptions): boolean {
  return options?.selfHealing ? options.selfHealing === SelfHealingMode.ENABLED || options.selfHealing === SelfHealingMode.REQUEST_ONLY : true;
}

export const callResolver = async (
  _: any,
  { input, payload, credentials, options }: {
    input: ApiInputRequest;
    payload: any;
    credentials?: Record<string, string>;
    options: RequestOptions;
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const startedAt = new Date();
  const callId = crypto.randomUUID();
  const metadata: Metadata = {
    runId: callId,
    orgId: context.orgId
  };
  let endpoint: ApiConfig;
  const readCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : false;

  try {

    // Get endpoint from datastore or use the one provided in the input
    if (input.id) {
      endpoint = await context.datastore.getApiConfig(input.id, context.orgId);
    } else {
      endpoint = input.endpoint;
    }

    // Check if response schema is zod and throw an error if it is
    if ((endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
      throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
    }

    const callResult = await executeApiCall(endpoint, payload, credentials, options, metadata);
    endpoint = callResult.endpoint;
    const data = callResult.data;

    // Transform response with built-in retry logic
    const transformResult = await executeTransform(
      {
        datastore: context.datastore,
        fromCache: readCache,
        input: { endpoint: endpoint as TransformConfig },
        data: data,
        metadata: { runId: callId, orgId: context.orgId },
        options: options
      }
    );

    // Save configuration if requested
    const config = { ...endpoint, ...transformResult?.config };

    if (writeCache) {
      context.datastore.upsertApiConfig(input.id || endpoint.id, config, context.orgId);
    }

    // Notify webhook if configured
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, transformResult.data);
    }

    const result = {
      id: callId,
      success: true,
      config: config,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun(result, context.orgId);
    return { ...result, data: transformResult.data };
  } catch (error) {
    const maskedError = maskCredentials(error.message, credentials);

    if (options?.webhookUrl) {
      await notifyWebhook(options.webhookUrl, callId, false, undefined, error.message);
    }
    const result = {
      id: callId,
      success: false,
      error: maskedError,
      config: endpoint,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun(result, context.orgId);
    return result;
  }
};