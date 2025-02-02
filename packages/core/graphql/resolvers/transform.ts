import { GraphQLResolveInfo } from "graphql";
import { CacheMode, Context, TransformConfig, TransformInput, RequestOptions } from "@superglue/shared";
import { v4 as uuidv4 } from 'uuid';
import { prepareTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { applyJsonataWithValidation } from "../../utils/tools.js";

export const transformResolver = async (
  _: any,
  { input, data, options }: { 
    input: TransformInput; 
    data: any; 
    options: RequestOptions; 
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const callId = uuidv4();
  const startedAt = new Date();
  const readCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;
  let preparedTransform: TransformConfig | null = null;
  try {
    // Transform response
    preparedTransform = await prepareTransform(context.datastore, readCache, input, data);
    if(!preparedTransform || !preparedTransform.responseMapping) {
      throw new Error("Mapping could not be resolved");
    }
    const transformation = await applyJsonataWithValidation(data, preparedTransform.responseMapping, preparedTransform.responseSchema);

    if (!transformation.success) {
      throw new Error(transformation.error);
    }

    // Save configuration if requested
    if(writeCache) {
      context.datastore.saveTransformConfig(input, data, preparedTransform);
    }
    const completedAt = new Date();

    // Notify webhook if configured
    // call async
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, transformation.data); 
    }

    return {
      id: callId,
      success: true,
      data: transformation.data,
      configuration: preparedTransform,
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
      configuration: preparedTransform || input,
      startedAt,
      completedAt,
    };
  }
};

