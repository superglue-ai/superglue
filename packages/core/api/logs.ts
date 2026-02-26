import { Log } from "@superglue/shared";
import { PassThrough } from "stream";
import { logEmitter } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import type { AuthenticatedFastifyRequest } from "./types.js";
import type { FastifyRequest, FastifyReply } from "fastify";

async function logsStreamHandler(request: FastifyRequest, reply: FastifyReply) {
  const authReq = request as AuthenticatedFastifyRequest;
  const { traceId } = request.query as { traceId?: string };
  const orgId = authReq.authInfo.orgId;

  const stream = new PassThrough();

  const origin = request.headers.origin;

  reply
    .header("Content-Type", "text/event-stream")
    .header("Cache-Control", "no-cache")
    .header("Connection", "keep-alive")
    .header("X-Accel-Buffering", "no");

  if (origin) {
    reply
      .header("Access-Control-Allow-Origin", origin)
      .header("Access-Control-Allow-Credentials", "true");
  }

  reply.send(stream);

  stream.write(":ok\n\n");

  const onLog = (log: Log) => {
    if (log.orgId !== orgId) return;
    if (traceId && log.traceId !== traceId) return;
    if (!stream.destroyed) {
      stream.write(`data: ${JSON.stringify(log)}\n\n`);
    }
  };

  logEmitter.on("log", onLog);

  const cleanup = () => {
    logEmitter.removeListener("log", onLog);
    if (!stream.destroyed) stream.end();
  };

  request.raw.on("close", cleanup);
  request.raw.on("error", cleanup);
}

registerApiModule({
  name: "logs",
  routes: [
    {
      method: "GET",
      path: "/logs/stream",
      handler: logsStreamHandler,
    },
  ],
});
