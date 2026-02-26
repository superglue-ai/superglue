import { SupportedFileType } from "@superglue/shared";
import { parseFile } from "../files/index.js";
import { telemetryClient } from "../utils/telemetry.js";
import { registerApiModule } from "./registry.js";
import { sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

const extractHandler: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const callId = crypto.randomUUID();
  const startedAt = new Date();

  try {
    const data = await (request as any).file();
    if (!data) {
      return sendError(reply, 400, "No file provided");
    }

    const buffer = await data.toBuffer();
    const parsed = await parseFile(buffer, SupportedFileType.AUTO);

    return reply.code(200).send({
      id: callId,
      success: true,
      data: parsed,
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
    },
  ],
});
