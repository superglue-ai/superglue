import { logMessage } from "../utils/logs.js";
import { AuthManager, AuthResult } from "./types.js";

export class SupabaseKeyManager implements AuthManager {
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

  public async authenticate(apiKey: string): Promise<AuthResult> {
    let keys = await this.getApiKeys();
    let key = keys.find(k => k.key === apiKey);
    if (!key) {
      await this.refreshApiKeys();
      keys = await this.getApiKeys();
      key = keys.find(k => k.key === apiKey);
    }
    return { 
      orgId: key?.orgId || '', 
      success: !!key,
      userId: undefined,
      orgName: undefined,
      orgRole: undefined
    };
  }

  private async fetchApiKeys(): Promise<{ orgId: string; key: string }[]> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.PRIV_SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing required Supabase environment variables');
      throw new Error('Missing required Supabase environment variables');
    }

    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const url = `${SUPABASE_URL}/rest/v1/sg_superglue_api_keys?select=org_id,key,is_active&limit=${PAGE_SIZE}&offset=${offset}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'count=exact'
        },
      });

      if (!response.ok) {
        logMessage('error', `Failed to fetch API keys: ${response.statusText}`);
        return [];
      }

      const pageData = await response.json();
      if (!Array.isArray(pageData) || pageData.length === 0) {
        hasMore = false;
      } else {
        allData = [...allData, ...pageData];
        offset += PAGE_SIZE;
        hasMore = pageData.length === PAGE_SIZE;
      }
    }

    return allData.filter(item => item.is_active === true).map(item => ({ orgId: item.org_id, key: item.key }));
  }

  private async refreshApiKeys(): Promise<void> {
    try {
      this.cachedApiKeys = await this.fetchApiKeys();
      this.lastFetchTime = Date.now();
    } catch (error) {
      console.error('Failed to refresh API keys:', error);
    }
  }

}