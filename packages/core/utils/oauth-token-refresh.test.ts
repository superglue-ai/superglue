import type { Integration } from '@superglue/shared';
import { getOAuthTokenUrl } from '@superglue/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logs from './logs.js';
import {
    isTokenExpired,
    refreshOAuthToken,
} from './oauth-token-refresh.js';

vi.mock('./logs.js', () => ({
    logMessage: vi.fn(),
}));

vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
    }
}));

import axios from 'axios';

describe('OAuth Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    describe('isTokenExpired', () => {
        it('should return false if no expires_at is set', () => {
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {},
            };
            expect(isTokenExpired(integration)).toBe(false);
        });

        it('should return false if token expires in more than 5 minutes', () => {
            const now = Date.now();
            const sixMinutesFromNow = new Date(now + 6 * 60 * 1000).toISOString();
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {
                    expires_at: sixMinutesFromNow,
                },
            };
            expect(isTokenExpired(integration)).toBe(false);
        });

        it('should return true if token expires in less than 5 minutes', () => {
            const now = Date.now();
            const fourMinutesFromNow = new Date(now + 4 * 60 * 1000).toISOString();
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {
                    expires_at: fourMinutesFromNow,
                },
            };
            expect(isTokenExpired(integration)).toBe(true);
        });

        it('should return true if token is already expired', () => {
            const now = Date.now();
            const oneMinuteAgo = new Date(now - 60 * 1000).toISOString();
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {
                    expires_at: oneMinuteAgo,
                },
            };
            expect(isTokenExpired(integration)).toBe(true);
        });
    });

    describe('getTokenUrl', () => {
        it('should return token URL for known integration by ID', () => {
            const integration: Integration = {
                id: 'github',
                urlHost: 'https://api.github.com',
                credentials: {},
            };
            expect(getOAuthTokenUrl(integration)).toBe('https://github.com/login/oauth/access_token');
        });

        it('should return token URL for known integration by URL host', () => {
            const integration: Integration = {
                id: 'my-github',
                urlHost: 'https://api.github.com',
                credentials: {},
            };
            expect(getOAuthTokenUrl(integration)).toBe('https://github.com/login/oauth/access_token');
        });

        it('should return custom token URL from credentials', () => {
            const integration: Integration = {
                id: 'custom',
                urlHost: 'https://api.custom.com',
                credentials: {
                    token_url: 'https://custom.com/oauth/token',
                },
            };
            expect(getOAuthTokenUrl(integration)).toBe('https://custom.com/oauth/token');
        });

        it('should return default token URL for unknown integration', () => {
            const integration: Integration = {
                id: 'unknown',
                urlHost: 'https://api.unknown.com',
                credentials: {},
            };
            expect(getOAuthTokenUrl(integration)).toBe('https://api.unknown.com/oauth/token');
        });
    });

    describe('refreshOAuthToken', () => {
        it('should return false if missing required credentials', async () => {
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {
                    client_id: 'test-id',
                    grant_type: 'authorization_code',
                },
            };

            const result = await refreshOAuthToken(integration, { orgId: 'test-org', traceId: 'test-trace-id' });
            expect(result.success).toBe(false);
            expect(logs.logMessage).toHaveBeenCalledWith(
                'error',
                'Missing required credentials for authorization_code token refresh',
                expect.objectContaining({
                    integrationId: 'test',
                    hasClientSecret: false,
                    hasRefreshToken: false
                })
            );
        });

        it('should successfully refresh token', async () => {
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {
                    client_id: 'test-id',
                    client_secret: 'test-secret',
                    refresh_token: 'old-refresh-token',
                    grant_type: 'authorization_code',
                },
            };

            const mockTokenResponse = {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                token_type: 'Bearer',
                expires_in: 3600,
            };

            (axios.post as any).mockResolvedValueOnce({
                status: 200,
                data: mockTokenResponse,
            });

            const result = await refreshOAuthToken(integration, { orgId: 'test-org', traceId: 'test-trace-id' });
            
            expect(result.success).toBe(true);
            expect(integration.credentials.access_token).toBe('new-access-token');
            expect(integration.credentials.refresh_token).toBe('new-refresh-token');
            expect(integration.credentials.token_type).toBe('Bearer');
            expect(integration.credentials.expires_at).toBeDefined();
        });

        it('should handle token refresh failure', async () => {
            const integration: Integration = {
                id: 'test',
                urlHost: 'https://api.test.com',
                credentials: {
                    client_id: 'test-id',
                    client_secret: 'test-secret',
                    refresh_token: 'old-refresh-token',
                    grant_type: 'authorization_code',
                },
            };

            (axios.post as any).mockResolvedValueOnce({
                status: 401,
                data: 'Unauthorized',
            });

            const result = await refreshOAuthToken(integration, { orgId: 'test-org', traceId: 'test-trace-id' });
            
            expect(result.success).toBe(false);
            expect(logs.logMessage).toHaveBeenCalledWith(
                'error',
                'Error refreshing OAuth token',
                expect.objectContaining({
                    integrationId: 'test',
                    error: expect.stringContaining('Token refresh failed'),
                })
            );
        });
    });
}); 