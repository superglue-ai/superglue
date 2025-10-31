import { tokenRegistry } from "./token-registry";

// This returns the token as a unique identifier for the cache scope.
// Can be rewritten to use the user ID or org ID.
export function getCacheScopeIdentifier(): string | null {
  return tokenRegistry.getToken();
}