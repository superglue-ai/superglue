import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from './memory.js'
import { ApiConfig, ExtractConfig, HttpMethod, RunResult, TransformConfig } from '@superglue/shared'


describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe('API Config operations', () => {
    const testConfig: ApiConfig = {
      id: 'test-api',
      urlHost: 'http://example.com',
      urlPath: '/api',
      instruction: 'Test API',
      method: HttpMethod.GET,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should store and retrieve API config', async () => {
      await store.upsertApiConfig(testConfig.id, testConfig);
      const retrieved = await store.getApiConfig(testConfig.id);
      expect(retrieved).toEqual(testConfig);
    });

    it('should list API configs with pagination', async () => {
      await store.upsertApiConfig(testConfig.id, testConfig);
      const { items, total } = await store.listApiConfigs(10, 0);
      expect(items.length).toBe(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testConfig);
    });

    it('should delete API config', async () => {
      await store.upsertApiConfig(testConfig.id, testConfig);
      const deleted = await store.deleteApiConfig(testConfig.id);
      expect(deleted).toBe(true);
      const retrieved = await store.getApiConfig(testConfig.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Extract Config operations', () => {
    const testExtractConfig: ExtractConfig = {
      id: 'test-extract',
      urlHost: 'http://example.com',
      instruction: 'Test extraction',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should store and retrieve Extract config', async () => {
      await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig);
      const retrieved = await store.getExtractConfig(testExtractConfig.id);
      expect(retrieved).toEqual(testExtractConfig);
    });

    it('should list Extract configs with pagination', async () => {
      await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig);
      const { items, total } = await store.listExtractConfigs(10, 0);
      expect(items.length).toBe(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testExtractConfig);
    });

    it('should delete Extract config', async () => {
      await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig);
      const deleted = await store.deleteExtractConfig(testExtractConfig.id);
      expect(deleted).toBe(true);
      const retrieved = await store.getExtractConfig(testExtractConfig.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Transform Config operations', () => {
    const testTransformConfig: TransformConfig = {
      id: 'test-transform',
      responseSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name', 'age']
      },
      responseMapping: "data.{'name': 'name', 'age': 'age'}",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should store and retrieve Transform config', async () => {
      await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig);
      const retrieved = await store.getTransformConfig(testTransformConfig.id);
      expect(retrieved).toEqual(testTransformConfig);
    });

    it('should list Transform configs with pagination', async () => {
      await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig);
      const { items, total } = await store.listTransformConfigs(10, 0);
      expect(items.length).toBe(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testTransformConfig);
    });

    it('should delete Transform config', async () => {
      await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig);
      const deleted = await store.deleteTransformConfig(testTransformConfig.id);
      expect(deleted).toBe(true);
      const retrieved = await store.getTransformConfig(testTransformConfig.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Run operations', () => {
    const testRun: RunResult = {
      id: 'test-run',
      success: true,
      startedAt: new Date(),
      completedAt: new Date(),
      error: null,
      config: {
        id: 'test-api', 
        urlHost: 'http://example.com', 
        urlPath: '/api', 
        instruction: 'Test API', 
        method: HttpMethod.GET, 
        createdAt: new Date(), 
        updatedAt: new Date()
      }
    };

    it('should create and retrieve run', async () => {
      await store.createRun(testRun);
      const retrieved = await store.getRun(testRun.id);
      expect(retrieved).toEqual(testRun);
    });

    it('should list runs with correct ordering', async () => {
      const run1 = { ...testRun, id: 'run1', startedAt: new Date(2024, 0, 1) };
      const run2 = { ...testRun, id: 'run2', startedAt: new Date(2024, 0, 2) };
      
      await store.createRun(run1);
      await store.createRun(run2);
      
      const { items, total } = await store.listRuns(10, 0);
      expect(items.length).toBe(2);
      expect(total).toBe(2);
      // Should be ordered by startedAt descending
      expect(items[0].id).toBe('run2');
      expect(items[1].id).toBe('run1');
    });

    it('should delete run', async () => {
      await store.createRun(testRun);
      const deleted = await store.deleteRun(testRun.id);
      expect(deleted).toBe(true);
      const retrieved = await store.getRun(testRun.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Utility operations', () => {
    it('should clear all data', async () => {
      // Insert some test data
      const testConfig: ApiConfig = {
        id: 'test-api',
        urlHost: 'http://example.com',
        urlPath: '/api',
        instruction: 'Test API',
        method: HttpMethod.GET,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const testRun: RunResult = {
        id: 'test-run',
        success: true,
        startedAt: new Date(),
        completedAt: new Date(),
        error: null,
        config: {
          id: 'test-api', 
          urlHost: 'http://example.com', 
          urlPath: '/api', 
          instruction: 'Test API', 
          method: HttpMethod.GET, 
          createdAt: new Date(), 
          updatedAt: new Date()
        }
      };
      const testExtractConfig: ExtractConfig = {
        id: 'test-extract',
        urlHost: 'http://example.com',
        instruction: 'Test extraction',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const testTransformConfig: TransformConfig = {
        id: 'test-transform',
        responseSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          },
          required: ['name', 'age']
        },
        responseMapping: "data.{'name': 'name', 'age': 'age'}",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await store.upsertApiConfig('test-api', testConfig);
      await store.upsertExtractConfig('test-extract', testExtractConfig);
      await store.upsertTransformConfig('test-transform', testTransformConfig);
      await store.createRun(testRun);

      await store.clearAll();

      const { total: apiTotal } = await store.listApiConfigs();
      const { total: extractTotal } = await store.listExtractConfigs();
      const { total: transformTotal } = await store.listTransformConfigs();
      const { total: runTotal } = await store.listRuns();

      expect(apiTotal).toBe(0);
      expect(extractTotal).toBe(0);
      expect(transformTotal).toBe(0);
      expect(runTotal).toBe(0);
    });

    it('should ping successfully', async () => {
      const result = await store.ping();
      expect(result).toBe(true);
    });
  });
}); 