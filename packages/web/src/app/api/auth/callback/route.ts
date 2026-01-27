import { SuperglueClient, systems } from "@superglue/shared";
import { OAuthState } from "@/src/lib/oauth-utils";
import { resolveOAuthCertAndKey } from "@superglue/shared";
import axios from "axios";
import https from "https";
import { NextRequest, NextResponse } from "next/server";

const OAUTH_STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: string;
  expires_in?: number;
}

interface TokenExchangeConfig {
  tokenAuthMethod?: "body" | "basic_auth";
  tokenContentType?: "form" | "json";
  extraHeaders?: Record<string, string>;
}

function getTokenExchangeConfig(
  templateId?: string,
  stateConfig?: TokenExchangeConfig,
): TokenExchangeConfig {
  // State config (from agent) takes priority over template config
  const templateConfig: TokenExchangeConfig = {};
  if (templateId) {
    const template = systems[templateId];
    if (template?.oauth) {
      templateConfig.tokenAuthMethod = template.oauth.tokenAuthMethod;
      templateConfig.tokenContentType = template.oauth.tokenContentType;
      templateConfig.extraHeaders = template.oauth.extraHeaders;
    }
  }

  return {
    tokenAuthMethod: stateConfig?.tokenAuthMethod ?? templateConfig.tokenAuthMethod,
    tokenContentType: stateConfig?.tokenContentType ?? templateConfig.tokenContentType,
    extraHeaders: stateConfig?.extraHeaders ?? templateConfig.extraHeaders,
  };
}

async function exchangeCodeForToken(
  code: string,
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  config: TokenExchangeConfig = {},
  codeVerifier?: string,
): Promise<OAuthTokenResponse> {
  if (!clientId || (!clientSecret && !codeVerifier)) {
    throw new Error(
      "[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth client credentials not configured for authorization code flow",
    );
  }

  const useBasicAuth = config.tokenAuthMethod === "basic_auth";
  const useJson = config.tokenContentType === "json";

  const headers: Record<string, string> = {
    "Content-Type": useJson ? "application/json" : "application/x-www-form-urlencoded",
    Accept: "application/json",
    ...config.extraHeaders,
  };

  if (useBasicAuth && clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  }

  try {
    let body: string | URLSearchParams;
    if (useJson) {
      const jsonBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      };
      // Only include credentials in body if not using basic auth
      if (!useBasicAuth) {
        jsonBody.client_id = clientId;
        if (clientSecret) jsonBody.client_secret = clientSecret;
      }
      // Add PKCE code_verifier if present
      if (codeVerifier) {
        jsonBody.code_verifier = codeVerifier;
      }
      body = JSON.stringify(jsonBody);
    } else {
      const formParams: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      };
      // Only include credentials in body if not using basic auth
      if (!useBasicAuth) {
        formParams.client_id = clientId;
        if (clientSecret) formParams.client_secret = clientSecret;
      }
      // Add PKCE code_verifier if present
      if (codeVerifier) {
        formParams.code_verifier = codeVerifier;
      }
      body = new URLSearchParams(formParams);
    }

    const response = await axios.post(tokenUrl, body, { headers });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorData =
          typeof error.response.data === "string"
            ? error.response.data.slice(0, 500)
            : JSON.stringify(error.response.data).slice(0, 500);
        throw new Error(
          `[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth provider rejected token exchange (HTTP ${error.response.status}). Provider response: ${errorData}`,
        );
      }
      throw new Error(
        `[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${error.message}`,
      );
    }
    const errMsg = error instanceof Error ? error.message : "Network error";
    throw new Error(
      `[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${errMsg}`,
    );
  }
}

