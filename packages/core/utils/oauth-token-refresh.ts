import type { Integration } from '@superglue/client';
import { getOAuthTokenUrl } from '@superglue/shared';
import { logMessage } from './logs.js';

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_at?: string;
    expires_in?: number;
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