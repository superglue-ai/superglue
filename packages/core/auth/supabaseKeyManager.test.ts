import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';
import { SupabaseKeyManager } from './supabaseKeyManager.js';

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
    vi.stubGlobal('fetch', mockFetch);
    process.env = { ...mockEnv };
    keyManager = new SupabaseKeyManager();
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    vi.clearAllMocks();
    keyManager.cleanup();
  });

  it('should return empty array when no keys found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    const result = await keyManager.getApiKeys();
    expect(result).toEqual([]);
  });

  it('should return filtered active keys', async () => {
    const mockData = [
      { org_id: '1', key: 'key1', is_active: true },
      { org_id: '2', key: 'key2', is_active: false },
      { org_id: '3', key: 'key3', is_active: true }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    });

    const result = await keyManager.getApiKeys();
    expect(result).toEqual([
      { orgId: '1', key: 'key1' },
      { orgId: '3', key: 'key3' }
    ]);
  });

  it('should return empty array and log error when environment variables are missing', async () => {
    process.env = {};
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const result = await keyManager.getApiKeys();
    
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith('Missing required Supabase environment variables');
    
    consoleSpy.mockRestore();
  });

  it('should return empty array when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    });

    const result = await keyManager.getApiKeys();
    expect(result).toEqual([]);
  });

  it('should cache results and not fetch again within TTL', async () => {
    const mockData = [
      { org_id: '1', key: 'key1', is_active: true }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    });

    // First call should fetch
    await keyManager.getApiKeys();
    // Second call should use cache
    await keyManager.getApiKeys();
    // Third call should use cache
    await keyManager.getApiKeys();
    // Fourth call should use cache
    await keyManager.getApiKeys();

    // one call plus interval call
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

 