import { jwtVerify } from "jose";
import { logMessage } from "../utils/logs.js";
import { AuthManager, AuthResult } from "./types.js";

export class SupabaseJWTAuthManager implements AuthManager {
  public async authenticate(token: string): Promise<AuthResult> {
    try {
      const jwtSecret = process.env.SUPABASE_JWT_SECRET;
      
      if (!jwtSecret) {
        return {
          success: false
        };
      }

      const secret = new TextEncoder().encode(jwtSecret);
      
      const { payload } = await jwtVerify(token, secret, {
        issuer: process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1` : undefined,
      });

      const userId = payload.sub;
      
      const appMetadata = payload.app_metadata as any;
      const orgId = appMetadata?.active_org_id;
      const orgName = appMetadata?.active_org_name;
      const orgRole = appMetadata?.active_org_role;

      if (!userId) {
        return {
          success: false
        };
      }

      if (!orgId) {
        return {
          success: false
        };
      }

      logMessage('debug', `JWT authentication successful for user ${userId}`);
      return {
        success: true,
        userId,
        orgId,
        orgName,
        orgRole
      };

    } catch (error: any) {
      logMessage('debug', `JWT verification failed: ${error.message}`);
      return {
        success: false
      };
    }
  }
}

