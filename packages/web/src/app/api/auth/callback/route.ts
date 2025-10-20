import { ExtendedSuperglueClient, OAuthState } from '@/src/lib/oauth-utils';
import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';

const OAUTH_STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface OAuthTokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_at?: string;
    expires_in?: number;
}

async function exchangeCodeForToken(
    code: string,
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    state?: string
): Promise<OAuthTokenResponse> {
    if (!clientId || !clientSecret) {
        throw new Error('[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth client credentials not configured for authorization code flow');
    }

    try {
        const response = await axios.post(tokenUrl, new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            ...(state ? { state } : {}),
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            }
        });

        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                const errorData = typeof error.response.data === 'string'
                    ? error.response.data.slice(0, 500)
                    : JSON.stringify(error.response.data).slice(0, 500);
                throw new Error(`[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth provider rejected token exchange (HTTP ${error.response.status}). Provider response: ${errorData}`);
            }
            throw new Error(`[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${error.message}`);
        }
        const errMsg = error instanceof Error ? error.message : 'Network error';
        throw new Error(`[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${errMsg}`);
    }
}

async function exchangeClientCredentialsForToken(
    tokenUrl: string,
    clientId: string,
    clientSecret: string
): Promise<OAuthTokenResponse> {
    if (!clientId || !clientSecret) {
        throw new Error('[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth client credentials not configured for client credentials flow');
    }

    try {
        const response = await axios.post(tokenUrl, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            }
        });

        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                const errorData = typeof error.response.data === 'string'
                    ? error.response.data.slice(0, 500)
                    : JSON.stringify(error.response.data).slice(0, 500);
                throw new Error(`[OAUTH_STAGE:TOKEN_EXCHANGE] OAuth provider rejected token exchange for client credentials flow (HTTP ${error.response.status}). Provider response: ${errorData}`);
            }
            throw new Error(`[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${error.message}`);
        }
        const errMsg = error instanceof Error ? error.message : 'Network error';
        throw new Error(`[OAUTH_STAGE:TOKEN_EXCHANGE] Failed to reach OAuth provider token endpoint at ${tokenUrl}: ${errMsg}`);
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
    type: 'success' | 'error',
    message: string,
    integrationId: string,
    origin: string,
    tokens?: any,
    suppressErrorUI?: boolean
): string {
    const isError = type === 'error';
    const title = isError ? 'OAuth Connection Failed' : 'OAuth Connection Successful!';
    const color = isError ? '#dc2626' : '#16a34a';
    const actionText = isError ? 'You can close this window and try again.' : 'You can close this window now.';

    // Properly escape message for JavaScript (including newlines which break string literals)
    const escapedMessage = message
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>OAuth ${isError ? 'Error' : 'Success'}</title>
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
                            integrationId: '${integrationId}',
                            message: '${escapedMessage}',
                            tokens: ${tokens ? JSON.stringify(tokens) : 'undefined'}
                        }, '${origin}');
                    } catch (e) {
                        console.error('Failed to notify parent window:', e);
                    }
                    if (!${isError} || ${suppressErrorUI}) {
                        setTimeout(() => window.close(), 100);
                    }
                } else {
                    window.location.href = '${origin}/integrations?${isError ? 'error' : 'success'}=oauth_${type}&integration=${integrationId}&message=' + encodeURIComponent('${escapedMessage}');
                }
            </script>
        </body>
        </html>
    `;
}

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;

    // Get the correct origin
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host');

    // Determine the correct origin:
    // 1. Use x-forwarded-host if available
    // 2. Use host header with forwarded proto if x-forwarded-proto is set
    // 3. Fall back to request origin
    let origin: string;
    if (forwardedHost) {
        origin = `${forwardedProto}://${forwardedHost}`;
    } else if (request.headers.get('x-forwarded-proto') && host) {
        origin = `${forwardedProto}://${host}`;
    } else {
        origin = request.nextUrl.origin;
    }

    // Force HTTPS for production domains
    if (origin.startsWith('http://') && origin.includes('superglue.cloud')) {
        origin = origin.replace('http://', 'https://');
    }

    // Extract OAuth parameters
    const code = searchParams.get('code');
    const grantTypeParam = searchParams.get('grant_type');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth provider errors
    if (error) {
        const errorMsg = `[OAUTH_STAGE:AUTHORIZATION] OAuth provider returned error during user authorization: ${error}${errorDescription ? ` - ${errorDescription}` : ''}. This error occurred before the token exchange step.`;
        let integrationId = 'unknown';
        let suppressErrorUI = false;
        try {
            if (state) {
                const stateData = JSON.parse(atob(state)) as OAuthState;
                integrationId = stateData.integrationId || 'unknown';
                suppressErrorUI = stateData.suppressErrorUI || false;
            }
        } catch { }

        const html = createOAuthCallbackHTML('error', errorMsg, integrationId, origin, undefined, suppressErrorUI);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if ((!code && grantTypeParam !== 'client_credentials') || !state) {
        const errorMsg = !code
            ? '[OAUTH_STAGE:CALLBACK] No authorization code received from OAuth provider. The user may have denied access or the OAuth provider did not redirect properly.'
            : '[OAUTH_STAGE:CALLBACK] No state parameter received from OAuth provider. This indicates a malformed OAuth callback.';

        return NextResponse.redirect(
            buildRedirectUrl(origin, '/integrations', {
                error: !code ? 'no_code' : 'no_state',
                message: errorMsg
            })
        );
    }

    try {
        const stateData = JSON.parse(atob(state)) as OAuthState & { token_url?: string };
        const { integrationId, apiKey, timestamp, client_credentials_uid, templateId, clientId, token_url, suppressErrorUI } = stateData;

        if (Date.now() - timestamp >= OAUTH_STATE_EXPIRY_MS) {
            throw new Error('[OAUTH_STAGE:VALIDATION] OAuth state expired (older than 5 minutes). Please start the OAuth flow again.');
        }

        const endpoint = process.env.GRAPHQL_ENDPOINT;
        const client = new ExtendedSuperglueClient({ endpoint, apiKey });
        const resolved = await client.getOAuthClientCredentials({ templateId, clientCredentialsUid: client_credentials_uid });
        if (!resolved?.client_secret || !resolved?.client_id) {
            throw new Error('[OAUTH_STAGE:CREDENTIAL_RESOLUTION] OAuth client credentials could not be resolved from backend. The client_id or client_secret may not have been properly stored.');
        }

        let tokenData: OAuthTokenResponse;
        if (grantTypeParam === 'client_credentials') {
            tokenData = await exchangeClientCredentialsForToken(String(token_url), resolved.client_id, resolved.client_secret);
        } else {
            const redirectUri = stateData.redirectUri || `${origin}/api/auth/callback`;
            tokenData = await exchangeCodeForToken(code as string, String(token_url), resolved.client_id, resolved.client_secret, redirectUri, state);
        }

        if (!tokenData || typeof tokenData !== 'object') {
            throw new Error('[OAUTH_STAGE:TOKEN_VALIDATION] Invalid token response from OAuth provider - expected object with access_token field');
        }

        const { access_token, refresh_token, ...additionalFields } = tokenData;

        if (!access_token) {
            console.error('[OAUTH_DEBUG] Token data received from provider:', JSON.stringify(tokenData, null, 2));
            console.error('[OAUTH_DEBUG] Token URL:', token_url);
            console.error('[OAUTH_DEBUG] Integration ID:', integrationId);
            throw new Error(`[OAUTH_STAGE:TOKEN_VALIDATION] No access_token field in OAuth provider response. The provider may require different OAuth configuration or the token_url may be incorrect: ${JSON.stringify(tokenData, null, 2)}`);
        }

        // Package the tokens for the frontend to handle
        const tokens = {
            access_token,
            refresh_token: refresh_token || access_token,
            token_type: additionalFields.token_type || 'Bearer',
            expires_at: additionalFields.expires_at || (additionalFields.expires_in ? new Date(Date.now() + additionalFields.expires_in * 1000).toISOString() : undefined),
        };

        if (grantTypeParam === 'client_credentials') {
            return NextResponse.json({
                type: 'oauth-success',
                integrationId,
                message: 'OAuth connection completed successfully!',
                tokens
            });
        } else {
            const html = createOAuthCallbackHTML('success', 'OAuth connection completed successfully!', integrationId, origin, tokens, suppressErrorUI);
            return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
        }
    } catch (error) {
        console.error('OAuth callback error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Try to extract integration ID from state if available
        let integrationId = 'unknown';
        let isClientCredentials = false;
        let suppressErrorUI = false;
        try {
            if (state) {
                const stateData = JSON.parse(atob(state)) as OAuthState;
                integrationId = stateData.integrationId || 'unknown';
                suppressErrorUI = stateData.suppressErrorUI || false;
            }
            isClientCredentials = grantTypeParam === 'client_credentials';
        } catch {
            // Ignore state parsing errors, use default
        }

        if (isClientCredentials) {
            return NextResponse.json({
                type: 'oauth-error',
                integrationId,
                message: errorMessage
            }, { status: 400 });
        } else {
            const html = createOAuthCallbackHTML('error', errorMessage, integrationId, origin, undefined, suppressErrorUI);
            return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
        }
    }
}