async function exchangeClientCredentialsForToken(
  tokenUrl: string,
  clientId: string,
  clientSecret?: string,
  oauth_cert?: string,
  oauth_key?: string,
  scopes?: string,
): Promise<OAuthTokenResponse> {
  if (!clientId || (!clientSecret && !oauth_cert && !oauth_key)) {
    throw new Error(
      "[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth client credentials not configured for client credentials flow",
    );
  }

  const httpsAgent =
    oauth_cert && oauth_key
      ? new https.Agent({
          cert: oauth_cert,
          key: oauth_key,
          rejectUnauthorized: false,
        })
      : undefined;

  const params: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: clientId,
    ...(clientSecret && { client_secret: clientSecret }),
    ...(scopes && { scope: scopes }),
  };

  try {
    const response = await axios.post(tokenUrl, new URLSearchParams(params), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      httpsAgent,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorData =
          typeof error.response.data === "string"
            ? error.response.data.slice(0, 500)
            : JSON.stringify(error.response.data).slice(0, 500);
        throw new Error(
          `[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth provider rejected token exchange for client credentials flow (HTTP ${error.response.status}). Provider response: ${errorData}`,
        );
      }
      throw new Error(
        `[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${error.message}`,
      );
    }
    const errMsg = error instanceof Error ? error.message : "Network error";
    throw new Error(
      `[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${errMsg}`,
    );
  }
}

function buildRedirectUrl(origin: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, origin);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

