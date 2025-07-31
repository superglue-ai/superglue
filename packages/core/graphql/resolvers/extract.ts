import { CacheMode, DecompressionMethod, ExtractConfig, ExtractInputRequest, FileType, RequestOptions } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { Documentation } from "../../utils/documentation.js";
import { callExtract, generateExtractConfig, processFile } from "../../utils/extract.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { maskCredentials } from "../../utils/tools.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { Context, Metadata } from '../types.js';

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
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : false;
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
      if (input.file) {
        const { createReadStream, filename } = await input.file as any;
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
          await context.datastore.getExtractConfig(input.id, context.orgId)
          : null;
        if (!preparedExtract) {
          if (!input.endpoint.instruction) {
            throw new Error("Id could not be found and no endpoint provided.");
          }
          const documentation = new Documentation(input.endpoint, credentials, metadata);
          const rawDoc = await documentation.fetchAndProcess();
          const documentationString = Documentation.extractRelevantSections(rawDoc, input.endpoint.instruction || "");
          preparedExtract = await generateExtractConfig(input.endpoint, documentationString, payload, credentials, lastError);
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

    if (!response) {
      logMessage('error', `Extract call failed after ${retryCount} retries. Last error: ${lastError}`, metadata);
      telemetryClient?.captureException(new Error(`Extract call failed after ${retryCount} retries. Last error: ${maskCredentials(lastError, credentials)}`), context.orgId, {
        preparedEndpoint: preparedExtract || input.endpoint,
        retryCount: retryCount,
      });
      throw new Error(`Extract call failed after ${retryCount} retries. Last error: ${lastError}`);
    }

    // Save configuration if requested
    if (writeCache) {
      context.datastore.upsertExtractConfig(input.id || preparedExtract.id, preparedExtract, context.orgId);
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

