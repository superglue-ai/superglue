import { ApiConfig, ExtractConfig, HttpMethod, RunResult, TransformConfig } from '@superglue/shared';
import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { FileStore } from './filestore.js';
import fs from 'fs';
import path from 'path';

describe('FileStore', () => {
  let store: FileStore;
  const testOrgId = 'test-org';
  const testDir = './.test-data';
  const testPath = path.join(testDir, 'superglue_data.json');

  beforeEach(() => {
    // Clean up any existing test data
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
    store = new FileStore(testDir);
  });

  afterEach(async () => {
    await store.clearAll();
    await store.disconnect();
    // Clean up test files
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
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

    it('should handle null payloads when getting extract by request', async () => {
      const saved = await store.saveExtractConfig(testExtractConfig, null, testExtractConfig, testOrgId);
      
      // Test with null payload
      const nullPayloadResult = await store.getExtractConfigFromRequest(
        testExtractConfig,
        null,
        testOrgId
      );
      expect(nullPayloadResult).toEqual(saved);

      // Test with undefined payload
      const undefinedPayloadResult = await store.getExtractConfigFromRequest(
        testExtractConfig,
        undefined,
        testOrgId
      );
      expect(undefinedPayloadResult).toEqual(saved);
    });
  });

  describe('Transform Config', () => {
    const testTransformConfig: TransformConfig = {
      id: 'test-transform-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      instruction: 'Test transformation',
      responseSchema: {},
      responseMapping: '',
      confidence: 1,
      confidence_reasoning: 'test',
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

    it('should list runs filtered by config ID', async () => {
      const run1 = { ...testRun, id: 'run1', config: { ...testRun.config, id: 'config1' } };
      const run2 = { ...testRun, id: 'run2', config: { ...testRun.config, id: 'config2' } };
      const run3 = { ...testRun, id: 'run3', config: { ...testRun.config, id: 'config1' } };
      
      await store.createRun(run1, testOrgId);
      await store.createRun(run2, testOrgId);
      await store.createRun(run3, testOrgId);
      
      const { items, total } = await store.listRuns(10, 0, 'config1', testOrgId);
      expect(items.length).toBe(2);
      expect(total).toBe(3); // Total is still all runs
      expect(items.map(run => run.id).sort()).toEqual(['run1', 'run3']);
    });

    it('should persist data between store instances', async () => {
      await store.createRun(testRun, testOrgId);
      await store.disconnect();

      // Create a new store instance pointing to the same directory
      const newStore = new FileStore(testDir);
      const retrieved = await newStore.getRun(testRun.id, testOrgId);
      expect(retrieved).toEqual(testRun);
    });
  });

  describe('Clear All', () => {
    it('should clear all data', async () => {
      const testConfig: ApiConfig = {
        id: 'test-api',
        createdAt: new Date(),
        updatedAt: new Date(),
        urlHost: 'https://test.com',
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: 'Test API',
      };

      const testExtractConfig: ExtractConfig = {
        id: 'test-extract',
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: 'Test extraction',
        urlHost: 'https://test.com',
      };

      const testTransformConfig: TransformConfig = {
        id: 'test-transform',
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: 'Test transformation',
        responseSchema: {},
        responseMapping: '',
        confidence: 1,
        confidence_reasoning: 'test',
      };

      const testRun: RunResult = {
        id: 'test-run',
        startedAt: new Date(),
        completedAt: new Date(),
        success: true,
        config: testConfig,
        error: null,
      };

      await store.upsertApiConfig('test-api', testConfig, testOrgId);
      await store.upsertExtractConfig('test-extract', testExtractConfig, testOrgId);
      await store.upsertTransformConfig('test-transform', testTransformConfig, testOrgId);
      await store.createRun(testRun, testOrgId);

      await store.clearAll();

      const { total: apiTotal } = await store.listApiConfigs(10, 0, testOrgId);
      const { total: extractTotal } = await store.listExtractConfigs(10, 0, testOrgId);
      const { total: transformTotal } = await store.listTransformConfigs(10, 0, testOrgId);
      const { total: runTotal } = await store.listRuns(10, 0, null, testOrgId);

      expect(apiTotal).toBe(0);
      expect(extractTotal).toBe(0);
      expect(transformTotal).toBe(0);
      expect(runTotal).toBe(0);
    });
  });
});
