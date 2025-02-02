import { GraphQLResolveInfo } from "graphql";
import { CacheMode, Context, ExtractConfig, ExtractInput, RequestOptions } from "@superglue/shared";
import { v4 as uuidv4 } from 'uuid';
import { notifyWebhook } from "../../utils/webhook.js";
import { callExtract, prepareExtract } from "../../utils/extract.js";

export const extractResolver = async (
  _: any,
  { endpoint, payload, credentials, options }: { 
    endpoint: ExtractInput; 
    payload: any; 
    credentials: Record<string, string>;
    options: RequestOptions; 
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const callId = uuidv4();
  const startedAt = new Date();
  let preparedExtract: ExtractConfig;
  const readCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;
  try {
    // Resolve endpoint configuration from cache or prepare new one
    let response: any;
    let retryCount = 0;
    let lastError: string | null = null;
    do {
      preparedExtract = readCache ? 
        await context.datastore.getExtractConfigFromRequest(endpoint, payload) : null;
      preparedExtract = preparedExtract || 
        await prepareExtract(endpoint, payload, credentials, lastError);
      try {
        response = await callExtract(preparedExtract, payload, credentials, options);
        } catch (error) {
        console.log(`Extract call failed with status ${error.status}. Retrying...`);
        lastError = error?.message || JSON.stringify(error || {});
      }
      retryCount++;
    } while (!response && retryCount < 5);
    
    if(!response) {
      throw new Error(`API call failed after ${retryCount} retries. Last error: ${lastError}`);
    }

    
    // Save configuration if requested
    if(writeCache) {
      context.datastore.saveExtractConfig(endpoint, payload, { ...preparedExtract});
    }
    const completedAt = new Date();

    // Notify webhook if configured
    // call async
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, response); 
    }

    return {
      id: callId,
      success: true,
      data: response,
      configuration: preparedExtract,
      startedAt,
      completedAt,
    };

  } catch (error) {
    const completedAt = new Date();
    
    if (options?.webhookUrl) {
      await notifyWebhook(options.webhookUrl, callId, false, undefined, error.message);
    }

    return {
      id: callId,
      success: false,
      error: error.message,
      configuration: preparedExtract || endpoint,
      startedAt,
      completedAt,
    };
  }
};

