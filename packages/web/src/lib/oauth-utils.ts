import { SuperglueClient } from '@superglue/client';

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

    async cacheOauthClientCredentials(args: { clientCredentialsUid: string; clientId: string; clientSecret: string }): Promise<boolean> {
        const data = await this.graphQL<{ cacheOauthClientCredentials: boolean }>(`
            mutation CacheOauthClientCredentials($clientCredentialsUid: String!, $clientId: String!, $clientSecret: String!) {
                cacheOauthClientCredentials(clientCredentialsUid: $clientCredentialsUid, clientId: $clientId, clientSecret: $clientSecret)
            }
        `, args);
        return Boolean(data?.cacheOauthClientCredentials);
    }

    async getOAuthClientCredentials(args: { templateId?: string; clientCredentialsUid?: string }): Promise<{ client_id: string; client_secret: string }> {
        const data = await this.graphQL<{ getOAuthClientCredentials: { client_id: string; client_secret: string } }>(`
            mutation GetOAuthClientCredentials($templateId: ID, $clientCredentialsUid: String) {
                getOAuthClientCredentials(templateId: $templateId, clientCredentialsUid: $clientCredentialsUid) {
                    client_id
                    client_secret
                }
            }
        `, args);
        return data.getOAuthClientCredentials;
    }
}

type OAuthFields = {
    client_id: string;
    client_secret?: string;
    auth_url?: string;
    token_url: string;
    scopes?: string;
    access_token?: string;
    refresh_token?: string;
    grant_type: 'authorization_code' | 'client_credentials';
};

export type OAuthState = {
    integrationId: string;
    timestamp: number;
    apiKey: string;
    redirectUri: string;
    token_url: string;
    templateId?: string;
    clientId?: string;
    client_credentials_uid?: string;
    suppressErrorUI?: boolean;
};

type OAuthCallbacks = {
    onSuccess?: (tokens: any) => void;
    onError?: (error: string) => void;
};

