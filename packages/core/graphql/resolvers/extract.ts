import { ExtractInputRequest } from "@superglue/shared";
import { SupportedFileType } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { parseFile } from "../../files/index.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { GraphQLRequestContext } from "../types.js";

export const extractResolver = async (
  _: any,
  {
    input,
  }: {
    input: ExtractInputRequest;
  },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  const callId = crypto.randomUUID();
  const startedAt = new Date();
  const metadata = context.toMetadata();

  try {
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
    telemetryClient?.captureException(error.message, context.orgId);

    return {
      id: callId,
      success: false,
      error: error.message,
      startedAt,
      completedAt: new Date(),
    };
  }
};
