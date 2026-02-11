import { logMessage } from "../utils/logs.js";
import { AuthManager, AuthResult } from "./types.js";
import { SupabaseKeyManager } from "./supabase-key-manager.js";
import { SupabaseJWTAuthManager } from "./supabase-jwt-auth-manager.js";

// This manager is used to authenticate a token using both the JWT and API key managers.
// It will first try to authenticate with the JWT manager, and if that fails, it will fall back to the API key manager (static keys).
export class SupabaseAuthManager implements AuthManager {
  private jwtAuthManager: SupabaseJWTAuthManager;
  private keyAuthManager: SupabaseKeyManager;

  constructor() {
    this.jwtAuthManager = new SupabaseJWTAuthManager();
    this.keyAuthManager = new SupabaseKeyManager();
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

  public async createApiKey(
    orgId: string,
    userId?: string,
    mode: "frontend" | "backend" = "backend",
  ): Promise<string | null> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.PRIV_SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      logMessage("error", "Missing Supabase configuration for API key creation", { orgId });
      return null;
    }

    const newKey = crypto.randomUUID().replace(/-/g, "");
    const url = `${SUPABASE_URL}/rest/v1/sg_superglue_api_keys`;

    try {
      const payload: Record<string, any> = {
        key: newKey,
        is_active: true,
        mode,
        org_id: orgId,
        is_restricted: false,
        allowed_tools: ["*"],
      };
      // user_id is required (NOT NULL), created_by_user_id is optional metadata
      if (userId) {
        payload.user_id = userId;
        payload.created_by_user_id = userId;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to create API key: ${response.statusText} - ${errorBody}`);
      }
      return newKey;
    } catch (error) {
      logMessage("error", `Failed to create API key: ${error}`, { orgId });
      return null;
    }
  }

  private isJWT(token: string): boolean {
    const parts = token.split(".");
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }
}
