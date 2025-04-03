import { CacheMode, Context, RequestOptions, TransformConfig, TransformInputRequest } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { telemetryClient } from "../../utils/telemetry.js";
import { applyJsonataWithValidation } from "../../utils/tools.js";
import { prepareTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";

export const transformResolver = async (
  _: any,
  { input, data, options }: { 
    input: TransformInputRequest; 
    data: any; 
    options: RequestOptions; 
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const callId = crypto.randomUUID();
  const startedAt = new Date();
  const readCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;
  let preparedTransform: TransformConfig | null = null;

  if((input.endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
    throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
  }

  try {
    // Transform response
    preparedTransform = readCache ? 
      await context.datastore.getTransformConfig(input.id, context.orgId) || 
      await context.datastore.getTransformConfigFromRequest(input.endpoint, data, context.orgId) 
    : null;
    preparedTransform = preparedTransform?.responseMapping ? preparedTransform : 
      await prepareTransform(context.datastore, readCache, preparedTransform || input.endpoint, data, { runId: callId, orgId: context.orgId });
    if(!preparedTransform || !preparedTransform.responseMapping) {
      telemetryClient?.captureException(new Error("Didn't find a valid transformation configuration."), context.orgId, {
        input: input,
        data: data,
      });
      throw new Error("Did not find a valid transformation configuration. Usually this is due to missing information in the request. If you are sending an ID, you need to enable cache read access.");
    }
    const transformation = await applyJsonataWithValidation(data, preparedTransform.responseMapping, preparedTransform.responseSchema);

    if (!transformation.success) {
      telemetryClient?.captureException(new Error(transformation.error), context.orgId, {
        input: input,
        data: data,
        preparedTransform: preparedTransform,
      });
      throw new Error(transformation.error);
    }

    // Save configuration if requested
    if(writeCache) {
      if(input.id || preparedTransform.id) {
        context.datastore.upsertTransformConfig(input.id || preparedTransform.id, preparedTransform, context.orgId);
      } else {
        context.datastore.saveTransformConfig(input.endpoint, data, preparedTransform, context.orgId);
      }
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
      config: preparedTransform,
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
      config: preparedTransform || input,
      startedAt,
      completedAt,
    };
  }
};

