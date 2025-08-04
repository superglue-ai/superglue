import { ApiConfig, ExtractConfig, HttpMethod, Integration, RunResult, TransformConfig, Workflow } from '@superglue/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
      const testApiConfig: ApiConfig = {
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
        await store.upsertApiConfig({ id: testApiConfig.id, config: testApiConfig, orgId: testOrgId });
        const retrieved = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
        expect(retrieved).toEqual(testApiConfig);
      });

      it('should list API configs', async () => {
        await store.upsertApiConfig({ id: testApiConfig.id, config: testApiConfig, orgId: testOrgId });
        const { items, total } = await store.listApiConfigs({ limit: 10, offset: 0, orgId: testOrgId });
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testApiConfig);
      });

      it('should delete API configs', async () => {
        await store.upsertApiConfig({ id: testApiConfig.id, config: testApiConfig, orgId: testOrgId });
        await store.deleteApiConfig({ id: testApiConfig.id, orgId: testOrgId });
        const retrieved = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
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
        await store.upsertExtractConfig({ id: testExtractConfig.id, config: testExtractConfig, orgId: testOrgId });
        const retrieved = await store.getExtractConfig({ id: testExtractConfig.id, orgId: testOrgId });
        expect(retrieved).toEqual(testExtractConfig);
      });

      it('should list extract configs', async () => {
        await store.upsertExtractConfig({ id: testExtractConfig.id, config: testExtractConfig, orgId: testOrgId });
        const { items, total } = await store.listExtractConfigs({ limit: 10, offset: 0, orgId: testOrgId });
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testExtractConfig);
      });

      it('should delete extract configs', async () => {
        await store.upsertExtractConfig({ id: testExtractConfig.id, config: testExtractConfig, orgId: testOrgId });
        await store.deleteExtractConfig({ id: testExtractConfig.id, orgId: testOrgId });
        const retrieved = await store.getExtractConfig({ id: testExtractConfig.id, orgId: testOrgId });
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
        await store.upsertTransformConfig({ id: testTransformConfig.id, config: testTransformConfig, orgId: testOrgId });
        const retrieved = await store.getTransformConfig({ id: testTransformConfig.id, orgId: testOrgId });
        expect(retrieved).toEqual(testTransformConfig);
      });

      it('should list transform configs', async () => {
        await store.upsertTransformConfig({ id: testTransformConfig.id, config: testTransformConfig, orgId: testOrgId });
        const { items, total } = await store.listTransformConfigs({ limit: 10, offset: 0, orgId: testOrgId });
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testTransformConfig);
      });

      it('should delete transform configs', async () => {
        await store.upsertTransformConfig({ id: testTransformConfig.id, config: testTransformConfig, orgId: testOrgId });
        await store.deleteTransformConfig({ id: testTransformConfig.id, orgId: testOrgId });
        const retrieved = await store.getTransformConfig({ id: testTransformConfig.id, orgId: testOrgId });
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
        await store.createRun({ result: testRun, orgId: testOrgId });
        const retrieved = await store.getRun({ id: testRun.id, orgId: testOrgId });
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

        await store.createRun({ result: run1, orgId: testOrgId });
        await store.createRun({ result: run2, orgId: testOrgId });

        const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: null, orgId: testOrgId });
        expect(items).toHaveLength(2);
        expect(total).toBe(2);
        expect(items[0].id).toBe(run2.id); // Most recent first
        expect(items[1].id).toBe(run1.id);
      });

      it('should delete runs', async () => {
        await store.createRun({ result: testRun, orgId: testOrgId });
        await store.deleteRun({ id: testRun.id, orgId: testOrgId });
        const retrieved = await store.getRun({ id: testRun.id, orgId: testOrgId });
        expect(retrieved).toBeNull();
      });

      it('should delete all runs', async () => {
        await store.createRun({ result: testRun, orgId: testOrgId });
        await store.deleteAllRuns({ orgId: testOrgId });
        const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: null, orgId: testOrgId });
        expect(items).toHaveLength(0);
        expect(total).toBe(0);
      });

      it('should filter out corrupted runs and continue listing valid ones', async () => {
        // Create a valid run
        const validRun = { ...testRun, id: 'valid-run' };
        await store.createRun({ result: validRun, orgId: testOrgId });

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

        const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: null, orgId: testOrgId });

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

        await store.createRun({ result: runWithoutStartedAt, orgId: testOrgId });
        await store.createRun({ result: validRun, orgId: testOrgId });

        const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: null, orgId: testOrgId });

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

        await store.createRun({ result: runWithoutConfigId, orgId: testOrgId });
        await store.createRun({ result: validRun, orgId: testOrgId });

        const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: null, orgId: testOrgId });

        // Should only return the valid run
        expect(items.length).toBe(1);
        expect(total).toBe(1);
        expect(items[0].id).toBe('valid-run');
      });
    });

    describe('Integration', () => {
      const testIntegration: Integration = {
        id: 'test-int-id',
        name: 'Test Integration',
        urlHost: 'https://integration.test',
        credentials: { apiKey: 'secret' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      it('should store and retrieve integrations', async () => {
        await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
        const retrieved = await store.getIntegration({ id: testIntegration.id, includeDocs: true, orgId: testOrgId });
        expect(retrieved).toEqual({ ...testIntegration, id: testIntegration.id });
      });

      it('should list integrations', async () => {
        await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
        const { items, total } = await store.listIntegrations({ limit: 10, offset: 0, includeDocs: true, orgId: testOrgId });
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual({ ...testIntegration, id: testIntegration.id });
      });

      it('should delete integrations', async () => {
        await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
        await store.deleteIntegration({ id: testIntegration.id, orgId: testOrgId });
        const retrieved = await store.getIntegration({ id: testIntegration.id, includeDocs: true, orgId: testOrgId });
        expect(retrieved).toBeNull();
      });

      it('should return null for missing integration', async () => {
        const retrieved = await store.getIntegration({ id: 'does-not-exist', includeDocs: true, orgId: testOrgId });
        expect(retrieved).toBeNull();
      });

      it('should get many integrations by ids, skipping missing ones', async () => {
        const int2 = { ...testIntegration, id: 'test-int-id-2', name: 'Integration 2' };
        await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
        await store.upsertIntegration({ id: int2.id, integration: int2, orgId: testOrgId });
        const result = await store.getManyIntegrations({
          ids: [testIntegration.id, int2.id, 'missing-id'],
          orgId: testOrgId
        });
        expect(result).toHaveLength(2);
        expect(result.map(i => i.id).sort()).toEqual([testIntegration.id, int2.id].sort());
      });
    });

    describe('Workflow', () => {
      const testWorkflow: Workflow = {
        id: 'test-workflow-id',
        steps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: 'Test workflow',
        inputSchema: {}
      };

      it('should get many workflows by ids, skipping missing ones', async () => {
        const wf2 = { ...testWorkflow, id: 'test-workflow-id-2' };
        await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
        await store.upsertWorkflow({ id: wf2.id, workflow: wf2, orgId: testOrgId });
        const result = await store.getManyWorkflows({
          ids: [testWorkflow.id, wf2.id, 'missing-id'],
          orgId: testOrgId
        });
        expect(result).toHaveLength(2);
        expect(result.map(w => w.id).sort()).toEqual([testWorkflow.id, wf2.id].sort());
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