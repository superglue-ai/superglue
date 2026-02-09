import { logMessage } from "../utils/logs.js";
import { LocalKeyManager } from "./local-key-manager.js";
import { AuthManager, AuthResult } from "./types.js";

let _authManager: AuthManager | null = null;
function getAuthManager(): AuthManager {
  if (!_authManager) {
    _authManager = new LocalKeyManager();
  }
  return _authManager;
}

export const _resetAuthManager = (manager: AuthManager | null = null) => {
  _authManager = manager;
};

export async function createApiKey(
  orgId: string,
  userId?: string,
  mode?: "frontend" | "backend",
): Promise<string | null> {
  const manager = getAuthManager();
  if (manager.createApiKey) {
    return manager.createApiKey(orgId, userId, mode);
  }
  return null;
}

export async function validateToken(token: string | undefined): Promise<AuthResult> {
  if (!token) {
    return {
      success: false,
      message: "No token provided",
      orgId: "",
    };
  }

  // Authenticate using the appropriate manager (handles both JWT and API keys)
  const authResult = await getAuthManager().authenticate(token);
  return {
    ...authResult,
    orgId: authResult.orgId || "",
    message: authResult.success ? "Authentication successful" : "Authentication failed",
  };
}

// ============================================================================
// EXPRESS-SPECIFIC AUTHENTICATION MIDDLEWARE
// ============================================================================

// HTTP Middleware for Express
export const authMiddleware = async (req: any, res: any, next: any) => {
  // Skip authentication for health check
  if (req.path === "/health") return res.status(200).send("OK");

  const token = extractTokenFromExpressRequest(req);
  const authResult = await validateToken(token);

  // If authentication fails, return 401 error
  if (!authResult.success) {
    logMessage("warn", `Authentication failed for token: ${token?.slice(0, 10) ?? "none"}...`, {
      traceId: req.traceId,
    });
    return res.status(401).send(getAuthErrorHTML(token));
  }

  // Add orgId to request object
  req.orgId = authResult.orgId;
  req.headers["orgId"] = authResult.orgId;

  req.authInfo = {
    token: token,
    clientId: authResult.orgId,
    userId: authResult.userId,
    orgName: authResult.orgName,
    orgRole: authResult.orgRole,
    isRestricted: authResult.isRestricted,
    allowedTools: authResult.allowedTools,
  };

  return next();
};

// Extract token from various sources
export const extractTokenFromExpressRequest = (
  source: { headers?: any; query?: any } | { connectionParams?: any; extra?: any },
): string | undefined => {
  if ("headers" in source) {
    // HTTP request
    return source.headers?.authorization?.split(" ")?.[1]?.trim() || source.query?.token;
  } else if ("connectionParams" in source) {
    // WebSocket connection
    return (
      source.connectionParams?.Authorization?.split(" ")?.[1]?.trim() ||
      source.extra?.request?.url?.split("token=")?.[1]?.split("&")?.[0] ||
      source.extra?.request?.url?.split("superglueApiKey=")?.[1]?.split("&")?.[0]
    );
  }
  return undefined;
};
// Helper Functions
function getAuthErrorHTML(token: string | undefined) {
  return `
      <html>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;">
          <div style="text-align: center;">
            <h1>🔐 Authentication ${token ? "Failed" : "Required"}</h1>
            <p>Please provide a valid auth token via:</p>
            <ul style="list-style: none; padding: 0;">
              <li>Authorization header: <code>Authorization: Bearer TOKEN</code></li>
              <li>Query parameter: <code>?token=TOKEN</code></li>
              <li>WebSocket connectionParams: <code>{ "Authorization": "Bearer TOKEN" }</code></li>
            </ul>
          </div>
        </body>
      </html>
    `;
}

// ============================================================================
// FASTIFY-SPECIFIC AUTHENTICATION
// ============================================================================

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
