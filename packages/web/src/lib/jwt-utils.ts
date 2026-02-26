import { decodeJwt } from "jose";

export function decodeJWTPayload(token: string): any {
  try {
    return decodeJwt(token);
  } catch (error) {
    // In single-tenant mode, token is a plain API key, not a JWT
    console.warn("Failed to decode token as JWT (expected in single-tenant mode):", error.message);
    return null;
  }
}

export function getOrgIdFromJWT(token: string): string | null {
  const payload = decodeJWTPayload(token);
  return payload?.app_metadata?.active_org_id || null;
}
