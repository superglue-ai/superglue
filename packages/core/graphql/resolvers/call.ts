import { ApiConfig, ApiInputRequest, CacheMode, RequestOptions, TransformConfig } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { executeStep } from "../../execute/workflow-step-runner.js";
import { maskCredentials } from "../../utils/tools.js";
import { executeTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { Context, Metadata } from '../types.js';


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

    // Get the endpoint configuration
    if (input.id) {
      endpoint = await context.datastore.getApiConfig({ id: input.id, orgId: context.orgId });
      if (!endpoint) {
        return {
          success: false,
          data: null,
          error: `API configuration with id ${input.id} not found`
        };
      }
    } else {
      endpoint = input.endpoint;
    }

    // Check if response schema is zod and throw an error if it is
    if ((endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
      throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
    }
    const callResult = await executeStep({
      endpoint,
      inputData: payload,
      credentials,
      integrationManager: null,
      options,
      metadata,
    });
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
      context.datastore.upsertApiConfig({ id: input.id || endpoint.id, config, orgId: context.orgId });
    }

    // Notify webhook if configured
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, transformResult.data);
    }

    const result = {
      id: callId,
      success: true,
      config: config,
      statusCode: callResult?.statusCode,
      headers: callResult?.request.headers,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun({ result, orgId: context.orgId });
    return { ...result, data: transformResult.data };
  } catch (error) {
    const maskedError = maskCredentials(error.message, credentials);

    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, false, undefined, error.message);
    }
    const result = {
      id: callId,
      success: false,
      error: maskedError,
      config: endpoint,
      statusCode: error?.statusCode,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun({ result, orgId: context.orgId });
    return result;
  }
};