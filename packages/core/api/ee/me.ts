import { getRoleIds } from "@superglue/shared";
import { registerApiModule } from "../registry.js";
import { addTraceHeader } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

const getMe: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;

  return addTraceHeader(reply, authReq.traceId)
    .code(200)
    .send({
      userId: authReq.authInfo.userId,
      orgId: authReq.authInfo.orgId,
      orgName: authReq.authInfo.orgName,
      roleIds: getRoleIds(authReq.authInfo.roles),
      roles: authReq.authInfo.roles,
    });
};

registerApiModule({
  name: "me",
  routes: [
    {
      method: "GET",
      path: "/me",
      handler: getMe,
      permissions: {
        type: "read",
        resource: "user",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
  ],
});
