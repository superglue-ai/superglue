import { ApiConfig, ApiInputRequest, CacheMode, Context, Metadata, RequestOptions, TransformConfig } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import OpenAI from "openai";
import { callEndpoint, evaluateResponse, generateApiConfig } from "../../utils/api.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { applyJsonataWithValidation, maskCredentials, TransformResult } from "../../utils/tools.js";
import { prepareTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { callPostgres } from "../../utils/postgres.js";
import { logMessage } from "../../utils/logs.js";
import { Documentation } from "../../utils/documentation.js";
import { PROMPT_MAPPING } from "../../llm/prompts.js";

export async function executeApiCall(
  endpoint: ApiConfig,
  payload: any,
  credentials: Record<string, string>,
  options: RequestOptions,
  metadata: Metadata,
): Promise<{
  data: any;
  endpoint: ApiConfig;
}> {
  let response: any = null;
  let retryCount = 0;
  let lastError: string | null = null;
  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  let documentation: Documentation;
  let success = false;
  do {
    try {
      if(retryCount > 0) {
        logMessage('info', `Generating API config for ${endpoint?.urlHost}${retryCount > 0 ? ` (${retryCount})` : ""}`, metadata);      
        if(!documentation) {
          documentation = new Documentation(endpoint, metadata);
        }
        const documentationString = await documentation.fetch(endpoint.instruction);
        const computedApiCallConfig = await generateApiConfig(endpoint, documentationString, payload, credentials, retryCount, messages);      
        endpoint = computedApiCallConfig.config;
        messages = computedApiCallConfig.messages;
      }

      response = await callEndpoint(endpoint, payload, credentials, options);

      if (!response.data) {
        throw new Error("No data returned from API. This could be due to a configuration error.");
      }
      // Check if response is valid
      if(retryCount > 0) {
        const result = await evaluateResponse(response.data, endpoint.responseSchema, endpoint.instruction);
        success = result.success;
        if(!result.success) throw new Error(result.shortReason);
      }
      else {
        success = true;
      }
      break;
    }
    catch(error) {
      if(retryCount === 0) {
        logMessage('info', `The initial configuration is not valid. Generating a new configuration. If you are creating a new configuration, this is expected.`, metadata);
      }
      else if(retryCount > 0) {
        const rawErrorString = error?.message || JSON.stringify(error || {});
        lastError = maskCredentials(rawErrorString, credentials).slice(0, 200);
        messages.push({role: "user", content: `There was an error with the configuration, please fix: ${rawErrorString.slice(0, 2000)}`});
        if(rawErrorString.startsWith("JSONata")) {
          messages.push({role: "user", content: "Please find the JSONata guide here: "+ PROMPT_MAPPING});
        }
        logMessage('warn', `API call failed. ${lastError}`, metadata);
      }
    }
    retryCount++;
  } while (retryCount < 8);

  if (!success) {
    telemetryClient?.captureException(new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`), metadata.orgId, {
      endpoint: endpoint,
      retryCount: retryCount,
    });
    throw new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`);
  }

  return { data: response?.data, endpoint };
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
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;

  try {

    // Get endpoint from datastore or use the one provided in the input
    if(input.id) {
      endpoint = await context.datastore.getApiConfig(input.id, context.orgId);
    } else {
      endpoint = input.endpoint;
    }

    // Check if response schema is zod and throw an error if it is
    if((endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
      throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
    }

    const callResult = await executeApiCall(endpoint, payload, credentials, options, metadata);
    endpoint = callResult.endpoint;
    const data = callResult.data;

    let transformedResponse: TransformResult | null;
    let responseMapping: string | null;
    let transformError = null;
    let transformRetryCount = 0;

    do {
      try {
        // Transform response
        const preparedTransform = await prepareTransform(
          context.datastore, 
          readCache, 
          endpoint as TransformConfig, 
          data, 
          transformError,
          { runId: callId, orgId: context.orgId }
        );
        responseMapping = preparedTransform?.responseMapping;
        transformedResponse = responseMapping ? 
          await applyJsonataWithValidation(data, responseMapping, endpoint?.responseSchema) : 
          { success: true, data };

        if (!transformedResponse.success) {
          throw new Error(transformedResponse.error);
        }
      } catch (error) {
        const rawErrorString = error?.message || JSON.stringify(error || {});
        transformError = maskCredentials(rawErrorString, credentials).slice(0, 200);
        logMessage('warn', `Transformation failed. ${transformError}`, { runId: callId, orgId: context.orgId });
      }
      transformRetryCount++;
    } while (!transformedResponse.success && transformRetryCount < 3);

    if (!transformedResponse?.success) {
      throw new Error("Transformation failed. " + transformedResponse.error);
    }

    // Save configuration if requested
    const config = { ...endpoint, responseMapping: responseMapping};
    if(writeCache) {
      context.datastore.upsertApiConfig(input.id || endpoint.id, config, context.orgId);
    }

    // Notify webhook if configured
    // call async
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, transformedResponse.data); 
    }
    const result = {
      id: callId,
      success: true,
      config: config,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun(result, context.orgId);
    return {...result, data: transformedResponse.data};
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