// Centralized OAuth callback HTML response generator
function createOAuthCallbackHTML(
  type: "success" | "error",
  message: string,
  systemId: string,
  origin: string,
  tokens?: any,
  suppressErrorUI?: boolean,
): string {
  const isError = type === "error";
  const title = isError ? "OAuth Connection Failed" : "OAuth Connection Successful!";
  const color = isError ? "#dc2626" : "#16a34a";
  const actionText = isError
    ? "You can close this window and try again."
    : "You can close this window now.";

  // Properly escape message for JavaScript (including newlines which break string literals)
  const escapedMessage = message
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>OAuth ${isError ? "Error" : "Success"}</title>
        </head>
        <body>
            <div style="text-align: center; padding: 50px; font-family: system-ui;">
                <h2 style="color: ${color};">${title}</h2>
                <p>${message}</p>
                <p style="margin-top: 20px;">${actionText}</p>
            </div>
            <script>
                if (window.opener) {
                    try {
                        window.opener.postMessage({ 
                            type: 'oauth-${type}', 
                            systemId: '${systemId}',
                            message: '${escapedMessage}',
                            tokens: ${tokens ? JSON.stringify(tokens) : "undefined"}
                        }, '${origin}');
                    } catch (e) {
                        console.error('Failed to notify parent window:', e);
                    }
                    if (!${isError} || ${suppressErrorUI}) {
                        setTimeout(() => window.close(), 100);
                    }
                } else {
                    window.location.href = '${origin}/systems?${isError ? "error" : "success"}=oauth_${type}&system=${systemId}&message=' + encodeURIComponent('${escapedMessage}');
                }
            </script>
        </body>
        </html>
    `;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Get the correct origin
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");

  // Determine the correct origin:
  // 1. Use x-forwarded-host if available
  // 2. Use host header with forwarded proto if x-forwarded-proto is set
  // 3. Fall back to request origin
  let origin: string;
  if (forwardedHost) {
    origin = `${forwardedProto}://${forwardedHost}`;
  } else if (request.headers.get("x-forwarded-proto") && host) {
    origin = `${forwardedProto}://${host}`;
  } else {
    origin = request.nextUrl.origin;
  }

  // Force HTTPS for production domains
  if (origin.startsWith("http://") && origin.includes("superglue.cloud")) {
    origin = origin.replace("http://", "https://");
  }

  // Extract OAuth parameters
  const code = searchParams.get("code");
  const grantTypeParam = searchParams.get("grant_type");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth provider errors
  if (error) {
    const errorMsg = `[OAUTH_STAGE:AUTHORIZATION] OAuth provider returned error during user authorization: ${error}${errorDescription ? ` - ${errorDescription}` : ""}. This error occurred before the token exchange step.`;
    let systemId = "unknown";
    let suppressErrorUI = false;
    try {
      if (state) {
        const stateData = JSON.parse(atob(state)) as OAuthState;
        systemId = stateData.systemId || "unknown";
        suppressErrorUI = stateData.suppressErrorUI || false;
      }
    } catch {}

    const html = createOAuthCallbackHTML(
      "error",
      errorMsg,
      systemId,
      origin,
      undefined,
      suppressErrorUI,
    );
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  }

  if ((!code && grantTypeParam !== "client_credentials") || !state) {
    const errorMsg = !code
      ? "[OAUTH_STAGE:CALLBACK] No authorization code received from OAuth provider. The user may have denied access or the OAuth provider did not redirect properly."
      : "[OAUTH_STAGE:CALLBACK] No state parameter received from OAuth provider. This indicates a malformed OAuth callback.";

    return NextResponse.redirect(
      buildRedirectUrl(origin, "/systems", {
        error: !code ? "no_code" : "no_state",
        message: errorMsg,
      }),
    );
  }

  try {
    const stateData = JSON.parse(atob(state)) as OAuthState & { token_url?: string };
    const {
      systemId,
      timestamp,
      clientId,
      client_credentials_uid,
      templateId,
      token_url,
      suppressErrorUI,
      oauth_cert,
      oauth_key,
      scopes,
    } = stateData;

    if (Date.now() - timestamp >= OAUTH_STATE_EXPIRY_MS) {
      throw new Error(
        "[OAUTH_STAGE:VALIDATION] OAuth state expired (older than 5 minutes). Please start the OAuth flow again.",
      );
    }

    const endpoint = process.env.GRAPHQL_ENDPOINT;

    // Get OAuth session from cookie (set during OAuth init)
    const oauthSessionCookie = request.cookies.get("oauth_session")?.value;
    // Fallback to legacy api_key cookie for backwards compatibility
    const legacyApiKey = request.cookies.get("api_key")?.value;

    let apiKey: string | undefined;
    let codeVerifier: string | undefined;

    if (oauthSessionCookie) {
      try {
        const sessionData = JSON.parse(oauthSessionCookie);
        apiKey = sessionData.apiKey;
        codeVerifier = sessionData.codeVerifier;
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Fallback to legacy cookie
    if (!apiKey && legacyApiKey) {
      apiKey = legacyApiKey;
    }

    if (!apiKey) {
      throw new Error(
        "[OAUTH_STAGE:AUTHENTICATION] No API key found. OAuth session may have expired or was not properly initialized.",
      );
    }

    // skip backend resolution if its key/cert oauth
    let resolved: { client_id: string; client_secret: string } | undefined;
    if (oauth_cert && oauth_key) {
      resolved = {
        client_id: clientId,
        client_secret: "",
      };
    } else {
      const client = new SuperglueClient({
        endpoint,
        apiKey: apiKey,
        apiEndpoint: process.env.API_ENDPOINT,
      });
      resolved = await client.getOAuthClientCredentials({
        templateId,
        clientCredentialsUid: client_credentials_uid,
      });
      if (!resolved?.client_secret || !resolved?.client_id) {
        throw new Error(
          "[OAUTH_STAGE:CREDENTIAL_RESOLUTION] OAuth client credentials could not be resolved from backend. The client_id or client_secret may not have been properly stored.",
        );
      }
    }

    let tokenData: OAuthTokenResponse;
    if (grantTypeParam === "client_credentials") {
      let certContent: string | null = null;
      let keyContent: string | null = null;

      if (oauth_cert && oauth_key) {
        const { cert, key } = resolveOAuthCertAndKey(oauth_cert, oauth_key);
        certContent = cert?.content;
        keyContent = key?.content;
      }

      tokenData = await exchangeClientCredentialsForToken(
        String(token_url),
        resolved.client_id,
        resolved.client_secret,
        certContent,
        keyContent,
        scopes,
      );
    }

    // Get token exchange config - state config (from agent) takes priority over template
    const stateTokenConfig: TokenExchangeConfig = {
      tokenAuthMethod: stateData.tokenAuthMethod,
      tokenContentType: stateData.tokenContentType,
      extraHeaders: stateData.extraHeaders,
    };
    const tokenConfig = getTokenExchangeConfig(templateId, stateTokenConfig);

    if (grantTypeParam !== "client_credentials") {
      const redirectUri = stateData.redirectUri || `${origin}/api/auth/callback`;
      tokenData = await exchangeCodeForToken(
        code as string,
        String(token_url),
        resolved.client_id,
        resolved.client_secret,
        redirectUri,
        tokenConfig,
        codeVerifier,
      );
    }

    if (!tokenData || typeof tokenData !== "object") {
      throw new Error(
        "[OAUTH_STAGE:TOKEN_VALIDATION] Invalid token response from OAuth provider - expected object with access_token field",
      );
    }

    const { access_token, refresh_token, ...additionalFields } = tokenData;

    if (!access_token) {
      console.error(
        "[OAUTH_DEBUG] Token data received from provider:",
        JSON.stringify(tokenData, null, 2),
      );
      console.error("[OAUTH_DEBUG] Token URL:", token_url);
      console.error("[OAUTH_DEBUG] System ID:", systemId);
      throw new Error(
        `[OAUTH_STAGE:TOKEN_VALIDATION] No access_token field in OAuth provider response. The provider may require different OAuth configuration or the token_url may be incorrect: ${JSON.stringify(tokenData, null, 2)}`,
      );
    }

    // Package the tokens for the frontend to handle
    const tokens = {
      access_token,
      refresh_token: refresh_token || access_token,
      token_type: additionalFields.token_type || "Bearer",
      expires_at:
        additionalFields.expires_at ||
        (additionalFields.expires_in
          ? new Date(Date.now() + additionalFields.expires_in * 1000).toISOString()
          : undefined),
      ...(tokenConfig.tokenAuthMethod && { tokenAuthMethod: tokenConfig.tokenAuthMethod }),
      ...(tokenConfig.tokenContentType && { tokenContentType: tokenConfig.tokenContentType }),
      ...(tokenConfig.extraHeaders && { extraHeaders: JSON.stringify(tokenConfig.extraHeaders) }),
    };

    if (grantTypeParam === "client_credentials") {
      const response = NextResponse.json({
        type: "oauth-success",
        systemId,
        message: "OAuth connection completed successfully!",
        tokens,
      });
      response.cookies.delete({ name: "oauth_session", path: "/api/auth/callback" });
      response.cookies.delete("api_key"); // Legacy cleanup
      return response;
    } else {
      const html = createOAuthCallbackHTML(
        "success",
        "OAuth connection completed successfully!",
        systemId,
        origin,
        tokens,
        suppressErrorUI,
      );
      const response = new NextResponse(html, { headers: { "Content-Type": "text/html" } });
      response.cookies.delete({ name: "oauth_session", path: "/api/auth/callback" });
      response.cookies.delete("api_key"); // Legacy cleanup
      return response;
    }
  } catch (error) {
    console.error("OAuth callback error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Try to extract system ID from state if available
    let systemId = "unknown";
    let isClientCredentials = false;
    let suppressErrorUI = false;
    try {
      if (state) {
        const stateData = JSON.parse(atob(state)) as OAuthState;
        systemId = stateData.systemId || "unknown";
        suppressErrorUI = stateData.suppressErrorUI || false;
      }
      isClientCredentials = grantTypeParam === "client_credentials";
    } catch {
      // Ignore state parsing errors, use default
    }

    if (isClientCredentials) {
      const response = NextResponse.json(
        {
          type: "oauth-error",
          systemId,
          message: errorMessage,
        },
        { status: 400 },
      );
      // Clear cookie on error too - must specify same path it was set with
      response.cookies.delete({ name: "oauth_session", path: "/api/auth/callback" });
      response.cookies.delete("api_key"); // Legacy cleanup
      return response;
    } else {
      const html = createOAuthCallbackHTML(
        "error",
        errorMessage,
        systemId,
        origin,
        undefined,
        suppressErrorUI,
      );
      const response = new NextResponse(html, { headers: { "Content-Type": "text/html" } });
      // Clear cookie on error too - must specify same path it was set with
      response.cookies.delete({ name: "oauth_session", path: "/api/auth/callback" });
      response.cookies.delete("api_key"); // Legacy cleanup
      return response;
    }
  }
}
