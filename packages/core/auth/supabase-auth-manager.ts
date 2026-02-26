import { logMessage } from "../utils/logs.js";
import { AuthManager, AuthResult, CreateApiKeyParams } from "./types.js";
import { DataStoreKeyManager } from "./datastore-key-manager.js";
import { SupabaseJWTAuthManager } from "./supabase-jwt-auth-manager.js";
import { getDataStore } from "../datastore/datastore.js";

// This manager is used to authenticate a token using both the JWT and API key managers.
// It will first try to authenticate with the JWT manager, and if that fails, it will fall back to the API key manager (static keys).
export class SupabaseAuthManager implements AuthManager {
  private jwtAuthManager: SupabaseJWTAuthManager;
  private keyAuthManager: DataStoreKeyManager;

  constructor() {
    this.jwtAuthManager = new SupabaseJWTAuthManager();
    // Use a getter to avoid circular dependency issues during initialization
    this.keyAuthManager = new DataStoreKeyManager(() => getDataStore());
  }

  public async authenticate(token: string): Promise<AuthResult> {
    if (this.isJWT(token)) {
      const jwtResult = await this.jwtAuthManager.authenticate(token);
      if (jwtResult.success) {
        return jwtResult;
      }

      logMessage("debug", "JWT authentication failed, falling back to API key lookup");
    }

    return this.keyAuthManager.authenticate(token);
  }

  public async createApiKey({
    orgId,
    createdByUserId,
    isRestricted,
    userId,
    mode = "backend",
  }: CreateApiKeyParams): Promise<string | null> {
    try {
      const dataStore = getDataStore();
      const newKey = crypto.randomUUID().replace(/-/g, "");

      // Set user fields - use createdByUserId as fallback for userId
      const effectiveUserId = userId || createdByUserId;

      await dataStore.createApiKey({
        orgId,
        createdByUserId,
        isRestricted,
        key: newKey,
        userId: effectiveUserId,
        mode,
      });

      return newKey;
    } catch (error) {
      logMessage("error", `Failed to create API key: ${error}`, { orgId });
      return null;
    }
  }

  /**
   * Delete all API keys for a user within an organization.
   * Works for both end users (restricted keys) and regular users.
   */
  public async deleteApiKeysByUserId(userId: string, orgId: string): Promise<void> {
    try {
      const dataStore = getDataStore();
      await dataStore.deleteApiKeysByUserId({ userId, orgId });
      logMessage("debug", `Deleted API keys for user ${userId}`, { orgId });
    } catch (error) {
      logMessage("error", `Failed to delete API keys for user ${userId}: ${error}`, { orgId });
      // Don't throw - caller may want to continue with other cleanup
    }
  }

  private isJWT(token: string): boolean {
    const parts = token.split(".");
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }
}
