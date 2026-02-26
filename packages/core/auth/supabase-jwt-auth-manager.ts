import { mapUserRole } from "@superglue/shared";
import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose";
import { logMessage } from "../utils/logs.js";
import { AuthManager, AuthResult } from "./types.js";

export class SupabaseJWTAuthManager implements AuthManager {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  public async authenticate(token: string): Promise<AuthResult> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const jwtSecret = process.env.SUPABASE_JWT_SECRET;

      if (!supabaseUrl && !jwtSecret) {
        return {
          success: false,
          orgId: "",
        };
      }

      let payload: JWTPayload;

      // Try to decode the header to check the algorithm
      const [headerB64] = token.split(".");
      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());

      if (header.alg === "ES256" || header.alg === "RS256") {
        // Use JWKS for asymmetric algorithms
        if (!this.jwks && supabaseUrl) {
          this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
        }
        if (!this.jwks) {
          logMessage("debug", "No JWKS available for ES256/RS256 verification");
          return { success: false, orgId: "" };
        }
        const result = await jwtVerify(token, this.jwks, {
          issuer: supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined,
          algorithms: ["ES256", "RS256"],
        });
        payload = result.payload;
      } else {
        // Use symmetric secret for HS256
        if (!jwtSecret) {
          return { success: false, orgId: "" };
        }
        const secret = new TextEncoder().encode(jwtSecret);
        const result = await jwtVerify(token, secret, {
          issuer: supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined,
        });
        payload = result.payload;
      }

      const userId = payload.sub;

      const appMetadata = payload.app_metadata as any;
      const orgId = appMetadata?.active_org_id;
      const orgName = appMetadata?.active_org_name;
      const orgRole = appMetadata?.active_org_role
        ? mapUserRole(appMetadata?.active_org_role)
        : undefined;

      if (!userId) {
        return {
          success: false,
          orgId: "",
        };
      }

      if (!orgId) {
        return {
          success: false,
          orgId: "",
        };
      }

      return {
        success: true,
        userId,
        orgId,
        orgName,
        orgRole,
      };
    } catch (error: any) {
      logMessage("debug", `JWT verification failed: ${error.message}`);
      return {
        success: false,
        orgId: "",
      };
    }
  }
}
