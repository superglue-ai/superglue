import type { Integration } from '@superglue/client';
import { getOAuthTokenUrl, resolveOAuthCertAndKey } from '@superglue/shared';
import axios from 'axios';
import https from 'https';
import { logMessage } from './logs.js';

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_at?: string;
    expires_in?: number;
}

export function isTokenExpired(integration: Integration): boolean {
    const { expires_at } = integration.credentials || {};
    if (!expires_at) return false;

    const expiryTime = new Date(expires_at).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return expiryTime < (now + fiveMinutes);
}

export async function refreshOAuthToken(
    integration: Integration,
): Promise<{ success: boolean, newCredentials: Record<string, any> }> {
    const { client_id, client_secret, refresh_token, access_token, grant_type, oauth_cert, oauth_key, scopes } = integration.credentials || {};
    const isClientCredentials = grant_type === 'client_credentials';

    if (!client_id) {
        logMessage('error', 'Missing client_id for token refresh', {
            integrationId: integration.id
        });
        return { success: false, newCredentials: {} };
    }

    if (isClientCredentials) {
        const hasCertAndKey = !!(oauth_cert && oauth_key);
        if (!hasCertAndKey && !client_secret) {
            logMessage('error', 'Missing credentials for client_credentials token refresh', {
                integrationId: integration.id,
                hasClientSecret: !!client_secret,
                hasCertAndKey
            });
            return { success: false, newCredentials: {} };
        }
    } else {
        if (!client_secret || !refresh_token) {
            logMessage('error', 'Missing required credentials for authorization_code token refresh', {
                integrationId: integration.id,
                hasClientSecret: !!client_secret,
                hasRefreshToken: !!refresh_token
            });
            return { success: false, newCredentials: {} };
        }
    }

    try {
        const tokenUrl = getOAuthTokenUrl(integration);
        if (!tokenUrl) {
            throw new Error('Could not determine token URL for integration');
        }

        let certContent: string | undefined;
        let keyContent: string | undefined;
        
        if (oauth_cert && oauth_key) {
            const { cert, key } = resolveOAuthCertAndKey(oauth_cert, oauth_key);
            certContent = cert?.content;
            keyContent = key?.content;
        }

        const httpsAgent = (certContent && keyContent) ? new https.Agent({
            cert: certContent,
            key: keyContent,
            rejectUnauthorized: false
        }) : undefined;

        const params: Record<string, string> = isClientCredentials ? {
            grant_type: 'client_credentials',
            client_id,
            ...(client_secret && { client_secret }),
            ...(scopes && { scope: scopes })
        } : {
            grant_type: 'refresh_token',
            refresh_token: refresh_token!,
            client_id,
            client_secret: client_secret!,
        };

        const response = await axios.post(tokenUrl, new URLSearchParams(params), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            httpsAgent,
            validateStatus: null
        });

        if (response.status < 200 || response.status >= 300) {
            const errorText = typeof response.data === 'string' 
                ? response.data 
                : JSON.stringify(response.data);
            if (access_token === refresh_token) {
                throw new Error(`OAuth access token was unable to refresh. This integration likely uses a long-lived access token in its OAuth flow. Please reauthenticate with the OAuth provider to refresh the access token manually.`);
            }
            throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
        }

        const tokenData: OAuthTokens = response.data;

        integration.credentials = {
            ...integration.credentials,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || refresh_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_at: tokenData.expires_at || (tokenData.expires_in
                ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                : undefined),
        };

        logMessage('info', `Successfully ${isClientCredentials ? 'renewed' : 'refreshed'} OAuth token`, {
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