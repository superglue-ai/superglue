import type { ServiceMetadata, System } from "@superglue/shared";
import {
  getOAuthTokenUrl,
  getOAuthTokenExchangeConfig,
  resolveOAuthCertAndKey,
} from "@superglue/shared";
import axios from "axios";
import https from "https";
import { logMessage } from "./logs.js";

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: string;
  expires_in?: number;
}

export function isTokenExpired(system: System): boolean {
  const { expires_at } = system.credentials || {};
  if (!expires_at) return false;

  const expiryTime = new Date(expires_at).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  return expiryTime < now + fiveMinutes;
}

export async function refreshOAuthToken(
  system: System,
  metadata: ServiceMetadata,
): Promise<{ success: boolean; newCredentials: Record<string, any> }> {
  const {
    client_id,
    client_secret,
    refresh_token,
    access_token,
    grant_type,
    oauth_cert,
    oauth_key,
    scopes,
  } = system.credentials || {};
  const isClientCredentials = grant_type === "client_credentials";

  if (!client_id) {
    logMessage("error", "Missing client_id for token refresh", metadata);
    return { success: false, newCredentials: {} };
  }

  if (isClientCredentials) {
    const hasCertAndKey = !!(oauth_cert && oauth_key);
    if (!hasCertAndKey && !client_secret) {
      logMessage("error", "Missing credentials for client_credentials token refresh", metadata);
      return { success: false, newCredentials: {} };
    }
  } else {
    if (!client_secret || !refresh_token) {
      logMessage(
        "error",
        "Missing required credentials for authorization_code token refresh",
        metadata,
      );
      return { success: false, newCredentials: {} };
    }
  }

  try {
    const tokenUrl = getOAuthTokenUrl(system);
    if (!tokenUrl) {
      throw new Error("Could not determine token URL for system");
    }

    // Get token exchange config (from stored credentials or template)
    const tokenConfig = getOAuthTokenExchangeConfig(system);
    const useBasicAuth = tokenConfig.tokenAuthMethod === "basic_auth";
    const useJson = tokenConfig.tokenContentType === "json";

    let certContent: string | undefined;
    let keyContent: string | undefined;

    if (oauth_cert && oauth_key) {
      const { cert, key } = resolveOAuthCertAndKey(oauth_cert, oauth_key);
      certContent = cert?.content;
      keyContent = key?.content;
    }

    const httpsAgent =
      certContent && keyContent
        ? new https.Agent({
            cert: certContent,
            key: keyContent,
            rejectUnauthorized: false,
          })
        : undefined;

    // Build request body
    const bodyParams: Record<string, string> = isClientCredentials
      ? {
          grant_type: "client_credentials",
          ...(scopes && { scope: scopes }),
        }
      : {
          grant_type: "refresh_token",
          refresh_token: refresh_token!,
        };

    // Add credentials to body if not using basic auth, or if basic auth but no secret (fallback)
    if (!useBasicAuth || !client_secret) {
      bodyParams.client_id = client_id;
      if (client_secret) bodyParams.client_secret = client_secret;
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": useJson ? "application/json" : "application/x-www-form-urlencoded",
      Accept: "application/json",
      ...tokenConfig.extraHeaders,
    };

    // Add basic auth header if configured and secret is available
    if (useBasicAuth && client_secret) {
      const basicAuth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");
      headers["Authorization"] = `Basic ${basicAuth}`;
    }

    // Build request body in correct format
    const body = useJson ? JSON.stringify(bodyParams) : new URLSearchParams(bodyParams);

    const response = await axios.post(tokenUrl, body, {
      headers,
      httpsAgent,
      validateStatus: null,
    });

    if (response.status < 200 || response.status >= 300) {
      const errorText =
        typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      if (access_token === refresh_token) {
        throw new Error(
          `OAuth access token was unable to refresh. This system likely uses a long-lived access token in its OAuth flow. Please reauthenticate with the OAuth provider to refresh the access token manually. ${errorText}`,
        );
      }
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const tokenData: OAuthTokens = response.data;

    system.credentials = {
      ...system.credentials,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refresh_token,
      token_type: tokenData.token_type || "Bearer",
      expires_at:
        tokenData.expires_at ||
        (tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : undefined),
    };

    logMessage(
      "info",
      `Successfully ${isClientCredentials ? "renewed" : "refreshed"} OAuth token`,
      metadata,
    );

    return { success: true, newCredentials: system.credentials };
  } catch (error) {
    logMessage(
      "error",
      "Error refreshing OAuth token: " + (error instanceof Error ? error.message : String(error)),
      metadata,
    );
    return { success: false, newCredentials: {} };
  }
}
