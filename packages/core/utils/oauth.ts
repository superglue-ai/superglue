import type { Integration } from '@superglue/client';
import { getOAuthConfig, getOAuthTokenUrl, integrations, type IntegrationConfig } from '@superglue/shared';
import { logMessage } from './logs.js';

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_at?: string;
    expires_in?: number;
}

export interface OAuthCallbackResult {
    success: boolean;
    integration?: Integration;
    error?: string;
}

/**
 * Check if OAuth token is expired or about to expire
 */
export function isTokenExpired(integration: Integration): boolean {
    const { expires_at } = integration.credentials || {};
    if (!expires_at) return false;

    // Consider token expired if it expires in less than 5 minutes
    const expiryTime = new Date(expires_at).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return expiryTime < (now + fiveMinutes);
}

/**
 * Refresh OAuth tokens for an integration
 */
export async function refreshOAuthToken(
    integration: Integration,
): Promise<{ success: boolean, newCredentials: Record<string, any> }> {
    const { client_id, client_secret, refresh_token, access_token } = integration.credentials || {};

    if (!client_id || !client_secret || !refresh_token) {
        logMessage('error', 'Missing required credentials for token refresh', {
            integrationId: integration.id,
            hasClientId: !!client_id,
            hasClientSecret: !!client_secret,
            hasRefreshToken: !!refresh_token
        });
        return { success: false, newCredentials: {} };
    }

    try {
        const tokenUrl = getOAuthTokenUrl(integration);
        if (!tokenUrl) {
            throw new Error('Could not determine token URL for integration');
        }

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token,
                client_id,
                client_secret,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Check if this is a long-lived access token scenario (access_token === refresh_token)
            if (access_token === refresh_token) {
                throw new Error(`OAuth access token was unable to refresh. This integration likely uses a long-lived access token in its OAuth flow. Please reauthenticate with the OAuth provider to refresh the access token manually.`);
            }
            throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
        }

        const tokenData: OAuthTokens = await response.json();

        // Update integration credentials in place
        integration.credentials = {
            ...integration.credentials,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || refresh_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_at: tokenData.expires_at || (tokenData.expires_in
                ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                : undefined),
        };

        logMessage('info', 'Successfully refreshed OAuth token', {
            integrationId: integration.id
        });

        return { success: true, newCredentials: integration.credentials };
    } catch (error) {
        logMessage('error', 'Error refreshing OAuth token', {
            integrationId: integration.id,
            error: error instanceof Error ? error.message : String(error)
        });
        return { success: false, newCredentials: {} };
    }
}

/**
 * Build OAuth headers for API requests
 */
export function buildOAuthHeaders(integration: Integration): Record<string, string> {
    const { access_token, token_type = 'Bearer' } = integration.credentials || {};

    if (!access_token) {
        return {};
    }

    return {
        Authorization: `${token_type} ${access_token}`,
    };
}

/**
 * Handle client credentials OAuth flow
 */
