import { ApiConfig, ApiInput, DataStore, ExtractConfig, ExtractInput, RunResult, TransformConfig, TransformInput } from "@superglue/shared";
import objectHash from 'object-hash';
import { getAllKeys } from '../utils/tools.js';

export class MemoryStore implements DataStore {
  private storage: {
    apis: Map<string, ApiConfig>;
    extracts: Map<string, ExtractConfig>;
    transforms: Map<string, TransformConfig>;
    runs: Map<string, RunResult>;
    runsIndex: Map<string, { id: string; timestamp: number; configId: string }[]>;
  };

  constructor() {
    this.storage = {
      apis: new Map(),
      extracts: new Map(),
      transforms: new Map(),
      runs: new Map(),
      runsIndex: new Map()
    };
  }

  private getKey(prefix: string, id: string, orgId?: string): string {
    return `${orgId ? `${orgId}:` : ''}${prefix}:${id}`;
  }

  private getOrgItems<T>(map: Map<string, T>, prefix: string, orgId?: string): T[] {
    return Array.from(map.entries())
      .filter(([key]) => key.startsWith(`${orgId ? `${orgId}:` : ''}${prefix}:`))
      .map(([key, value]) => ({ ...value, id: key.split(':').pop() })) as T[];
  }

  // API Config Methods
  async getApiConfig(id: string, orgId: string): Promise<ApiConfig | null> {
    const key = this.getKey('api', id, orgId);
    const config = this.storage.apis.get(key);
    return config ? { ...config, id } : null;
  }

