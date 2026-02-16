import type { DataStore } from "../types.js";
import type {
  EndUser,
  EndUserInput,
  EndUserCredentialStatus,
  PortalToken,
} from "@superglue/shared";

/**
 * Extended DataStore interface with EE multi-tenancy methods.
 * EEPostgresService implements this interface.
 */
export interface EEDataStore extends DataStore {
  // End User Methods
  getEndUser(params: { id: string; orgId: string }): Promise<EndUser | null>;
  getEndUserByExternalId(params: { externalId: string; orgId: string }): Promise<EndUser | null>;
  upsertEndUser(params: { endUser: EndUserInput; orgId: string }): Promise<EndUser>;
  listEndUsers(params: {
    orgId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: EndUser[]; total: number }>;
  deleteEndUser(params: { id: string; orgId: string }): Promise<boolean>;
  getEndUserAllowedSystems(params: { endUserId: string; orgId: string }): Promise<string[] | null>;

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
  listEndUserCredentials(params: {
    endUserId: string;
    orgId: string;
  }): Promise<EndUserCredentialStatus[]>;

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
