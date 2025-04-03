import { LocalKeyManager } from "./localKeyManager.js";
import { SupabaseKeyManager } from "./supabaseKeyManager.js";
import { logMessage } from "../utils/logs.js";

// Instead, create a getter to ensure manager is initialized after mocks
let _authManager: LocalKeyManager | SupabaseKeyManager | null = null;
function getAuthManager() {
  if (!_authManager) {
    _authManager = process.env.NEXT_PUBLIC_SUPABASE_URL ? new SupabaseKeyManager() : new LocalKeyManager();
  }
  return _authManager;
}

// HTTP Middleware
export const authMiddleware = async (req, res, next) => {
    // Skip authentication for websocket connections
    if (req.headers.upgrade === 'websocket') return next();
    // Skip authentication for health check
    if (req.path === '/health') return res.status(200).send('OK');
  
    const token = extractToken(req);
    const authResult = await validateToken(token);
  
    // If authentication fails, return 401 error
    if (!authResult.success) {
      logMessage('warn', `Authentication failed for token: ${token}`);
      return res.status(401).send(getAuthErrorHTML(token));
    }

    // Add orgId to request object
    req.orgId = authResult.orgId;
    req.headers["orgId"] = authResult.orgId;

    return next();
};
  
// Shared auth function
export async function validateToken(token: string | undefined) {
  if (!token) {
    return {
      success: false,
      message: 'No token provided',
      orgId: undefined
    }
  }

  const authResult = await getAuthManager().authenticate(token);
  return {
    success: authResult.success,
    orgId: authResult.orgId,
    message: authResult.success ? '' : 'Invalid token'
  }
}
  
  // Extract token from various sources
export const extractToken = (source: { headers?: any, query?: any } | { connectionParams?: any, extra?: any }): string | undefined => {
    if ('headers' in source) {
      // HTTP request
      return source.headers?.authorization?.split(" ")?.[1]?.trim() || source.query?.token;
    } else if ('connectionParams' in source) {
      // WebSocket connection
      return source.connectionParams?.Authorization?.split(" ")?.[1]?.trim() || 
             source.extra?.request?.url?.split("token=")?.[1]?.split("&")?.[0];
    }
    return undefined;
};
  // Helper Functions
 function getAuthErrorHTML(token: string | undefined) {
    return `
      <html>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;">
          <div style="text-align: center;">
            <h1>🔐 Authentication ${token ? 'Failed' : 'Required'}</h1>
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

  export const _resetAuthManager = (manager: LocalKeyManager | SupabaseKeyManager | null = null) => {
    _authManager = manager;
  }; 