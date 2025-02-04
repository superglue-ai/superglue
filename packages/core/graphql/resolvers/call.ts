import { GraphQLResolveInfo } from "graphql";
import { ApiConfig, ApiInput, ApiInputRequest, CacheMode, RequestOptions, Context } from "@superglue/shared";
import { v4 as uuidv4 } from 'uuid';
import { prepareTransform } from "../../utils/transform.js";
import { callEndpoint, prepareEndpoint } from "../../utils/api.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { applyJsonataWithValidation, maskCredentials } from "../../utils/tools.js";

export const callResolver = async (
  _: any,
  { input, payload, credentials, options }: { 
    input: ApiInputRequest; 
    payload: any; 
    credentials: Record<string, string>;
    options: RequestOptions; 
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const startedAt = new Date();
  const callId = uuidv4() as string;

  let endpoint: ApiInput;
  let preparedEndpoint: ApiConfig;

  const readCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;

  try {
    if(input.id) {
      // For direct ID lookups, require cache to be enabled
      if (!readCache) {
        throw new Error("Cannot lookup by ID when cache is disabled");
      }
      const cachedEndpoint = await context.datastore.getApiConfig(input.id);
      if (!cachedEndpoint) {
        throw new Error(`No configuration found for ID: ${input.id}`);
      }
      endpoint = cachedEndpoint;
      preparedEndpoint = cachedEndpoint;
    } else if(input.endpoint) {
      endpoint = input.endpoint;
    } else {
      throw new Error("No endpoint or id provided");
    }
  
    // Resolve endpoint configuration from cache or prepare new one
    let response: any;
    let retryCount = 0;
    let lastError: string | null = null;
    do {
      try {
        // If we don't have a prepared endpoint yet and caching is enabled, try to get from cache
        if (!preparedEndpoint && readCache && !lastError) {
          preparedEndpoint = await context.datastore.getApiConfigFromRequest(endpoint, payload);
        }
        
        // If still no prepared endpoint, generate one
        if (!preparedEndpoint || lastError) {
          preparedEndpoint = await prepareEndpoint(endpoint, payload, credentials, lastError);
        }
        response = await callEndpoint(preparedEndpoint, payload, credentials, options);
        if(!response.data || (Array.isArray(response.data) && response.data.length === 0) || (typeof response.data === 'object' && Object.keys(response.data).length === 0)) {
          response = null;
          throw new Error("No data returned from API. This could be due to a configuration error.");
        }
      } catch (error) {
        console.log(`API call failed.`, error);
        lastError = error?.message || JSON.stringify(error || {});
      }
      retryCount++;
    } while (!response && retryCount < 8);
    
    if(!response) {
      throw new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`);
    }

    // Transform response
    const responseMapping = preparedEndpoint.responseMapping || 
      (await prepareTransform(context.datastore, readCache, preparedEndpoint, response.data))?.responseMapping;
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
        context.datastore.upsertApiConfig(input.id, config);
      } else {
        context.datastore.saveApiConfig(endpoint, payload, config);
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
    context.datastore.createRun(result);
  
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
    context.datastore.createRun(result);
    return result;
  }
};