import { CacheMode, FileType, RequestOptions, TransformConfig, TransformInputRequest } from "@superglue/client";
import { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { parseFile } from "../../utils/file.js";
import { executeTransform } from "../../utils/transform.js";
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

  const metadata: Metadata = {
    runId: callId,
    orgId: context.orgId
  };

  const readCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : false;
  let transformResult: { data?: any; config?: TransformConfig } | null = null;

  if ((input.endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
    throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
  }

  try {

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (error) {
        data = await parseFile(Buffer.from(data), FileType.AUTO);
      }
    }

    transformResult = await executeTransform({
      datastore: context.datastore,
      fromCache: readCache,
      input: input,
      data: data,
      metadata: metadata
    });
    // Save configuration if requested
    if (writeCache) {
      context.datastore.upsertTransformConfig(input.id || input.endpoint.id, transformResult.config, context.orgId);
    }
    const completedAt = new Date();

    // Notify webhook if configured
    // call async
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, transformResult.data);
    }

    return {
      id: callId,
      success: true,
      data: transformResult.data,
      config: transformResult.config,
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
      config: transformResult?.config || { id: callId, instruction: "", ...input },
      data: transformResult?.data,
      startedAt,
      completedAt,
    };
  }
};

