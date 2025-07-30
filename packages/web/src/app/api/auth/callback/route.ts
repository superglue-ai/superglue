import { SuperglueClient, UpsertMode } from '@superglue/client';
import { integrations } from '@superglue/shared';
import { NextRequest, NextResponse } from 'next/server';

const OAUTH_STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface OAuthState {
    apiKey: string;
    timestamp: number;
    integrationId: string;
    redirectUri?: string;
}

interface OAuthTokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_at?: string;
    expires_in?: number;
}

function getTokenUrl(integration: any): string {
    // Check known integrations
    const knownIntegration = Object.entries(integrations).find(([key]) =>
        integration.id === key || integration.urlHost.includes(key)
    );

    if (knownIntegration) {
        const [_, config] = knownIntegration;
        return config.oauth?.tokenUrl || `${integration.urlHost}/oauth/token`;
    }

    // Custom token URL or default
    return integration.credentials?.token_url || `${integration.urlHost}/oauth/token`;
}

function validateOAuthState(state: string | null, expectedIntegrationId: string): OAuthState {
    if (!state) {
        throw new Error('Missing OAuth state parameter. Please try the authorization flow again.');
    }

    try {
        const stateData = JSON.parse(atob(state)) as OAuthState;

        if (!stateData.apiKey || !stateData.timestamp || !stateData.integrationId) {
            throw new Error('Invalid OAuth state structure');
        }

        if (Date.now() - stateData.timestamp >= OAUTH_STATE_EXPIRY_MS) {
            throw new Error('OAuth state expired. Please try again.');
        }

        if (stateData.integrationId !== expectedIntegrationId) {
            throw new Error('Integration ID mismatch. Possible CSRF attempt.');
        }

        return stateData;
    } catch (error) {
        if (error instanceof Error && error.message.includes('OAuth')) {
            throw error;
        }
        throw new Error('Invalid OAuth state format. Please try the authorization flow again.');
    }
}

async function exchangeCodeForToken(
    code: string,
    integration: any,
    redirectUri: string,
    state?: string
): Promise<OAuthTokenResponse> {
    const { client_id, client_secret } = integration.credentials || {};

    if (!client_id || !client_secret) {
        throw new Error('OAuth client credentials not configured');
    }

    const tokenUrl = getTokenUrl(integration);
    const response = await fetch(tokenUrl, {
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
            ...(state ? { state } : {}),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${errorText}`);
    }

    return response.json();
}

function buildRedirectUrl(origin: string, path: string, params: Record<string, string>): string {
    const url = new URL(path, origin);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    return url.toString();
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

    // Extract OAuth parameters
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth provider errors
    if (error) {
        const errorMsg = errorDescription || error;
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Error</title>
            </head>
            <body>
                <div style="text-align: center; padding: 50px; font-family: system-ui;">
                    <h2 style="color: #dc2626;">OAuth Authorization Failed</h2>
                    <p>${errorMsg}</p>
                    <p style="margin-top: 20px;">You can close this window and try again.</p>
                </div>
                <script>
                    setTimeout(() => {
                        if (window.opener) {
                            window.close();
                        } else {
                            window.location.href = '${origin}/integrations?error=oauth_failed&description=' + encodeURIComponent('${errorMsg}');
                        }
                    }, 3000);
                </script>
            </body>
            </html>
        `;

        return new Response(html, {
            headers: { 'Content-Type': 'text/html' },
        });
    }

    if (!code || !state) {
        return NextResponse.redirect(
            buildRedirectUrl(origin, '/integrations', {
                error: !code ? 'no_code' : 'no_state'
            })
        );
    }

    try {
        // Extract integration ID from state
        const stateData = JSON.parse(atob(state)) as OAuthState;
        const { integrationId, apiKey, timestamp } = stateData;

        // Validate state timestamp
        if (Date.now() - timestamp >= OAUTH_STATE_EXPIRY_MS) {
            throw new Error('OAuth state expired. Please try again.');
        }

        // Initialize client
        const client = new SuperglueClient({
            endpoint: process.env.GRAPHQL_ENDPOINT || `http://localhost:${process.env.GRAPHQL_PORT}`,
            apiKey,
        });

        // Fetch integration
        const integration = await client.getIntegration(integrationId);
        if (!integration) {
            throw new Error('Integration not found');
        }

        // Exchange code for tokens
        const redirectUri = stateData.redirectUri || `${origin}/api/auth/callback`;
        const tokenData = await exchangeCodeForToken(code, integration, redirectUri, state);

        // Update integration with new tokens
        const updatedCredentials = {
            ...integration.credentials,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || integration.credentials.refresh_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_at: tokenData.expires_at || (tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined),
        };

        await client.upsertIntegration(
            integrationId,
            {
                credentials: updatedCredentials,
            },
            UpsertMode.UPDATE
        );

        // Check if this is a popup window (opened by window.open)
        // If so, close it. Otherwise redirect normally.
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Success</title>
            </head>
            <body>
                <div style="text-align: center; padding: 50px; font-family: system-ui;">
                    <h2>OAuth Connection Successful!</h2>
                    <p>You can close this window now.</p>
                </div>
                <script>
                    // Try to close the window if it's a popup
                    if (window.opener) {
                        try {
                            window.opener.postMessage({ type: 'oauth-success', integrationId: '${integrationId}' }, '${origin}');
                        } catch (e) {
                            console.error('Failed to notify parent window:', e);
                        }
                        setTimeout(() => window.close(), 100);
                    } else {
                        window.location.href = '${origin}/integrations?success=oauth_completed&integration=${integrationId}';
                    }
                </script>
            </body>
            </html>
        `;

        return new Response(html, {
            headers: { 'Content-Type': 'text/html' },
        });
    } catch (error) {
        console.error('OAuth callback error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Handle popup window case for errors too
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Error</title>
            </head>
            <body>
                <div style="text-align: center; padding: 50px; font-family: system-ui;">
                    <h2 style="color: #dc2626;">OAuth Connection Failed</h2>
                    <p>${errorMessage}</p>
                    <p style="margin-top: 20px;">You can close this window and try again.</p>
                </div>
                <script>
                    if (window.opener) {
                        try {
                            window.opener.postMessage({ 
                                type: 'oauth-error', 
                                message: '${errorMessage.replace(/'/g, "\\'")}'
                            }, '${origin}');
                        } catch (e) {
                            console.error('Failed to notify parent window:', e);
                        }
                    }
                    setTimeout(() => {
                        if (window.opener) {
                            window.close();
                        } else {
                            window.location.href = '${origin}/integrations?error=oauth_error&message=' + encodeURIComponent('${errorMessage}');
                        }
                    }, 3000);
                </script>
            </body>
            </html>
        `;

        return new Response(html, {
            headers: { 'Content-Type': 'text/html' },
        });
    }
}