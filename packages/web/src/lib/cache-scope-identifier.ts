import { decodeJWTPayload } from "./jwt-utils";
import { tokenRegistry } from "./token-registry";

const EMPTY_ORG_SCOPE = "__sg_empty_org__";

function hashString(input: string): number {
  return input.split("").reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
}

function normalizeOrgScope(orgId: string | null | undefined): string | null {
  if (orgId === null || orgId === undefined) {
    return null;
  }

  return orgId === "" ? EMPTY_ORG_SCOPE : orgId;
}

export function getCacheScopeIdentifier(): string | null {
  const token = tokenRegistry.getToken();
  if (!token) {
    return null;
  }

  // Prefer org ID from JWT when available.
  const payload = decodeJWTPayload(token);
  const orgScope = normalizeOrgScope(payload?.orgId);
  if (orgScope !== null) {
    return orgScope;
  }

  // OSS uses raw API keys rather than JWTs. Fall back to a stable token-derived scope
  // so caches still persist across reloads and remain separated per configured API key.
  return `token:${Math.abs(hashString(token))}`;
}
