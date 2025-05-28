import { ApiConfig, ExtractConfig, HttpMethod, RunResult, TransformConfig } from '@superglue/client';
import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
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
    });

    describe('Health Check', () => {
      it('should return true when redis is connected', async () => {
        const result = await store.ping();
        expect(result).toBe(true);
      });
    });
  });
}