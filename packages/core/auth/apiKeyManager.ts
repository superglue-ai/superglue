
export interface ApiKeyManager {
    getApiKeys(): Promise<{ orgId: string; key: string }[]>;
    authenticate(apiKey: string): Promise<{ orgId: string; success: boolean }>;
    cleanup(): void;
}