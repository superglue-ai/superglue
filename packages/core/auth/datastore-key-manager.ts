import { logMessage } from "../utils/logs.js";
import { AuthManager, AuthResult } from "./types.js";
import type { DataStore } from "../datastore/types.js";

/**
 * API Key manager that uses our own Postgres datastore instead of Supabase.
 * Queries the database directly on each auth request for simplicity and freshness.
 */
export class DataStoreKeyManager implements AuthManager {
  private dataStore: DataStore | null = null;
  private dataStoreGetter: (() => DataStore) | null = null;

  /**
   * Create a DataStoreKeyManager.
   * @param dataStoreOrGetter - Either a DataStore instance or a function that returns one.
   *                           Using a getter allows lazy initialization to avoid circular dependencies.
   */
  constructor(dataStoreOrGetter: DataStore | (() => DataStore)) {
    if (typeof dataStoreOrGetter === "function") {
      this.dataStoreGetter = dataStoreOrGetter;
    } else {
      this.dataStore = dataStoreOrGetter;
    }
  }

  private getDataStore(): DataStore | null {
    if (this.dataStore) {
      return this.dataStore;
    }
    if (this.dataStoreGetter) {
      try {
        this.dataStore = this.dataStoreGetter();
        return this.dataStore;
      } catch {
        // DataStore not ready yet
        return null;
      }
    }
    return null;
  }

  public async authenticate(token: string): Promise<AuthResult> {
    // Early validation: reject empty or whitespace-only tokens
    if (!token || !token.trim()) {
      return { success: false, orgId: "" };
    }

    try {
      const dataStore = this.getDataStore();
      if (!dataStore) {
        logMessage("warn", "DataStoreKeyManager: DataStore not initialized");
        return { success: false, orgId: "" };
      }

      const key = await dataStore.getApiKeyByKey({ key: token });

      if (!key || !key.isActive) {
        return { success: false, orgId: "" };
      }

      return {
        success: true,
        orgId: key.orgId,
        userId: key.userId ?? undefined,
        isRestricted: key.isRestricted,
      };
    } catch (error) {
      logMessage("error", `Failed to authenticate API key: ${error}`);
      return { success: false, orgId: "" };
    }
  }
}
