import { DecompressionMethod, ExtractConfig, ExtractInputRequest, FileType, RequestOptions } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { decompressData, parseFile } from "../../utils/file.js";
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
      } else {
        logMessage('error', "Extract call failed. No file provided", metadata);
        return {
          id: callId,
          success: false,
          error: "No file provided",
          config: preparedExtract,
          startedAt,
          completedAt: new Date(),
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

    const completedAt = new Date();

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
      notifyWebhook(options.webhookUrl, callId, false, undefined, maskedError);
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


export async function processFile(data: Buffer, extractConfig: ExtractConfig) {
  if (extractConfig.decompressionMethod && extractConfig.decompressionMethod != DecompressionMethod.NONE) {
    data = await decompressData(data, extractConfig.decompressionMethod);
  }

  let responseJSON = await parseFile(data, extractConfig.fileType);

  if (extractConfig.dataPath) {
    // Navigate to the specified data path
    const pathParts = extractConfig.dataPath.split('.');
    for (const part of pathParts) {
      responseJSON = responseJSON[part] || responseJSON;
    }
  }

  return responseJSON;
}