import { ExtractInputRequest, RequestOptions } from "@superglue/shared";
import { SupportedFileType } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { parseFile } from "../../files/index.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { maskCredentials } from "@superglue/shared";
import { GraphQLRequestContext, ServiceMetadata } from "../types.js";

export const extractResolver = async (
  _: any,
  {
    input,
    payload,
    credentials,
    options,
  }: {
    input: ExtractInputRequest;
    payload: any;
    credentials: Record<string, string>;
    options: RequestOptions;
  },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  const callId = crypto.randomUUID();
  const startedAt = new Date();
  const metadata = context.toMetadata();

  try {
    if (!input.file) {
      logMessage("error", "Extract call failed. No file provided", metadata);
      return {
        id: callId,
        success: false,
        error: "No file provided",
        startedAt,
        completedAt: new Date(),
      };
    }

    const { createReadStream, filename } = (await input.file) as any;
    const stream = createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const data = await parseFile(buffer, SupportedFileType.AUTO);

    return {
      id: callId,
      success: true,
      data,
      startedAt,
      completedAt: new Date(),
    };
  } catch (error: any) {
    const maskedError = maskCredentials(error.message, credentials);
    telemetryClient?.captureException(maskedError, context.orgId);

    return {
      id: callId,
      success: false,
      error: maskedError,
      startedAt,
      completedAt: new Date(),
    };
  }
};
