import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseKeyManager } from './supabase-key-manager.js';

describe('SupabaseKeyManager', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;
  const mockEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://test.com',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    PRIV_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
  };
  let keyManager: SupabaseKeyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mockFetch);
    process.env = { ...mockEnv };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal('fetch', originalFetch);
    vi.clearAllMocks();
  });

  it('should return false for authentication when no keys found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    });

    keyManager = new SupabaseKeyManager();
    const result = await keyManager.authenticate('nonexistent');
    
    expect(result).toEqual({ success: false, orgId: undefined });
  });

  it('should authenticate active keys and reject inactive keys', async () => {
    const mockData = [
      { org_id: '1', key: 'key1', is_active: true },
      { org_id: '2', key: 'key2', is_active: false },
      { org_id: '3', key: 'key3', is_active: true }
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData
    });
    
    keyManager = new SupabaseKeyManager();
    
    const testAuth1 = await keyManager.authenticate(mockData[0].key);
    const testAuth2 = await keyManager.authenticate(mockData[1].key);
    const testAuth3 = await keyManager.authenticate(mockData[2].key);
    
    expect(testAuth1).toEqual({ success: true, orgId: '1' });
    expect(testAuth2).toEqual({ success: false, orgId: undefined });
    expect(testAuth3).toEqual({ success: true, orgId: '3' });
  });

  it('should fail authentication and log error when environment variables are missing', async () => {
    process.env = {};
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    
    const keyManagerTest = new SupabaseKeyManager();
    const result = await keyManagerTest.authenticate('key1');
    
    expect(result).toEqual({ success: false, orgId: undefined });
    expect(consoleSpy).toHaveBeenCalledWith('Missing required Supabase environment variables');

    consoleSpy.mockRestore();
  });

  it('should fail authentication when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Not Found'
    });

    keyManager = new SupabaseKeyManager();
    const result = await keyManager.authenticate('any-key');
    
    expect(result).toEqual({ success: false, orgId: undefined });
  });

  it('should cache results and not fetch again within TTL', async () => {
    const mockData = [
      { org_id: '1', key: 'key1', is_active: true },
      { org_id: '2', key: 'key2', is_active: true }
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData
    });
    
    keyManager = new SupabaseKeyManager();
    
    await keyManager.authenticate(mockData[0].key);
    await keyManager.authenticate(mockData[0].key);
    await keyManager.authenticate(mockData[1].key);
    await keyManager.authenticate(mockData[1].key);
    await keyManager.authenticate(mockData[1].key);

    // Only initial fetch from constructor
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
