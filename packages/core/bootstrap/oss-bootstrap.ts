import type { RoleInput } from "@superglue/shared";
import type { EEDataStore } from "../datastore/ee/types.js";
import { logMessage } from "../utils/logs.js";

const OSS_ORG_ID = "";
const OSS_USER_ID = "oss-admin";

const BASE_ROLES: Array<{
  id: "admin" | "member" | "enduser";
  role: RoleInput;
}> = [
  {
    id: "admin",
    role: {
      name: "Admin",
      description: "Full access to all tools and systems in OSS.",
      tools: "ALL",
      systems: "ALL",
    },
  },
  {
    id: "member",
    role: {
      name: "Member",
      description: "Standard role placeholder kept for RBAC compatibility in OSS.",
      tools: [],
      systems: {},
    },
  },
  {
    id: "enduser",
    role: {
      name: "End User",
      description: "End-user role placeholder kept for RBAC compatibility in OSS.",
      tools: [],
      systems: {},
    },
  },
];

export async function bootstrapOss(datastore: EEDataStore): Promise<void> {
  const authToken = process.env.AUTH_TOKEN || process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY;
  if (!authToken) {
    throw new Error("AUTH_TOKEN or NEXT_PUBLIC_SUPERGLUE_API_KEY is required for OSS bootstrap.");
  }

  for (const { id, role } of BASE_ROLES) {
    const existing = await datastore.getRole({ id, orgId: OSS_ORG_ID });
    if (!existing) {
      await datastore.createRole({
        id,
        role,
        orgId: OSS_ORG_ID,
        isBaseRole: true,
      });
    }
  }

  await datastore.deleteAllUserRoles({ userId: OSS_USER_ID, orgId: OSS_ORG_ID });
  await datastore.addUserRoles({ userId: OSS_USER_ID, roleIds: ["admin"], orgId: OSS_ORG_ID });

  let existingKey = await datastore.getApiKeyByKey({ key: authToken });
  const needsRecreate =
    existingKey &&
    (existingKey.orgId !== OSS_ORG_ID ||
      existingKey.userId !== OSS_USER_ID ||
      existingKey.createdByUserId !== OSS_USER_ID);

  if (needsRecreate) {
    await datastore.deleteApiKey({ id: existingKey!.id, orgId: existingKey!.orgId });
    existingKey = null;
  }

  if (!existingKey) {
    await datastore.createApiKey({
      orgId: OSS_ORG_ID,
      createdByUserId: OSS_USER_ID,
      userId: OSS_USER_ID,
      key: authToken,
    });
  } else if (!existingKey.isActive) {
    await datastore.updateApiKey({
      id: existingKey.id,
      orgId: existingKey.orgId,
      isActive: true,
    });
  }

  logMessage("info", "OSS bootstrap complete", { orgId: OSS_ORG_ID, userId: OSS_USER_ID });
}