export async function handleClientCredentialsFlow(
    integrationId: string,
    getIntegration: (id: string) => Promise<Integration | null>,
    updateIntegration: (id: string, integration: Integration) => Promise<void>
): Promise<OAuthCallbackResult> {
    try {
        const integration = await getIntegration(integrationId);

        if (!integration) {
            return {
                success: false,
                error: 'Integration not found'
            };
        }

        const { client_id, client_secret, token_url, scopes } = integration.credentials || {};

        if (!client_id || !client_secret) {
            return {
                success: false,
                error: 'OAuth client credentials not configured'
            };
        }

        // Get token URL
        let finalTokenUrl = token_url as string;
        if (!finalTokenUrl) {
            finalTokenUrl = getOAuthTokenUrl(integration);
            if (!finalTokenUrl) {
                return {
                    success: false,
                    error: 'Could not determine token URL for integration'
                };
            }
        }

        // Prepare request body
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
        });

        if (scopes) {
            body.append('scope', scopes as string);
        }

        // Make the token request with basic auth
        const authHeader = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
        const tokenResponse = await fetch(finalTokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Authorization': `Basic ${authHeader}`,
            },
            body,
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            return {
                success: false,
                error: `Client credentials flow failed: ${errorData}`
            };
        }

        const tokenData = await tokenResponse.json();

        // Update integration with new tokens
        const updatedIntegration = {
            ...integration,
            credentials: {
                ...integration.credentials,
                access_token: tokenData.access_token,
                token_type: tokenData.token_type || 'Bearer',
                expires_at: tokenData.expires_at || (tokenData.expires_in
                    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                    : undefined),
            },
        };

        // Save the updated integration
        await updateIntegration(integrationId, updatedIntegration);

        logMessage('info', 'Successfully completed client credentials OAuth flow', {
            integrationId
        });

        return {
            success: true,
            integration: updatedIntegration
        };
    } catch (error) {
        logMessage('error', 'Client credentials OAuth flow error', {
            integrationId,
            error: error instanceof Error ? error.message : String(error)
        });

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Handle OAuth callback - exchange code for tokens
 */
export async function handleOAuthCallback(
    integrationId: string,
    code: string,
    redirectUri: string,
    getIntegration: (id: string) => Promise<Integration | null>,
    updateIntegration: (id: string, integration: Integration) => Promise<void>
): Promise<OAuthCallbackResult> {
    try {
        const integration = await getIntegration(integrationId);

        if (!integration) {
            return {
                success: false,
                error: 'Integration not found'
            };
        }

        const { client_id, client_secret } = integration.credentials || {};

        if (!client_id || !client_secret) {
            return {
                success: false,
                error: 'OAuth client credentials not configured'
            };
        }

        // Get token URL
        const tokenUrl = getOAuthTokenUrl(integration);
        if (!tokenUrl) {
            return {
                success: false,
                error: 'Could not determine token URL for integration'
            };
        }

        // Exchange authorization code for access token
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id,
                client_secret,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            return {
                success: false,
                error: `Token exchange failed: ${errorData}`
            };
        }

        const tokenData = await tokenResponse.json();

        // Update integration with new tokens
        const updatedIntegration = {
            ...integration,
            credentials: {
                ...integration.credentials,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || integration.credentials.refresh_token,
                token_type: tokenData.token_type || 'Bearer',
                expires_at: tokenData.expires_at || (tokenData.expires_in
                    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                    : undefined),
            },
        };

        // Save the updated integration
        await updateIntegration(integrationId, updatedIntegration);

        logMessage('info', 'Successfully completed OAuth flow', {
            integrationId
        });

        return {
            success: true,
            integration: updatedIntegration
        };
    } catch (error) {
        logMessage('error', 'OAuth callback error', {
            integrationId,
            error: error instanceof Error ? error.message : String(error)
        });

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Build OAuth authorization URL
 */
export function buildOAuthAuthorizationUrl(
    integration: Integration,
    redirectUri: string,
    state?: string
): string | null {
    const { client_id, auth_url } = integration.credentials || {};

    if (!client_id) return null;

    // Try to get auth URL from configuration or credentials
    let authUrl = auth_url as string | undefined;

    if (!authUrl) {
        // Try to get from known integrations
        const match = Object.entries(integrations).find(([key]) =>
            integration.id === key || integration.urlHost?.includes(key)
        );

        if (match) {
            const [_, config] = match as [string, IntegrationConfig];
            authUrl = config.oauth?.authUrl;
        }
    }

    if (!authUrl) return null;

    // Get default scopes
    const oauthConfig = getOAuthConfig(integration.id);
    const defaultScopes = oauthConfig?.scopes || '';

    const params = new URLSearchParams({
        client_id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: (integration.credentials?.scope as string) || defaultScopes,
        ...(state ? { state } : {}),
    });

    return `${authUrl}?${params.toString()}`;
} 