import { registerApiModule } from "./registry.js";
import { addTraceHeader } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

const getTenantInfoHandler: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;

  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === "true") {
    return addTraceHeader(reply, authReq.traceId).code(200).send({
      email: null,
      emailEntrySkipped: true,
    });
  }

  try {
    const tenantInfo = await authReq.datastore.getTenantInfo();
    return addTraceHeader(reply, authReq.traceId).code(200).send(tenantInfo);
  } catch (error) {
    return addTraceHeader(reply, authReq.traceId).code(200).send({
      email: null,
      emailEntrySkipped: false,
    });
  }
};

const setTenantInfoHandler: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const { email, emailEntrySkipped } = request.body as {
    email?: string;
    emailEntrySkipped?: boolean;
  };

  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === "true") {
    return addTraceHeader(reply, authReq.traceId).code(200).send({
      email: null,
      emailEntrySkipped: true,
    });
  }

  try {
    await authReq.datastore.setTenantInfo({ email, emailEntrySkipped });
    const currentInfo = await authReq.datastore.getTenantInfo();
    return addTraceHeader(reply, authReq.traceId).code(200).send(currentInfo);
  } catch (error) {
    return addTraceHeader(reply, authReq.traceId)
      .code(500)
      .send({ error: "Failed to set tenant info" });
  }
};

registerApiModule({
  name: "tenant",
  routes: [
    {
      method: "GET",
      path: "/tenant-info",
      handler: getTenantInfoHandler,
    },
    {
      method: "PUT",
      path: "/tenant-info",
      handler: setTenantInfoHandler,
    },
  ],
});
