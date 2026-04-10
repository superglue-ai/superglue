import { decodeJWTPayload } from "./jwt-utils";
import { tokenRegistry } from "./token-registry";

export function getCacheScopeIdentifier(): string | null {
  const token = tokenRegistry.getToken();
  if (!token) {
    return null;
  }

  // Use org ID from JWT for cache scoping
  const payload = decodeJWTPayload(token);
  if (!payload) {
    return null;
  }
  return payload.orgId;
}