  async listApiConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: ApiConfig[], total: number }> {
    const orgItems = this.getOrgItems(this.storage.apis, 'api', orgId);
    const items = orgItems
      .slice(offset, offset + limit);
    const total = orgItems.length;
    return { items, total };
  }

  async saveApiConfig(request: ApiInput, payload: any, config: ApiConfig, orgId?: string): Promise<ApiConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey('api', hash, orgId);
    this.storage.apis.set(key, config);
    return { ...config, id: hash };
  }

  async getApiConfigFromRequest(request: ApiInput, payload: any, orgId?: string): Promise<ApiConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey('api', hash, orgId);
    const config = this.storage.apis.get(key);
    return config ? { ...config, id: hash } : null;
  }

  async upsertApiConfig(id: string, config: ApiConfig, orgId?: string): Promise<ApiConfig> {
    const key = this.getKey('api', id, orgId);
    this.storage.apis.set(key, config);
    return { ...config, id };
  }

  async deleteApiConfig(id: string, orgId: string): Promise<void> {
    const key = this.getKey('api', id, orgId);
    this.storage.apis.delete(key);
  }

  // Extract Config Methods
  async getExtractConfig(id: string, orgId: string): Promise<ExtractConfig | null> {
    const key = this.getKey('extract', id, orgId);
    const config = this.storage.extracts.get(key);
    return config ? { ...config, id } : null;
  }

  async listExtractConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: ExtractConfig[], total: number }> {
    const items = this.getOrgItems(this.storage.extracts, 'extract', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.extracts, 'extract', orgId).length;
    return { items, total };
  }

  async saveExtractConfig(request: ExtractInput, payload: any, config: ExtractConfig, orgId: string): Promise<ExtractConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey('extract', hash, orgId);
    this.storage.extracts.set(key, config);
    return { ...config, id: hash };
  }

  async getExtractConfigFromRequest(request: ExtractInput, payload: any, orgId?: string): Promise<ExtractConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey('extract', hash, orgId);
    const config = this.storage.extracts.get(key);
    return config ? { ...config, id: hash } : null;
  }

  async upsertExtractConfig(id: string, config: ExtractConfig, orgId: string): Promise<ExtractConfig> {
    const key = this.getKey('extract', id, orgId);
    this.storage.extracts.set(key, config);
    return { ...config, id };
  }

  async deleteExtractConfig(id: string, orgId: string): Promise<void> {
    const key = this.getKey('extract', id, orgId);
    this.storage.extracts.delete(key);
  }

  // Transform Config Methods
  async getTransformConfig(id: string, orgId: string): Promise<TransformConfig | null> {
    const key = this.getKey('transform', id, orgId);
    const config = this.storage.transforms.get(key);
    return config ? { ...config, id } : null;
  }

  async listTransformConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: TransformConfig[], total: number }> {
    const items = this.getOrgItems(this.storage.transforms, 'transform', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.transforms, 'transform', orgId).length;
    return { items, total };
  }

  async saveTransformConfig(request: TransformInput, payload: any, config: TransformConfig, orgId?: string): Promise<TransformConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey('transform', hash, orgId);
    this.storage.transforms.set(key, config);
    return { ...config, id: hash };
  }

  async getTransformConfigFromRequest(request: TransformInput, payload: any, orgId?: string): Promise<TransformConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey('transform', hash, orgId);
    const config = this.storage.transforms.get(key);
    return config ? { ...config, id: hash } : null;
  }

  async upsertTransformConfig(id: string, config: TransformConfig, orgId: string): Promise<TransformConfig> {
    const key = this.getKey('transform', id, orgId);
    this.storage.transforms.set(key, config);
    return { ...config, id };
  }

  async deleteTransformConfig(id: string, orgId: string): Promise<void> {
    const key = this.getKey('transform', id, orgId);
    this.storage.transforms.delete(key);
  }

  // Run Result Methods
  async getRun(id: string, orgId: string): Promise<RunResult | null> {
    const key = this.getKey('run', id, orgId);
    const run = this.storage.runs.get(key);
    return run ? { ...run, id } : null;
  }

  async createRun(run: RunResult, orgId: string): Promise<RunResult> {
    const key = this.getKey('run', run.id, orgId);
    this.storage.runs.set(key, run);
    
    if (!this.storage.runsIndex.has(orgId)) {
      this.storage.runsIndex.set(orgId, []);
    }
    
    const index = this.storage.runsIndex.get(orgId)!;
    index.push({
      id: run.id,
      timestamp: run.startedAt.getTime(),
      configId: run.config.id
    });
    index.sort((a, b) => b.timestamp - a.timestamp);
    
    return run;
  }

  async listRuns(limit: number = 10, offset: number = 0, configId?: string, orgId?: string): Promise<{ items: RunResult[], total: number }> {
    const index = this.storage.runsIndex.get(orgId) || [];
    const runIds = index
      .filter(entry => !configId || entry.configId === configId)
      .slice(offset, offset + limit)
      .map(entry => entry.id);
    
    const items = runIds.map(id => {
      const key = this.getKey('run', id, orgId);
      const run = this.storage.runs.get(key);
      return run ? { ...run, id } : null;
    }).filter((run): run is RunResult => run !== null);
    
    return { items, total: index.length };
  }

  async deleteRun(id: string, orgId: string): Promise<boolean> {
    const key = this.getKey('run', id, orgId);
    const deleted = this.storage.runs.delete(key);
    
    if (deleted && this.storage.runsIndex.has(orgId)) {
      const index = this.storage.runsIndex.get(orgId)!;
      const entryIndex = index.findIndex(entry => entry.id === id);
      if (entryIndex !== -1) {
        index.splice(entryIndex, 1);
      }
    }
    return deleted;
  }

  async deleteAllRuns(orgId: string): Promise<void> {
    const keys = Array.from(this.storage.runs.keys())
      .filter(key => key.startsWith(`${orgId}:run:`));
    
    for (const key of keys) {
      this.storage.runs.delete(key);
    }
    
    this.storage.runsIndex.delete(orgId);
  }

  async clearAll(): Promise<void> {
    this.storage.apis.clear();
    this.storage.extracts.clear();
    this.storage.transforms.clear();
    this.storage.runs.clear();
    this.storage.runsIndex.clear();
  }

  async disconnect(): Promise<void> {
    // No-op for memory store
  }

  async ping(): Promise<boolean> {
    return true;
  }
} 