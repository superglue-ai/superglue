import { getDataStore } from "../datastore/datastore.js";
import { logMessage } from "../utils/logs.js";
import { DataStoreKeyManager } from "./datastore-key-manager.js";
import { AuthManager, AuthResult, CreateApiKeyParams } from "./types.js";

let _authManager: AuthManager | null = null;
function getAuthManager(): AuthManager {
  if (!_authManager) {
    _authManager = new DataStoreKeyManager(() => getDataStore());
  }
  return _authManager;
}

export const _resetAuthManager = (manager: AuthManager | null = null) => {
  _authManager = manager;
};

export async function createApiKey(params: CreateApiKeyParams): Promise<string | null> {
  try {
    const dataStore = getDataStore();
    const newKey = crypto.randomUUID().replace(/-/g, "");

    await dataStore.createApiKey({
      ...params,
      key: newKey,
      userId: params.userId ?? params.createdByUserId,
    });

    return newKey;
  } catch (error) {
    logMessage("error", `Failed to create API key: ${error}`, { orgId: params.orgId });
    return null;
  }
}

export async function validateToken(token: string | undefined): Promise<AuthResult> {
  if (!token) {
    return {
      success: false,
      message: "No token provided",
      orgId: "",
    };
  }

  const authResult = await getAuthManager().authenticate(token);
  return {
    ...authResult,
    orgId: authResult.orgId || "",
    orgName:
      authResult.orgName ??
      (authResult.success && authResult.orgId === "" ? "Personal" : undefined),
    message: authResult.success ? "Authentication successful" : "Authentication failed",
  };
}

// Extract token from Fastify request
export const extractTokenFromFastifyRequest = (request: any): string | undefined => {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1]?.trim();
  }

  // Check query parameter
  if (request.query?.token) {
    return request.query.token;
  }

  return undefined;
};
