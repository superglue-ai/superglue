import { getOAuthConfig } from '@superglue/shared';

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
    apiKey?: string
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
    if (!popup) return () => {};

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
    forceOAuth?: boolean
): (() => void) | null => {
    const grantType = oauthFields.grant_type || 'authorization_code';
    
    // For client credentials, the backend handles the OAuth flow automatically
    // when the integration is saved, so we don't need to do anything here
    if (grantType === 'client_credentials') {
        return null;
    }
    
    // For authorization code flow, check if we should trigger OAuth
    const shouldTriggerOAuth = authType === 'oauth' && (
        // Trigger if OAuth is not configured yet
        (!oauthFields.access_token || !oauthFields.refresh_token) ||
        // OR if OAuth is forced (e.g., when fields changed)
        forceOAuth
    );

    if (shouldTriggerOAuth) {
        // Authorization code flow - open popup
        const authUrl = buildOAuthUrlForIntegration(
            integrationId,
            oauthFields,
            selectedIntegration,
            apiKey
        );
        
        if (authUrl) {
            const popup = openOAuthPopup(authUrl);
            
            if (popup && onError) {
                // Monitor popup for user cancellation
                return monitorOAuthPopup(popup, () => {
                    onError('OAuth flow was cancelled or failed. Please check your OAuth configuration and try again.');
                });
            }
        } else if (onError) {
            onError('Failed to build OAuth URL. Please check your OAuth configuration (client_id, auth_url, etc.).');
        }
    }
    
    return null;
};

/**
 * Create a comprehensive OAuth error handler that shows user-friendly toast messages
 */
export const createOAuthErrorHandler = (
    integrationId: string,
    toast: (props: { title: string; description: string; variant?: 'default' | 'destructive' }) => any
) => {
    return (error: string) => {
        const errorInfo = parseOAuthError(error, integrationId);
        
        // Combine error message and action into a single toast
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

/**
 * Parse OAuth error and return user-friendly message with actionable advice
 */
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
    
    // Generic error fallback
    return {
        title: 'OAuth Connection Failed',
        description: `Failed to complete OAuth connection for ${integrationId}. ${error}`,
        action: 'Please check your OAuth configuration and try again.'
    };
};


