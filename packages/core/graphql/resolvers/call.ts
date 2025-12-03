import { ApiConfig, ApiInputRequest, CacheMode, RequestOptions } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { ToolExecutor } from "../../tools/tool-executor.js";
import { maskCredentials } from '@superglue/shared';
import { TransformConfig } from "../../utils/helpers.legacy.js";
import { executeTransformLegacy } from "../../utils/helpers.legacy.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { GraphQLRequestContext, ServiceMetadata } from '../types.js';


export const callResolver = async (
  _: any,
  { input, payload, credentials, options }: {
    input: ApiInputRequest;
    payload: any;
    credentials?: Record<string, string>;
    options: RequestOptions;
  },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo
) => {
  const startedAt = new Date();
  const metadata = context.toMetadata();
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
    const workflowExecutor = new ToolExecutor({
      tool: {
        id: context.traceId,
        steps: [
          {
            id: context.traceId,
            apiConfig: endpoint
          }
        ]
      },
      metadata,
      integrations: []
    });
    const callResult = await workflowExecutor.execute({
      payload,
      credentials,
      options
    });
    const data = callResult.data;

    // Transform response with built-in retry logic
    const transformResult = await executeTransformLegacy(
      {
        datastore: context.datastore,
        fromCache: readCache,
        input: { endpoint: endpoint as TransformConfig },
        data: data,
        metadata,
        options: options
      }
    );

    // Save configuration if requested
    const config = { ...endpoint, ...transformResult?.config };

    if (writeCache) {
      context.datastore.upsertApiConfig({ id: input.id || endpoint.id, config, orgId: context.orgId });
    }

    const runId = crypto.randomUUID();

    // Notify webhook if configured
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, runId, true, transformResult.data, undefined, metadata);
    }

    const result = {
      id: runId,
      success: true,
      config: config,
      statusCode: callResult?.statusCode,
      headers: callResult?.headers,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun({ result, orgId: context.orgId });
    return { ...result, data: transformResult.data };
  } catch (error) {
    const maskedError = maskCredentials(error.message, credentials);
    const runId = crypto.randomUUID();

    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, runId, false, undefined, error.message, metadata);
    }
    const result = {
      id: runId,
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