import type { DataStore, ApiKeyRecord } from "../types.js";
import type {
  EndUser,
  EndUserInput,
  EndUserCredentialStatus,
  OrgInvitation,
  PortalToken,
  Role,
  RoleInput,
} from "@superglue/shared";

/**
 * Extended DataStore interface with EE multi-tenancy methods.
 * EEPostgresService implements this interface.
 */
export interface EEDataStore extends DataStore {
  // End User Methods
  getEndUser(params: { id: string; orgId: string }): Promise<EndUser | null>;
  getEndUserByExternalId(params: { externalId: string; orgId: string }): Promise<EndUser | null>;
  createEndUser(params: { endUser: EndUserInput; orgId: string }): Promise<EndUser>;
  updateEndUser(params: {
    id: string;
    endUser: Partial<EndUserInput>;
    orgId: string;
  }): Promise<EndUser | null>;
  listEndUsers(params: {
    orgId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: EndUser[]; total: number }>;
  deleteEndUser(params: { id: string; orgId: string }): Promise<boolean>;

  // End User Credential Methods
  getEndUserCredentials(params: {
    endUserId: string;
    systemId: string;
    orgId: string;
  }): Promise<Record<string, any> | null>;
  upsertEndUserCredentials(params: {
    endUserId: string;
    systemId: string;
    orgId: string;
    credentials: Record<string, any>;
  }): Promise<void>;
  deleteEndUserCredentials(params: {
    endUserId: string;
    systemId: string;
    orgId: string;
  }): Promise<boolean>;

  // Role Methods
  getRole(params: { id: string; orgId: string }): Promise<Role | null>;
  listRoles(params: {
    orgId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Role[]; total: number }>;
  createRole(params: {
    role: RoleInput;
    orgId: string;
    id?: string;
    isBaseRole?: boolean;
  }): Promise<Role>;
  updateRole(params: { id: string; role: Partial<RoleInput>; orgId: string }): Promise<Role | null>;
  deleteRole(params: { id: string; orgId: string }): Promise<boolean>;
  getRolesForUser(params: { userId: string; orgId: string }): Promise<Role[]>;
  addUserRoles(params: { userId: string; roleIds: string[]; orgId: string }): Promise<void>;
  removeUserRole(params: { userId: string; roleId: string; orgId: string }): Promise<void>;
  deleteAllUserRoles(params: { userId: string; orgId: string }): Promise<void>;
  listRoleAssignments(params: { orgId: string }): Promise<Record<string, string[]>>;

  listApiKeysByUserId(params: { orgId: string; userId: string }): Promise<ApiKeyRecord[]>;

  appendToolToRole(params: { roleId: string; toolId: string; orgId: string }): Promise<void>;
  removeToolFromRoles(params: { toolId: string; orgId: string }): Promise<void>;
  renameToolInRoles(params: { oldToolId: string; newToolId: string; orgId: string }): Promise<void>;
  appendSystemToRole(params: {
    roleId: string;
    systemId: string;
    accessLevel: string;
    orgId: string;
  }): Promise<void>;
  removeSystemFromRoles(params: { systemId: string; orgId: string }): Promise<void>;

  // Auth User Methods
  getAuthUser(params: {
    userId: string;
  }): Promise<{ id: string; email: string | null; name: string | null } | null>;
  getAuthUsersByIds(params: {
    userIds: string[];
  }): Promise<{ id: string; email: string | null; name: string | null }[]>;
  getOrgMembership(params: { userId: string; orgId: string }): Promise<{ role: string } | null>;

  // Org Membership Methods (better-auth member table)
  listOrgMembers(params: { orgId: string }): Promise<{ userId: string; role: string }[]>;

  // Invitation Methods
  listPendingInvitations(params: { orgId: string }): Promise<OrgInvitation[]>;

  // Portal Token Methods
  createPortalToken(params: {
    endUserId: string;
    orgId: string;
    ttlSeconds?: number;
  }): Promise<PortalToken>;
  validatePortalToken(params: {
    token: string;
  }): Promise<{ endUserId: string; orgId: string } | null>;
  cleanupExpiredTokens(): Promise<number>;
}

/**
 * Type guard to check if a DataStore is an EEDataStore
 */
export function isEEDataStore(dataStore: DataStore): dataStore is EEDataStore {
  return "getEndUser" in dataStore && "getEndUserCredentials" in dataStore;
}
