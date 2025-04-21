import { ApiConfig, ApiInputRequest, CacheMode, Context, Metadata, RequestOptions, TransformConfig } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import OpenAI from "openai";
import { callEndpoint, prepareEndpoint } from "../../utils/api.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { applyJsonataWithValidation, composeUrl, maskCredentials, TransformResult } from "../../utils/tools.js";
import { prepareTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { callPostgres } from "../../utils/postgres.js";
import { logMessage } from "../../utils/logs.js";

// TODO: This is in dire need for refactoring and proper testing

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
  let preparedEndpoint: ApiConfig;
  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  const readCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;

  // Check if response schema is zod and throw an error if it is
  if((input.endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
    throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
  }

  try {
    // Resolve endpoint configuration from cache or prepare new one
    let response: any;
    let retryCount = 0;
    let lastError: string | null = null;
    do {
      try {
        let didReadFromCache = false;
        if(readCache && !lastError) {
          preparedEndpoint = await context.datastore.getApiConfig(input.id, context.orgId) || 
            await context.datastore.getApiConfigFromRequest(input.endpoint, payload, context.orgId) 
          didReadFromCache = true;
        }
        if(!didReadFromCache || !preparedEndpoint) {
          const result = await prepareEndpoint(preparedEndpoint || input.endpoint, payload, credentials, metadata, retryCount, messages);
          preparedEndpoint = result.config;
          messages = result.messages;
        }

        if(!preparedEndpoint) {
          throw new Error("Did not find a valid endpoint configuration. If you did provide an id, please ensure cache reading is enabled.");
        }
        logMessage('info', `API call: ${preparedEndpoint.method} ${preparedEndpoint.urlHost}`, metadata);

        if(preparedEndpoint.urlHost.startsWith("postgres")) {
          response = await callPostgres(preparedEndpoint, payload, credentials, options);
        }
        else {
          response = await callEndpoint(preparedEndpoint, payload, credentials, options);
        }

        if(!response.data) {
          response = null;
          throw new Error("No data returned from API. This could be due to a configuration error.");
        }


      } catch (error) {
        const rawErrorString = error?.message || JSON.stringify(error || {});
        lastError = maskCredentials(rawErrorString, credentials).slice(0, 200);
        messages.push({role: "user", content: `There was an error with the configuration, please retry: ${rawErrorString.slice(0, 2000)}`});
        logMessage('warn', `API call failed. ${lastError}`, { runId: callId, orgId: context.orgId });
      }
      retryCount++;
    } while (!response && retryCount < 5);
    
    if(!response) {
      telemetryClient?.captureException(new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`), context.orgId, {
        preparedEndpoint: preparedEndpoint,
        retryCount: retryCount,
      });
      throw new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`);
    }

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
          preparedEndpoint as TransformConfig, 
          response.data, 
          transformError,
          { runId: callId, orgId: context.orgId }
        );
        responseMapping = preparedTransform?.responseMapping;
        transformedResponse = responseMapping ? 
          await applyJsonataWithValidation(response.data, responseMapping, preparedEndpoint?.responseSchema) : 
          { success: true, data: response.data };

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
    const config = { ...preparedEndpoint, responseMapping: responseMapping};
    if(writeCache) {
      if(input.id) {
        context.datastore.upsertApiConfig(input.id, config, context.orgId);
      } else if(input.endpoint) {
        context.datastore.saveApiConfig(input.endpoint, payload, config, context.orgId);
      }
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
      config: preparedEndpoint,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun(result, context.orgId);
    return result;
  }
};