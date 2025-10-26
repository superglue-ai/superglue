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
    const jwtResult = await this.jwtAuthManager.authenticate(token);
    if (jwtResult.success) {
      return jwtResult;
    }

    logMessage('debug', 'JWT authentication failed, falling back to API key lookup');
    return this.keyAuthManager.authenticate(token);
  }
}

