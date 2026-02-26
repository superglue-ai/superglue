import { decodeJWTPayload } from "./jwt-utils";
import { tokenRegistry } from "./token-registry";

export function getCacheScopeIdentifier(): string | null {
  const token = tokenRegistry.getToken();
  if (!token) {
    return null;
  }

  // Single-tenant mode - use constant scope for shared caching
  if (process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY) {
    return "";
  }

  // Multi-tenant mode - use org ID from JWT
  const payload = decodeJWTPayload(token);
  if (!payload) {
    // Token is not a valid JWT (plain API key in single-tenant mode)
    return "";
  }
  return payload.app_metadata?.active_org_id || "";
}
