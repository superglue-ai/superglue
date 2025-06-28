import { ApiConfig, ExtractConfig, HttpMethod, RunResult, TransformConfig } from '@superglue/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from './redis.js';

// Mock Redis client configuration
const testConfig = {
  host: process.env.VITE_REDIS_HOST,
  port: parseInt(process.env.VITE_REDIS_PORT),
  username: process.env.VITE_REDIS_USERNAME,
  password: process.env.VITE_REDIS_PASSWORD
};
if (!testConfig.host || !testConfig.port || !testConfig.username || !testConfig.password) {
  describe('RedisService (skipped)', () => {
    it.skip('Skipping Redis tests due to missing configuration', () => {
      console.warn('Redis configuration is not set. Skipping tests.');
    });
  });
} else {
  describe('RedisService', () => {
    let store: RedisService;
    const testOrgId = 'test-org';

    beforeEach(async () => {
      try {
        store = new RedisService(testConfig);
        await store.clearAll(testOrgId);
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
      }
    });

    afterEach(async () => {
      try {
        await store.disconnect();
      } catch (error) {
        console.error('Failed to disconnect from Redis:', error);
      }
    });

    describe('API Config', () => {
      const testSpy = vi.spyOn(RedisService.prototype as any, 'redis', 'get').mockImplementation(function() {
        return this._redis;
      });
      const testConfig: ApiConfig = {
        id: 'test-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        urlHost: 'https://test.com',
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: 'Test API',
      };

      it('should store and retrieve API configs', async () => {
        await store.upsertApiConfig(testConfig.id, testConfig, testOrgId);
        const retrieved = await store.getApiConfig(testConfig.id, testOrgId);
        expect(retrieved).toEqual(testConfig);
      });

      it('should list API configs', async () => {
        await store.upsertApiConfig(testConfig.id, testConfig, testOrgId);
        const { items, total } = await store.listApiConfigs(10, 0, testOrgId);
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testConfig);
      });
      
      it('should use MGET for batch retrieval of multiple API configs', async () => {
        // Create multiple configs
        const configs = Array.from({ length: 5 }, (_, i) => ({
          ...testConfig,
          id: `test-id-${i}`,
          urlHost: `https://test${i}.com`
        }));
        
        // Insert configs
        await Promise.all(
          configs.map(config => store.upsertApiConfig(config.id, config, testOrgId))
        );
        
        // Spy on redis methods
        const mgetSpy = vi.spyOn(store['redis'], 'mGet');
        const getSpy = vi.spyOn(store['redis'], 'get');
        
        // List configs
        const { items, total } = await store.listApiConfigs(10, 0, testOrgId);
        
        // Verify results
        expect(items).toHaveLength(5);
        expect(total).toBe(5);
        
        // Verify MGET was called once and GET was not called
        expect(mgetSpy).toHaveBeenCalledTimes(1);
        expect(getSpy).not.toHaveBeenCalled();
      });

      it('should delete API configs', async () => {
        await store.upsertApiConfig(testConfig.id, testConfig, testOrgId);
        await store.deleteApiConfig(testConfig.id, testOrgId);
        const retrieved = await store.getApiConfig(testConfig.id, testOrgId);
        expect(retrieved).toBeNull();
      });
    });

    describe('Extract Config', () => {
      const testExtractConfig: ExtractConfig = {
        id: 'test-extract-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: 'Test extraction',
        urlHost: 'https://test.com',
      };

      it('should store and retrieve extract configs', async () => {
        await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig, testOrgId);
        const retrieved = await store.getExtractConfig(testExtractConfig.id, testOrgId);
        expect(retrieved).toEqual(testExtractConfig);
      });

      it('should list extract configs', async () => {
        await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig, testOrgId);
        const { items, total } = await store.listExtractConfigs(10, 0, testOrgId);
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testExtractConfig);
      });

      it('should delete extract configs', async () => {
        await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig, testOrgId);
        await store.deleteExtractConfig(testExtractConfig.id, testOrgId);
        const retrieved = await store.getExtractConfig(testExtractConfig.id, testOrgId);
        expect(retrieved).toBeNull();
      });
    });

    describe('Transform Config', () => {
      const testTransformConfig: TransformConfig = {
        id: 'test-transform-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: 'Test transformation',
        responseSchema: {},
        responseMapping: ''
      };

      it('should store and retrieve transform configs', async () => {
        await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig, testOrgId);
        const retrieved = await store.getTransformConfig(testTransformConfig.id, testOrgId);
        expect(retrieved).toEqual(testTransformConfig);
      });

      it('should list transform configs', async () => {
        await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig, testOrgId);
        const { items, total } = await store.listTransformConfigs(10, 0, testOrgId);
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testTransformConfig);
      });

      it('should delete transform configs', async () => {
        await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig, testOrgId);
        await store.deleteTransformConfig(testTransformConfig.id, testOrgId);
        const retrieved = await store.getTransformConfig(testTransformConfig.id, testOrgId);
        expect(retrieved).toBeNull();
      });
    });

    describe('Run Results', () => {
      const testApiConfig: ApiConfig = {
        id: 'test-api-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        urlHost: 'https://test.com',
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: 'Test API',
      };

      const testRun: RunResult = {
        id: 'test-run-id',
        startedAt: new Date(),
        completedAt: new Date(),
        success: true,
        config: testApiConfig,
        error: null,
      };

      it('should store and retrieve runs', async () => {
        await store.createRun(testRun, testOrgId);
        const retrieved = await store.getRun(testRun.id, testOrgId);
        expect(retrieved).toEqual(testRun);
      });

      it('should list runs in chronological order', async () => {
        const run1: RunResult = {
          ...testRun,
          id: 'run1',
          startedAt: new Date(Date.now() - 1000),
        };
        const run2: RunResult = {
          ...testRun,
          id: 'run2',
          startedAt: new Date(),
        };

        await store.createRun(run1, testOrgId);
        await store.createRun(run2, testOrgId);

        const { items, total } = await store.listRuns(10, 0, null, testOrgId);
        expect(items).toHaveLength(2);
        expect(total).toBe(2);
        expect(items[0].id).toBe(run2.id); // Most recent first
        expect(items[1].id).toBe(run1.id);
      });

      it('should delete runs', async () => {
        await store.createRun(testRun, testOrgId);
        await store.deleteRun(testRun.id, testOrgId);
        const retrieved = await store.getRun(testRun.id, testOrgId);
        expect(retrieved).toBeNull();
      });

      it('should delete all runs', async () => {
        await store.createRun(testRun, testOrgId);
        await store.deleteAllRuns(testOrgId);
        const { items, total } = await store.listRuns(10, 0, null, testOrgId);
        expect(items).toHaveLength(0);
        expect(total).toBe(0);
      });

      it('should filter out corrupted runs and continue listing valid ones', async () => {
        // Create a valid run
        const validRun = { ...testRun, id: 'valid-run' };
        await store.createRun(validRun, testOrgId);

        // Manually insert corrupted runs into Redis to simulate corruption
        const corruptedRun1 = { id: 'corrupted-run-1', config: null, startedAt: null };
        const corruptedRun2 = { id: 'corrupted-run-2', config: { id: 'config-id' }, startedAt: null };
        const corruptedRun3 = { id: 'corrupted-run-3', config: null, startedAt: new Date() };

        const key1 = `${testOrgId}:run:config1:corrupted-run-1`;
        const key2 = `${testOrgId}:run:config2:corrupted-run-2`;
        const key3 = `${testOrgId}:run:config3:corrupted-run-3`;

        await store['redis'].set(key1, JSON.stringify(corruptedRun1));
        await store['redis'].set(key2, JSON.stringify(corruptedRun2));
        await store['redis'].set(key3, JSON.stringify(corruptedRun3));

        const { items, total } = await store.listRuns(10, 0, null, testOrgId);

        // Should only return the valid run
        expect(items.length).toBe(1);
        expect(total).toBe(1);
        expect(items[0].id).toBe('valid-run');
      });

      it('should handle runs with missing startedAt dates', async () => {
        const runWithoutStartedAt = {
          ...testRun,
          id: 'run-no-started-at',
          startedAt: undefined
        };
        const validRun = { ...testRun, id: 'valid-run' };

        await store.createRun(runWithoutStartedAt, testOrgId);
        await store.createRun(validRun, testOrgId);

        const { items, total } = await store.listRuns(10, 0, null, testOrgId);

        // Should only return the valid run
        expect(items.length).toBe(1);
        expect(total).toBe(1);
        expect(items[0].id).toBe('valid-run');
      });

      it('should handle runs with missing config IDs', async () => {
        const runWithoutConfigId = {
          ...testRun,
          id: 'run-no-config-id',
          config: { ...testRun.config, id: undefined }
        };
        const validRun = { ...testRun, id: 'valid-run' };

        await store.createRun(runWithoutConfigId, testOrgId);
        await store.createRun(validRun, testOrgId);

        const { items, total } = await store.listRuns(10, 0, null, testOrgId);

        // Should only return the valid run
        expect(items.length).toBe(1);
        expect(total).toBe(1);
        expect(items[0].id).toBe('valid-run');
      });
    });

    describe('Integration', () => {
      const testIntegration = {
        id: 'test-int-id',
        name: 'Test Integration',
        urlHost: 'https://integration.test',
        credentials: { apiKey: 'secret' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      it('should store and retrieve integrations', async () => {
        await store.upsertIntegration(testIntegration.id, testIntegration, testOrgId);
        const retrieved = await store.getIntegration(testIntegration.id, testOrgId);
        expect(retrieved).toEqual({ ...testIntegration, id: testIntegration.id });
      });

      it('should list integrations', async () => {
        await store.upsertIntegration(testIntegration.id, testIntegration, testOrgId);
        const { items, total } = await store.listIntegrations(10, 0, testOrgId);
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual({ ...testIntegration, id: testIntegration.id });
      });

      it('should delete integrations', async () => {
        await store.upsertIntegration(testIntegration.id, testIntegration, testOrgId);
        await store.deleteIntegration(testIntegration.id, testOrgId);
        const retrieved = await store.getIntegration(testIntegration.id, testOrgId);
        expect(retrieved).toBeNull();
      });

      it('should return null for missing integration', async () => {
        const retrieved = await store.getIntegration('does-not-exist', testOrgId);
        expect(retrieved).toBeNull();
      });
    });

    describe('Health Check', () => {
      it('should return true when redis is connected', async () => {
        const result = await store.ping();
        expect(result).toBe(true);
      });
    });
  });
}