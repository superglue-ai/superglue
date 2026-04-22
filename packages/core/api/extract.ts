import { ExecutionFileEnvelope, SupportedFileType } from "@superglue/shared";
import { server_defaults } from "../default.js";
import { detectAndParseFile } from "../files/index.js";
import { telemetryClient } from "../utils/telemetry.js";
import { registerApiModule } from "./registry.js";
import { sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

function buildExecutionFileEnvelope(params: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  fileType: SupportedFileType;
  extracted?: unknown;
  parseError?: string;
}): ExecutionFileEnvelope {
  const { buffer, filename, contentType, fileType, extracted, parseError } = params;
  return {
    kind: "execution_file",
    filename,
    contentType,
    size: buffer.length,
    rawBase64: buffer.toString("base64"),
    fileType,
    ...(extracted !== undefined ? { extracted } : {}),
    ...(parseError ? { parseError } : {}),
  };
}

const extractHandler: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as { envelope?: string } | undefined;
  const callId = crypto.randomUUID();
  const startedAt = new Date();

  try {
    const data = await (request as any).file();
    if (!data) {
      return sendError(reply, 400, "No file provided");
    }

    const buffer = await data.toBuffer();
    if (buffer.length > server_defaults.FILE_PROCESSING.MAX_FILE_SIZE_BYTES) {
      return sendError(
        reply,
        413,
        `File size ${buffer.length} exceeds maximum allowed size of ${server_defaults.FILE_PROCESSING.MAX_FILE_SIZE_BYTES} bytes`,
      );
    }
    const includeEnvelope = query?.envelope === "true";
    const parsedFile = await detectAndParseFile(buffer);

    if (!includeEnvelope) {
      if (parsedFile.fileType === SupportedFileType.BINARY) {
        return sendError(
          reply,
          400,
          "Binary files require envelope=true. Call /extract?envelope=true to receive the full file envelope.",
        );
      }

      if (parsedFile.parseError) {
        return sendError(reply, 400, parsedFile.parseError);
      }

      return reply.code(200).send({
        id: callId,
        success: true,
        data: parsedFile.extracted,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    const envelope = buildExecutionFileEnvelope({
      buffer,
      filename: data.filename || "upload",
      contentType: data.mimetype || "application/octet-stream",
      fileType: parsedFile.fileType,
      extracted: parsedFile.extracted,
      parseError: parsedFile.parseError,
    });

    return reply.code(200).send({
      id: callId,
      success: true,
      data: parsedFile.extracted,
      file: envelope,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    telemetryClient?.captureException(error.message, authReq.authInfo.orgId);

    return reply.code(500).send({
      id: callId,
      success: false,
      error: error.message,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    });
  }
};

registerApiModule({
  name: "extract",
  routes: [
    {
      method: "POST",
      path: "/extract",
      handler: extractHandler,
      permissions: {
        type: "execute",
        resource: "extract",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
  ],
});
