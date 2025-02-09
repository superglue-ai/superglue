import { ApiKeyManager } from "./apiKeyManager.js";

export class SupabaseKeyManager implements ApiKeyManager {
  private cachedApiKeys: { key: string; orgId: string }[] = [];
  private lastFetchTime = 0;
  private readonly API_KEY_CACHE_TTL = 60000; // 1 minute cache
  private refreshInterval: NodeJS.Timeout;

  constructor() {
    this.refreshApiKeys();
    this.refreshInterval = setInterval(
      () => this.refreshApiKeys(),
      this.API_KEY_CACHE_TTL
    );
  }

  public async getApiKeys(): Promise<{ orgId: string; key: string }[]> {
    return this.cachedApiKeys;
  }

  public async authenticate(apiKey: string): Promise<{ orgId: string; success: boolean }> {
    let keys = await this.getApiKeys();
    let key = keys.find(k => k.key === apiKey);
    if (!key) {
      await this.refreshApiKeys();
      keys = await this.getApiKeys();
      key = keys.find(k => k.key === apiKey);
    }
    return { orgId: key?.orgId || '', success: !!key };
  }

  private async fetchApiKeys(): Promise<{ orgId: string; key: string }[]> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.PRIV_SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing required Supabase environment variables');
      throw new Error('Missing required Supabase environment variables');
    }

    const url = `${SUPABASE_URL}/rest/v1/sg_superglue_api_keys`;
    console.log('Fetching API keys from:', url);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch API keys:', response.statusText);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return data.filter(item => item.is_active === true).map(item => ({orgId: item.org_id, key: item.key}));
  }

  private async refreshApiKeys(): Promise<void> {
    try {
      this.cachedApiKeys = await this.fetchApiKeys();
      this.lastFetchTime = Date.now();
    } catch (error) {
      console.error('Failed to refresh API keys:', error);
    }
  }

  public cleanup(): void {
    clearInterval(this.refreshInterval);
  }
}