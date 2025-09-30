import { SuperglueClient } from '@superglue/client';
import { getOAuthConfig } from '@superglue/shared';

export class ExtendedSuperglueClient extends SuperglueClient {
    private async graphQL<T = any>(query: string, variables?: any): Promise<T> {
        const endpoint = (this as any)['endpoint'] as string;
        const apiKey = (this as any)['apiKey'] as string;
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ query, variables })
        });
        if (!res.ok) throw new Error(`GraphQL ${res.status}`);
        const json = await res.json();
        if (json.errors && json.errors.length) throw new Error(json.errors[0]?.message || 'GraphQL error');
        return json.data as T;
    }

    async cacheOauthClientSecrets(args: { clientSecretUid: string; clientId: string; clientSecret: string }): Promise<boolean> {
        const data = await this.graphQL<{ cacheOauthClientSecrets: boolean }>(`
            mutation CacheOauthClientSecrets($clientSecretUid: String!, $clientId: String!, $clientSecret: String!) {
                cacheOauthClientSecrets(clientSecretUid: $clientSecretUid, clientId: $clientId, clientSecret: $clientSecret)
            }
        `, args);
        return Boolean(data?.cacheOauthClientSecrets);
    }

    async getOAuthClientSecrets(args: { clientId?: string; templateId?: string; clientSecretUid?: string }): Promise<{ client_id: string; client_secret: string }> {
        const data = await this.graphQL<{ getOAuthClientSecrets: { client_id: string; client_secret: string } }>(`
            mutation GetOAuthClientSecrets($clientId: String, $templateId: ID, $clientSecretUid: String) {
                getOAuthClientSecrets(clientId: $clientId, templateId: $templateId, clientSecretUid: $clientSecretUid) {
                    client_id
                    client_secret
                }
            }
        `, args);
        return data.getOAuthClientSecrets;
    }
}

/**
 * Generate OAuth callback URL for the current application
 */
