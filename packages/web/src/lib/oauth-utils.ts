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

type OAuthState = {
    integrationId: string;
    timestamp: number;
    apiKey: string;
    redirectUri: string;
    token_url: string;
    templateId?: string;
    clientId?: string;
    client_secret_uid?: string;
};

type OAuthCallbacks = {
    onSuccess?: (tokens: any) => void;
    onError?: (error: string) => void;
};

const getOAuthCallbackUrl = (): string => {
    return `${window.location.origin}/api/auth/callback`;
};


const buildOAuthState = (params: {
    integrationId: string;
    apiKey: string;
    tokenUrl: string;
    templateId?: string;
    clientId?: string;
    clientSecretUid?: string;
}): OAuthState => {
    return {
        integrationId: params.integrationId,
        timestamp: Date.now(),
        apiKey: params.apiKey,
        redirectUri: getOAuthCallbackUrl(),
        token_url: params.tokenUrl,
        ...(params.templateId && { templateId: params.templateId }),
        ...(params.clientId && { clientId: params.clientId }),
        ...(params.clientSecretUid && { client_secret_uid: params.clientSecretUid }),
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

const monitorOAuthPopup = (popup: Window, onCancelled: () => void): (() => void) => {
    let isCompleted = false;

    const intervalId = setInterval(() => {
        if (popup.closed) {
            clearInterval(intervalId);
            if (!isCompleted) {
                onCancelled();
            }
        }
    }, 1000);

    const handleMessage = (event: MessageEvent) => {
        if (event.origin === window.location.origin && event.data.type === 'oauth-success') {
            isCompleted = true;
            clearInterval(intervalId);
            window.removeEventListener('message', handleMessage);
        }
    };

    window.addEventListener('message', handleMessage);

    return () => {
        clearInterval(intervalId);
        window.removeEventListener('message', handleMessage);
    };
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
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                onError?.(errorData.message || 'OAuth authentication failed');
            }
        } catch (error) {
            onError?.('Failed to complete client credentials OAuth flow');
        }
    };

    if (cachePromise) {
        try {
            await cachePromise;
            await makeRequest();
        } catch (error) {
            onError?.('Could not stage OAuth client secret. Please retry.');
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
        onError?.('Missing OAuth authorization URL');
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
        onError?.('Failed to open OAuth popup window');
        return null;
    }

    const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'oauth-success' && event.data?.integrationId === integrationId) {
            window.removeEventListener('message', handleMessage);
            onSuccess?.(event.data.tokens);
        } else if (event.data?.type === 'oauth-error' && event.data?.integrationId === integrationId) {
            window.removeEventListener('message', handleMessage);
            onError?.(event.data.message || 'OAuth authentication failed');
        }
    };

    window.addEventListener('message', handleMessage);

    return monitorOAuthPopup(popup, () => {
        window.removeEventListener('message', handleMessage);
        onError?.('OAuth flow was cancelled or the popup was closed.');
    });
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
    endpoint?: string
): (() => void) | null => {
    if (authType !== 'oauth') return null;

    const grantType = oauthFields.grant_type || 'authorization_code';
    const shouldTrigger = forceOAuth ||
        (grantType === 'authorization_code' && (!oauthFields.access_token || !oauthFields.refresh_token));

    if (!shouldTrigger) return null;

    const callbacks: OAuthCallbacks = { onSuccess, onError };
    const usingTemplate = Boolean(templateInfo?.templateId || templateInfo?.clientId);
    let cachePromise: Promise<any> | null = null;
    let clientSecretUid: string | undefined;

    if (!usingTemplate && oauthFields.client_secret && oauthFields.client_id && apiKey && endpoint) {
        clientSecretUid = crypto.randomUUID();
        const client = new ExtendedSuperglueClient({ endpoint, apiKey });
        cachePromise = client.cacheOauthClientSecrets({
            clientSecretUid,
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
        clientSecretUid,
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

    if (errorLower.includes('invalid_client') || errorLower.includes('unauthorized_client')) {
        return {
            title: 'Invalid OAuth Client Configuration',
            description: 'Your OAuth client ID or secret is incorrect.',
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
            description: 'You denied access to the OAuth application.',
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
            description: 'The OAuth provider is experiencing issues.',
            action: 'Please wait a few minutes and try again.'
        };
    }

    if (errorLower.includes('redirect_uri_mismatch')) {
        return {
            title: 'Redirect URI Mismatch',
            description: 'The redirect URI in your OAuth app doesn\'t match the expected callback URL.',
            action: `Add this URL to your OAuth app's allowed redirect URIs: ${window.location.origin}/api/auth/callback`
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
            description: 'The OAuth authorization URL could not be found.',
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