import type { Role } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";
import { isEEDataStore } from "../datastore/ee/types.js";

const ADMIN_ROLE: Role = {
  id: "admin",
  name: "Admin",
  tools: "ALL",
  systems: "ALL" as Role["systems"],
  isBaseRole: true,
};

export class BaseRoleViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseRoleViolationError";
  }
}

export async function resolveUserRoles({
  userId,
  orgId,
  datastore,
}: {
  userId?: string;
  orgId: string;
  datastore: DataStore;
}): Promise<Role[]> {
  if (!isEEDataStore(datastore)) return [ADMIN_ROLE];
  if (!userId) {
    throw new BaseRoleViolationError("User ID is required for role resolution");
  }

  const roles = await datastore.getRolesForUser({ userId, orgId });
  const baseRoles = roles.filter((r) => r.isBaseRole);

  if (baseRoles.length !== 1) {
    throw new BaseRoleViolationError(
      `User ${userId} has ${baseRoles.length} base roles ` +
        `(${baseRoles.map((r) => r.id).join(", ") || "none"}). Exactly one required.`,
    );
  }

  return roles;
}
