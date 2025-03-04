import { ApiConfig, ApiInputRequest, CacheMode, Context, RequestOptions, TransformConfig } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import OpenAI from "openai";
import { v4 as uuidv4 } from 'uuid';
import { callEndpoint, prepareEndpoint } from "../../utils/api.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { applyJsonataWithValidation, maskCredentials } from "../../utils/tools.js";
import { prepareTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";

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
  const callId = uuidv4() as string;

  let preparedEndpoint: ApiConfig;
  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  const readCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;

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
        if(readCache && !lastError) {
          preparedEndpoint = await context.datastore.getApiConfig(input.id, context.orgId) || 
            await context.datastore.getApiConfigFromRequest(input.endpoint, payload, context.orgId) 
        }
        else if(preparedEndpoint || input.endpoint) {
          const result = await prepareEndpoint(preparedEndpoint || input.endpoint, payload, credentials, lastError, messages);
          preparedEndpoint = result.config;
          messages = result.messages;
        }

        if(!preparedEndpoint) {
          throw new Error("Did not find a valid endpoint configuration. If you did provide an id, please ensure cache reading is enabled.");
        }

        response = await callEndpoint(preparedEndpoint, payload, credentials, options);

        if(!response.data) {
          response = null;
          throw new Error("No data returned from API. This could be due to a configuration error.");
        }
      } catch (error) {
        console.log(`API call failed. ${error?.message}`);
        telemetryClient?.captureException(maskCredentials(error.message, credentials), context.orgId, {
          preparedEndpoint: preparedEndpoint,
          retryCount: retryCount,
        });
        lastError = error?.message || JSON.stringify(error || {});
      }
      retryCount++;
    } while (!response && retryCount < 5);
    
    if(!response) {
      telemetryClient?.captureException(new Error(`API call failed after ${retryCount} retries. Last error: ${maskCredentials(lastError, credentials)}`), context.orgId, {
        preparedEndpoint: preparedEndpoint,
        retryCount: retryCount,
      });
      throw new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`);
    }

    // Transform response
    const responseMapping = preparedEndpoint.responseMapping || 
      (await prepareTransform(context.datastore, readCache, preparedEndpoint as TransformConfig, response.data))?.responseMapping;
    const transformedResponse = responseMapping ? 
      await applyJsonataWithValidation(response.data, responseMapping, preparedEndpoint.responseSchema) : 
      { success: true, data: response.data };

    if (!transformedResponse.success) {
      throw new Error(transformedResponse.error);
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
    telemetryClient?.captureException(maskedError, context.orgId, {
      preparedEndpoint: preparedEndpoint,
      messages: messages,
      result: result
    });
    context.datastore.createRun(result, context.orgId);
    return result;
  }
};