export const getOAuthCallbackUrl = (): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/api/auth/callback`;
};


const buildOAuthState = (params: {
    integrationId: string;
    apiKey: string;
    tokenUrl: string;
    templateId?: string;
    clientId?: string;
    clientCredentialsUid?: string;
    suppressErrorUI?: boolean;
}): OAuthState => {
    return {
        integrationId: params.integrationId,
        timestamp: Date.now(),
        apiKey: params.apiKey,
        redirectUri: getOAuthCallbackUrl(),
        token_url: params.tokenUrl,
        ...(params.templateId && { templateId: params.templateId }),
        ...(params.clientId && { clientId: params.clientId }),
        ...(params.clientCredentialsUid && { client_credentials_uid: params.clientCredentialsUid }),
        ...(params.suppressErrorUI && { suppressErrorUI: params.suppressErrorUI }),
    };
};

const buildAuthorizationUrl = (params: {
    authUrl: string;
    clientId: string;
    scopes: string;
    state: OAuthState;
}): string => {
    const urlParams = new URLSearchParams({
        client_id: params.clientId,
        redirect_uri: getOAuthCallbackUrl(),
        response_type: 'code',
        state: btoa(JSON.stringify(params.state)),
        scope: params.scopes,
    });

    if (params.authUrl.includes('google.com')) {
        urlParams.append('access_type', 'offline');
        urlParams.append('prompt', 'consent');
    }

    return `${params.authUrl}?${urlParams.toString()}`;
};

const openOAuthPopup = (url: string): Window | null => {
    const width = 600;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    return window.open(
        url,
        'oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
};


const executeClientCredentialsFlow = async (params: {
    state: OAuthState;
    cachePromise: Promise<any> | null;
    callbacks: OAuthCallbacks;
}) => {
    const { state, cachePromise, callbacks } = params;
    const { onSuccess, onError } = callbacks;

    const callbackUrl = `${window.location.origin}/api/auth/callback?grant_type=client_credentials&state=${encodeURIComponent(btoa(JSON.stringify(state)))}`;

    const makeRequest = async () => {
        try {
            const response = await fetch(callbackUrl);

            if (response.ok) {
                const data = await response.json();
                if (data.tokens) {
                    onSuccess?.(data.tokens);
                } else {
                    onError?.('[OAUTH_STAGE:CLIENT_CREDENTIALS] Callback succeeded but no tokens were returned. This is likely a backend issue.');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.message || 'OAuth authentication failed for client credentials flow';
                onError?.(errorMsg);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            onError?.(`[OAUTH_STAGE:CLIENT_CREDENTIALS] Network error during client credentials flow: ${errMsg}`);
        }
    };

    if (cachePromise) {
        try {
            await cachePromise;
            await makeRequest();
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            onError?.(`[OAUTH_STAGE:CREDENTIAL_CACHING] Failed to cache OAuth client credentials on backend: ${errMsg}. Please retry.`);
        }
    } else {
        await makeRequest();
    }
};

const executeAuthorizationCodeFlow = (params: {
    integrationId: string;
    oauthFields: OAuthFields;
    state: OAuthState;
    callbacks: OAuthCallbacks;
}): (() => void) | null => {
    const { integrationId, oauthFields, state, callbacks } = params;
    const { onSuccess, onError } = callbacks;

    if (!oauthFields.auth_url) {
        onError?.('[OAUTH_STAGE:INITIALIZATION] Missing OAuth authorization URL (auth_url). Please configure the auth_url field in your integration credentials.');
        return null;
    }

    const authUrl = buildAuthorizationUrl({
        authUrl: oauthFields.auth_url,
        clientId: oauthFields.client_id,
        scopes: oauthFields.scopes || '',
        state,
    });

    const popup = openOAuthPopup(authUrl);
    if (!popup) {
        onError?.('[OAUTH_STAGE:POPUP] Failed to open OAuth popup window. Please check if popups are blocked by your browser.');
        return null;
    }

    // Track if OAuth flow completed (success or error) to prevent "cancelled" error
    let isCompleted = false;

    // Monitor popup for closure
    const intervalId = setInterval(() => {
        if (popup.closed) {
            clearInterval(intervalId);
            window.removeEventListener('message', handleMessage);
            if (!isCompleted) {
                onError?.('[OAUTH_STAGE:USER_CANCELLED] OAuth flow was cancelled - the popup window was closed before completing authentication.');
            }
        }
    }, 1000);

    // Handle messages from popup
    const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'oauth-success' && event.data?.integrationId === integrationId) {
            isCompleted = true;
            clearInterval(intervalId);
            window.removeEventListener('message', handleMessage);
            onSuccess?.(event.data.tokens);
        } else if (event.data?.type === 'oauth-error' && event.data?.integrationId === integrationId) {
            isCompleted = true;
            clearInterval(intervalId);
            window.removeEventListener('message', handleMessage);
            onError?.(event.data.message || '[OAUTH_STAGE:UNKNOWN] OAuth authentication failed with no error details');
        }
    };

    window.addEventListener('message', handleMessage);

    // Return cleanup function
    return () => {
        clearInterval(intervalId);
        window.removeEventListener('message', handleMessage);
    };
};

export const triggerOAuthFlow = (
    integrationId: string,
    oauthFields: {
        access_token?: string;
        refresh_token?: string;
        client_id?: string;
        scopes?: string;
        auth_url?: string;
        token_url?: string;
        grant_type?: string;
        client_secret?: string;
    },
    selectedIntegration?: string,
    apiKey?: string,
    authType?: string,
    onError?: (error: string) => void,
    forceOAuth?: boolean,
    templateInfo?: { templateId?: string; clientId?: string },
    onSuccess?: (tokens: any) => void,
    endpoint?: string,
    suppressErrorUI?: boolean
): (() => void) | null => {
    if (authType !== 'oauth') return null;

    const grantType = oauthFields.grant_type || 'authorization_code';
    const shouldTrigger = forceOAuth ||
        (grantType === 'authorization_code' && (!oauthFields.access_token || !oauthFields.refresh_token));

    if (!shouldTrigger) return null;

    const callbacks: OAuthCallbacks = { onSuccess, onError };
    const usingTemplate = Boolean(templateInfo?.templateId || templateInfo?.clientId);
    let cachePromise: Promise<any> | null = null;
    let clientCredentialsUid: string | undefined;

    if (!usingTemplate && oauthFields.client_secret && oauthFields.client_id && apiKey && endpoint) {
        clientCredentialsUid = crypto.randomUUID();
        const client = new ExtendedSuperglueClient({ endpoint, apiKey });
        cachePromise = client.cacheOauthClientCredentials({
            clientCredentialsUid,
            clientId: oauthFields.client_id,
            clientSecret: oauthFields.client_secret
        });
    }

    const state = buildOAuthState({
        integrationId,
        apiKey: apiKey!,
        tokenUrl: oauthFields.token_url!,
        templateId: templateInfo?.templateId,
        clientId: templateInfo?.clientId || oauthFields.client_id,
        clientCredentialsUid,
        suppressErrorUI,
    });

    if (grantType === 'client_credentials') {
        executeClientCredentialsFlow({ state, cachePromise, callbacks });
        return null;
    }

    return executeAuthorizationCodeFlow({
        integrationId,
        oauthFields: oauthFields as OAuthFields,
        state,
        callbacks,
    });
};

export const createOAuthErrorHandler = (
    integrationId: string,
    toast: (props: { title: string; description: string; variant?: 'default' | 'destructive' }) => any
) => {
    return (error: string) => {
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

    // Extract stage information if present
    const stageMatch = error.match(/\[OAUTH_STAGE:([A-Z_]+)\]/);
    const stage = stageMatch ? stageMatch[1] : null;
    const stageDisplay = stage ? ` (Stage: ${stage})` : '';

    // Handle JSON parse errors specifically
    if (errorLower.includes('invalid json') || errorLower.includes('json response')) {
        return {
            title: `OAuth Token Exchange Error${stageDisplay}`,
            description: error,
            action: 'Check that the token_url is correct and points to a valid OAuth token endpoint. The endpoint should return a JSON response with an access_token field.'
        };
    }

    // Handle token exchange failures
    if (errorLower.includes('token exchange') || errorLower.includes('token_exchange')) {
        return {
            title: `OAuth Token Exchange Failed${stageDisplay}`,
            description: error,
            action: 'Verify that your OAuth credentials (client_id, client_secret) are correct and that the token_url is properly configured.'
        };
    }

    // Handle credential resolution failures
    if (errorLower.includes('credential_resolution') || errorLower.includes('credentials could not be resolved')) {
        return {
            title: `OAuth Credential Resolution Error${stageDisplay}`,
            description: error,
            action: 'The OAuth credentials could not be retrieved from the backend. Try re-entering your client_id and client_secret.'
        };
    }

    // Handle invalid client errors
    if (errorLower.includes('invalid_client') || errorLower.includes('unauthorized_client')) {
        return {
            title: `Invalid OAuth Client Configuration${stageDisplay}`,
            description: error,
            action: 'Check your OAuth app settings and ensure the client_id and client_secret are correct.'
        };
    }

    if (errorLower.includes('invalid_request') || errorLower.includes('malformed')) {
        return {
            title: `Invalid OAuth Request${stageDisplay}`,
            description: error,
            action: 'The OAuth request is malformed. Check your OAuth configuration (auth_url, token_url, scopes) and try again.'
        };
    }

    if (errorLower.includes('access_denied') || errorLower.includes('user_denied')) {
        return {
            title: `OAuth Authorization Denied${stageDisplay}`,
            description: 'You denied access to the OAuth application during the authorization step.',
            action: 'Please try again and grant the necessary permissions when prompted.'
        };
    }

    if (errorLower.includes('invalid_scope')) {
        return {
            title: `Invalid OAuth Scope${stageDisplay}`,
            description: error,
            action: 'Please check the OAuth scopes configured for this integration. The requested scope may not be supported by the provider.'
        };
    }

    if (errorLower.includes('server_error') || errorLower.includes('temporarily_unavailable')) {
        return {
            title: `OAuth Provider Error${stageDisplay}`,
            description: 'The OAuth provider is experiencing issues or is temporarily unavailable.',
            action: 'Please wait a few minutes and try again. If the issue persists, check the OAuth provider\'s status.'
        };
    }

    if (errorLower.includes('redirect_uri_mismatch')) {
        return {
            title: `Redirect URI Mismatch${stageDisplay}`,
            description: error,
            action: `Add this URL to your OAuth app's allowed redirect URIs: ${getOAuthCallbackUrl()}`
        };
    }

    if (errorLower.includes('popup') || errorLower.includes('blocked')) {
        return {
            title: `OAuth Popup Blocked${stageDisplay}`,
            description: error,
            action: 'Please allow popups for this site in your browser settings and try again.'
        };
    }

    if (errorLower.includes('cancelled') || errorLower.includes('closed') || errorLower.includes('user_cancelled')) {
        return {
            title: `OAuth Flow Cancelled${stageDisplay}`,
            description: 'The OAuth flow was cancelled or the popup window was closed before authentication completed.',
            action: 'Please try again and complete the OAuth authorization process without closing the popup.'
        };
    }

    if (errorLower.includes('expired')) {
        return {
            title: `OAuth Session Expired${stageDisplay}`,
            description: error,
            action: 'The OAuth session expired. Please start the OAuth flow again.'
        };
    }

    // Default case - include full error message
    return {
        title: `OAuth Connection Failed${stageDisplay}`,
        description: error,
        action: 'Please check your OAuth configuration (auth_url, token_url, client_id, client_secret, scopes) and try again.'
    };
};