export const getOAuthCallbackUrl = (): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/api/auth/callback`;
};

/**
 * Build OAuth authorization URL for a specific integration
 */
export const buildOAuthUrlForIntegration = (
    integrationId: string,
    oauthFields: {
        client_id?: string;
        scopes?: string;
        auth_url?: string;
    },
    selectedIntegration?: string,
    apiKey?: string,
    templateInfo?: { templateId?: string; clientId?: string },
    stateExtras?: Record<string, any>
): string | null => {
    try {
        const { client_id, scopes } = oauthFields;

        if (!client_id) return null;

        const redirectUri = getOAuthCallbackUrl();

        // Get auth URL from OAuth fields or known providers
        let authUrl = oauthFields.auth_url;
        let defaultScopes = '';

        if (!authUrl) {
            const oauthConfig = getOAuthConfig(integrationId) || getOAuthConfig(selectedIntegration);
            authUrl = oauthConfig?.authUrl;
            defaultScopes = oauthConfig?.scopes || '';
        }

        if (!authUrl) return null;

        const params = new URLSearchParams({
            client_id,
            redirect_uri: redirectUri,
            response_type: 'code',
            state: btoa(JSON.stringify({
                integrationId,
                timestamp: Date.now(),
                apiKey,
                redirectUri,
                ...(templateInfo || {}),
                token_url: (oauthFields as any).token_url,
                ...(stateExtras || {}),
            })),
        });

        // Use explicitly set scopes or fall back to defaults
        const finalScopes = scopes || defaultScopes;
        if (finalScopes) {
            params.append('scope', finalScopes);
        }

        // Add Google-specific parameters if it's a Google service
        if (authUrl.includes('google.com')) {
            params.append('access_type', 'offline');
            params.append('prompt', 'consent');
        }

        return `${authUrl}?${params.toString()}`;
    } catch {
        return null;
    }
};

/**
 * Open OAuth popup window with proper positioning and sizing
 */
export const openOAuthPopup = (authUrl: string): Window | null => {
    const width = 600;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    return window.open(
        authUrl,
        'oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
};

/**
 * Monitor OAuth popup window and handle user cancellation
 */
export const monitorOAuthPopup = (
    popup: Window | null,
    onUserCancelled: () => void,
    checkInterval: number = 1000
): (() => void) => {
    if (!popup) return () => { };

    let isCompleted = false;
    let intervalId: NodeJS.Timeout;

    const cleanup = () => {
        if (intervalId) {
            clearInterval(intervalId);
        }
    };

    // Monitor popup window
    intervalId = setInterval(() => {
        try {
            // Check if popup is closed
            if (popup.closed) {
                cleanup();
                if (!isCompleted) {
                    // Popup was closed without completing OAuth
                    onUserCancelled();
                }
                return;
            }

            // Check if popup navigated to an error page (common OAuth error patterns)
            try {
                const popupUrl = popup.location.href;
                if (popupUrl.includes('error=') ||
                    popupUrl.includes('error_description=') ||
                    popupUrl.includes('access_denied') ||
                    popupUrl.includes('invalid_request') ||
                    popupUrl.includes('unauthorized_client') ||
                    popupUrl.includes('unsupported_response_type') ||
                    popupUrl.includes('invalid_scope') ||
                    popupUrl.includes('server_error') ||
                    popupUrl.includes('temporarily_unavailable')) {
                    cleanup();
                    onUserCancelled();
                }
            } catch (e) {
                // Cross-origin error - popup navigated to OAuth provider
                // This is expected, continue monitoring
            }
        } catch (e) {
            // Popup might be closed or inaccessible
            cleanup();
            if (!isCompleted) {
                onUserCancelled();
            }
        }
    }, checkInterval);

    // Mark as completed when OAuth succeeds
    const markCompleted = () => {
        isCompleted = true;
        cleanup();
    };

    // Listen for OAuth success message
    const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data.type === 'oauth-success') {
            markCompleted();
        }
    };

    window.addEventListener('message', handleMessage);

    // Return cleanup function
    return () => {
        cleanup();
        window.removeEventListener('message', handleMessage);
    };
};

/**
 * Trigger OAuth flow for an integration if not already configured or if forced
 */
export const triggerOAuthFlow = (
    integrationId: string,
    oauthFields: {
        access_token?: string;
        refresh_token?: string;
        client_id?: string;
        scopes?: string;
        auth_url?: string;
        grant_type?: string;
    },
    selectedIntegration?: string,
    apiKey?: string,
    authType?: string,
    onError?: (error: string) => void,
    forceOAuth?: boolean,
    templateInfo?: { templateId?: string; clientId?: string },
    onSuccess?: (tokens: any) => void,
    endpoint?: string
): (() => void) | null => {
    const grantType = oauthFields.grant_type || 'authorization_code';

    // Check if we should trigger OAuth
    const shouldTriggerOAuth = authType === 'oauth' && (
        // For client_credentials, always trigger if forced (user clicked connect button)
        (grantType === 'client_credentials' && forceOAuth) ||
        // For authorization_code, trigger if no tokens or forced
        (grantType === 'authorization_code' && ((!oauthFields.access_token || !oauthFields.refresh_token) || forceOAuth))
    );

    if (shouldTriggerOAuth) {
        const usingTemplateClient = Boolean(templateInfo && (templateInfo.templateId || templateInfo.clientId));
        let stateExtras: Record<string, any> | undefined;

        // If user provided client_secret (any grant), stage it in backend cache and carry UID in state
        let cachePromise: Promise<any> | null = null;

        if (!usingTemplateClient && (oauthFields as any).client_secret && oauthFields.client_id && apiKey) {
            const client_secret_uid = generateNonce();
            stateExtras = { client_secret_uid };

            // Use the passed endpoint, or fallback to window.location.origin/api
            const clientEndpoint = endpoint || (typeof window !== 'undefined' ? `${window.location.origin}/api` : '');

            if (!clientEndpoint) {
                if (onError) onError('Could not determine API endpoint');
                return null;
            }

            const client = new ExtendedSuperglueClient({ endpoint: clientEndpoint, apiKey });

            cachePromise = client.cacheOauthClientSecrets({
                clientSecretUid: client_secret_uid,
                clientId: String(oauthFields.client_id),
                clientSecret: String((oauthFields as any).client_secret)
            });
        }

        if (grantType === 'client_credentials') {
            const origin = window.location.origin;
            const statePayload = btoa(JSON.stringify({
                integrationId,
                timestamp: Date.now(),
                apiKey,
                redirectUri: `${origin}/api/auth/callback`,
                ...(templateInfo || {}),
                token_url: (oauthFields as any).token_url,
                ...(stateExtras || {}),
            }));

            // If we're caching secrets, wait for that to complete before making the callback
            const makeCallbackRequest = () => {
                return fetch(`${origin}/api/auth/callback?grant_type=client_credentials&state=${encodeURIComponent(statePayload)}`)
                    .then(async (response) => {
                        if (response.ok) {
                            const data = await response.json();
                            if (onSuccess && data.tokens) {
                                onSuccess(data.tokens);
                            }
                        } else {
                            // Try to parse error response
                            try {
                                const errorData = await response.json();
                                if (errorData.message && onError) {
                                    onError(errorData.message);
                                }
                            } catch {
                                if (onError) onError('OAuth authentication failed');
                            }
                        }
                    })
                    .catch((error) => {
                        if (onError) onError('Failed to complete client credentials OAuth flow');
                    });
            };

            if (cachePromise) {
                cachePromise
                    .then(() => makeCallbackRequest())
                    .catch((error) => {
                        if (onError) onError('Could not stage OAuth client secret. Please retry.');
                    });
            } else {
                // No caching needed (using template credentials), proceed directly
                makeCallbackRequest();
            }

            return null;
        }

        // Authorization code flow - open provider consent screen
        const authUrl = buildOAuthUrlForIntegration(
            integrationId,
            oauthFields,
            selectedIntegration,
            apiKey,
            templateInfo,
            stateExtras
        );

        if (authUrl) {
            const popup = openOAuthPopup(authUrl);
            if (popup) {
                const handleMessage = (event: MessageEvent) => {
                    if (event.origin !== window.location.origin) return;
                    if (event.data?.type === 'oauth-success' && event.data?.integrationId === integrationId) {
                        window.removeEventListener('message', handleMessage);
                        if (onSuccess && event.data.tokens) {
                            onSuccess(event.data.tokens);
                        }
                    } else if (event.data?.type === 'oauth-error' && event.data?.integrationId === integrationId) {
                        window.removeEventListener('message', handleMessage);
                        if (onError) {
                            onError(event.data.message || 'OAuth authentication failed');
                        }
                    }
                };

                window.addEventListener('message', handleMessage);

                return monitorOAuthPopup(popup, () => {
                    window.removeEventListener('message', handleMessage);
                    if (onError) {
                        onError('OAuth flow was cancelled or the popup was closed.');
                    }
                });
            }
        } else if (onError) {
            onError('Failed to build OAuth URL. Please check your OAuth configuration (client_id, auth_url, etc.).');
        }
    }

    return null;
};

export const createOAuthErrorHandler = (
    integrationId: string,
    toast: (props: { title: string; description: string; variant?: 'default' | 'destructive' }) => any
) => {
    return (error: string) => {
        console.error('oauth error', integrationId, error);
        const errorInfo = parseOAuthError(error, integrationId);

        const fullDescription = errorInfo.action
            ? `${errorInfo.description}\n\nWhat to do next: ${errorInfo.action}`
            : errorInfo.description;

        toast({
            title: errorInfo.title,
            description: fullDescription,
            variant: 'destructive',
        });
    };
};


export const parseOAuthError = (error: string, integrationId: string): { title: string; description: string; action?: string } => {
    const errorLower = error.toLowerCase();

    // Common OAuth error patterns
    if (errorLower.includes('invalid_client') || errorLower.includes('unauthorized_client')) {
        return {
            title: 'Invalid OAuth Client Configuration',
            description: 'Your OAuth client ID or secret is incorrect. Please verify your OAuth app credentials.',
            action: 'Check your OAuth app settings and ensure the client ID and secret are correct.'
        };
    }

    if (errorLower.includes('invalid_request') || errorLower.includes('malformed')) {
        return {
            title: 'Invalid OAuth Request',
            description: 'The OAuth request is malformed or missing required parameters.',
            action: 'Please check your OAuth configuration and try again.'
        };
    }

    if (errorLower.includes('access_denied') || errorLower.includes('user_denied')) {
        return {
            title: 'OAuth Authorization Denied',
            description: 'You denied access to the OAuth application. This is required to connect your account.',
            action: 'Please try again and grant the necessary permissions when prompted.'
        };
    }

    if (errorLower.includes('invalid_scope')) {
        return {
            title: 'Invalid OAuth Scope',
            description: 'The requested OAuth scope is invalid or not supported.',
            action: 'Please check the OAuth scopes configured for this integration.'
        };
    }

    if (errorLower.includes('server_error') || errorLower.includes('temporarily_unavailable')) {
        return {
            title: 'OAuth Provider Error',
            description: 'The OAuth provider is experiencing issues. This is usually temporary.',
            action: 'Please wait a few minutes and try again.'
        };
    }

    if (errorLower.includes('redirect_uri_mismatch')) {
        return {
            title: 'Redirect URI Mismatch',
            description: 'The redirect URI in your OAuth app doesn\'t match the expected callback URL.',
            action: `Add this URL to your OAuth app's allowed redirect URIs: ${getOAuthCallbackUrl()}`
        };
    }

    if (errorLower.includes('client_id') || errorLower.includes('client secret')) {
        return {
            title: 'OAuth Credentials Issue',
            description: 'There\'s an issue with your OAuth client credentials.',
            action: 'Please verify your OAuth app\'s client ID and secret are correct.'
        };
    }

    if (errorLower.includes('not found') || errorLower.includes('404')) {
        return {
            title: 'OAuth Configuration Error',
            description: 'The OAuth authorization URL could not be found. This usually means incorrect OAuth app configuration.',
            action: 'Please check your OAuth app settings and ensure the authorization URL is correct.'
        };
    }

    if (errorLower.includes('cancelled') || errorLower.includes('closed')) {
        return {
            title: 'OAuth Flow Cancelled',
            description: 'The OAuth flow was cancelled or the popup window was closed.',
            action: 'Please try again and complete the OAuth authorization process.'
        };
    }

    return {
        title: 'OAuth Connection Failed',
        description: `Failed to complete OAuth connection for ${integrationId}. ${error}`,
        action: 'Please check your OAuth configuration and try again.'
    };
};

const generateNonce = (): string => {
    const bytes = new Uint8Array(16);
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};



