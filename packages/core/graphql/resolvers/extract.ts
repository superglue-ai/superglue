import { CacheMode, Context, DecompressionMethod, ExtractConfig, ExtractInputRequest, FileType, RequestOptions } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { callExtract, prepareExtract, processFile } from "../../utils/extract.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { maskCredentials } from "../../utils/tools.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { logMessage } from "../../utils/logs.js";
import { Metadata } from "openai/resources/index.mjs";

export const extractResolver = async (
  _: any,
  { input, payload, credentials, options }: { 
    input: ExtractInputRequest; 
    payload: any; 
    credentials: Record<string, string>;
    options: RequestOptions; 
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const callId = crypto.randomUUID();
  const startedAt = new Date();
  let preparedExtract: ExtractConfig;
  const readCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : true;
  try {
    // Resolve endpoint configuration from cache or prepare new one
    let response: any;
    let retryCount = 0;
    let lastError: string | null = null;
    const metadata: Metadata = {
      runId: input.id || callId,
      orgId: context.orgId
    };
    do {
      if(input.file) {
        const { createReadStream, filename } = await input.file;
        const stream = createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        preparedExtract = {
          id: input.id || callId,
          urlHost: filename,
          instruction: "extract from file",
          decompressionMethod: DecompressionMethod.AUTO,
          fileType: FileType.AUTO
        };
        response = await processFile(buffer, preparedExtract);
      }
      else {
        preparedExtract = readCache ? 
          await context.datastore.getExtractConfig(input.id, context.orgId) || 
          await context.datastore.getExtractConfigFromRequest(input.endpoint, payload, context.orgId) 
          : null;
        if(!preparedExtract) {
          preparedExtract = await prepareExtract(input.endpoint, payload, credentials, lastError);
        }
        try {
          const buffer = await callExtract(preparedExtract, payload, credentials, options);
          response = await processFile(buffer, preparedExtract);
        } catch (error) {
          logMessage('warn', "Extraction failed. Retrying...", metadata);
          lastError = error?.message || JSON.stringify(error || {});
        }
      }
      retryCount++;
    } while (!response && retryCount < 5);
    
    if(!response) {
      logMessage('error', `Extract call failed after ${retryCount} retries. Last error: ${lastError}`, metadata);
      telemetryClient?.captureException(new Error(`Extract call failed after ${retryCount} retries. Last error: ${maskCredentials(lastError, credentials)}`), context.orgId, {
        preparedEndpoint: preparedExtract || input.endpoint,
        retryCount: retryCount,
      });
      throw new Error(`Extract call failed after ${retryCount} retries. Last error: ${lastError}`);
    }

    // Save configuration if requested
    if(writeCache) {
      if(input.id || preparedExtract.id) {
        context.datastore.upsertExtractConfig(input.id || preparedExtract.id, preparedExtract, context.orgId);
      } else {
        context.datastore.saveExtractConfig(input.endpoint, payload, preparedExtract, context.orgId);
      }
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
      config: preparedExtract,
      startedAt,
      completedAt,
    };

  } catch (error) {
    const maskedError = maskCredentials(error.message, credentials);
    telemetryClient?.captureException(maskedError, context.orgId, {
      preparedEndpoint: preparedExtract || input.endpoint,
    });

    const completedAt = new Date();
    
    if (options?.webhookUrl) {
      await notifyWebhook(options.webhookUrl, callId, false, undefined, maskedError);
    }

    return {
      id: callId,
      success: false,
      error: maskedError,
      config: preparedExtract || input.endpoint,
      startedAt,
      completedAt,
    };
  }
};

