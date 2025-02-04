import { ApiConfig, ApiInput, ExtractConfig, ExtractInput, TransformConfig, TransformInput, RunResult, DataStore } from "@superglue/shared";
import objectHash from 'object-hash';
import { getAllKeys } from '../utils/tools.js';


export class MemoryStore implements DataStore {
  private storage: {
    apis: Map<string, ApiConfig>;
    extracts: Map<string, ExtractConfig>;
    transforms: Map<string, TransformConfig>;
    runs: Map<string, RunResult>;
    runsIndex: { id: string; timestamp: number; }[];
  };

  constructor() {
    this.storage = {
      apis: new Map(),
      extracts: new Map(),
      transforms: new Map(),
      runs: new Map(),
      runsIndex: []
    };
  }

  // API Config Methods
  async getApiConfig(id: string): Promise<ApiConfig | null> {
    const config = this.storage.apis.get(id);
    return config ? { ...config, id } : null;
  }

  async listApiConfigs(limit: number = 10, offset: number = 0): Promise<{ items: ApiConfig[], total: number }> {
    const items = Array.from(this.storage.apis.entries())
      .slice(offset, offset + limit)
      .map(([id, config]) => ({ ...config, id }));
    return { items, total: this.storage.apis.size };
  }

  async saveApiConfig(request: ApiInput, payload: any, config: ApiConfig): Promise<ApiConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    this.storage.apis.set(hash, config);
    return { ...config, id: hash };
  }

  async getApiConfigFromRequest(request: ApiInput, payload: any): Promise<ApiConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const config = this.storage.apis.get(hash);
    return config ? { ...config, id: hash } : null;
  }

  async upsertApiConfig(id: string, config: ApiConfig): Promise<ApiConfig> {
    this.storage.apis.set(id, config);
    return { ...config, id };
  }

  async deleteApiConfig(id: string): Promise<boolean> {
    return this.storage.apis.delete(id);
  }

  // Extract Config Methods
  async getExtractConfig(id: string): Promise<ExtractConfig | null> {
    const config = this.storage.extracts.get(id);
    return config ? { ...config, id } : null;
  }

  async listExtractConfigs(limit: number = 10, offset: number = 0): Promise<{ items: ExtractConfig[], total: number }> {
    const items = Array.from(this.storage.extracts.entries())
      .slice(offset, offset + limit)
      .map(([id, config]) => ({ ...config, id }));
    return { items, total: this.storage.extracts.size };
  }

  async saveExtractConfig(request: ExtractInput, payload: any, config: ExtractConfig): Promise<ExtractConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    this.storage.extracts.set(hash, config);
    return { ...config, id: hash };
  }

  async getExtractConfigFromRequest(request: ExtractInput, payload: any): Promise<ExtractConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const config = this.storage.extracts.get(hash);
    return config ? { ...config, id: hash } : null;
  }

  async upsertExtractConfig(id: string, config: ExtractConfig): Promise<ExtractConfig> {
    this.storage.extracts.set(id, config);
    return { ...config, id };
  }

  async deleteExtractConfig(id: string): Promise<boolean> {
    return this.storage.extracts.delete(id);
  }

  // Transform Config Methods
  async getTransformConfig(id: string): Promise<TransformConfig | null> {
    const config = this.storage.transforms.get(id);
    return config ? { ...config, id } : null;
  }

  async listTransformConfigs(limit: number = 10, offset: number = 0): Promise<{ items: TransformConfig[], total: number }> {
    const items = Array.from(this.storage.transforms.entries())
      .slice(offset, offset + limit)
      .map(([id, config]) => ({ ...config, id }));
    return { items, total: this.storage.transforms.size };
  }

  async saveTransformConfig(request: TransformInput, payload: any, config: TransformConfig): Promise<TransformConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    this.storage.transforms.set(hash, config);
    return { ...config, id: hash };
  }

  async getTransformConfigFromRequest(request: TransformInput, payload: any): Promise<TransformConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const config = this.storage.transforms.get(hash);
    return config ? { ...config, id: hash } : null;
  }

  async upsertTransformConfig(id: string, config: TransformConfig): Promise<TransformConfig> {
    this.storage.transforms.set(id, config);
    return { ...config, id };
  }

  async deleteTransformConfig(id: string): Promise<boolean> {
    return this.storage.transforms.delete(id);
  }

  // Run Result Methods
  async getRun(id: string): Promise<RunResult | null> {
    const run = this.storage.runs.get(id);
    return run ? { ...run, id } : null;
  }

  async createRun(run: RunResult): Promise<RunResult> {
    this.storage.runs.set(run.id, run);
    this.storage.runsIndex.push({
      id: run.id,
      timestamp: run.startedAt.getTime()
    });
    this.storage.runsIndex.sort((a, b) => b.timestamp - a.timestamp);
    return run;
  }

  async listRuns(limit: number = 10, offset: number = 0): Promise<{ items: RunResult[], total: number }> {
    const runIds = this.storage.runsIndex
      .slice(offset, offset + limit)
      .map(entry => entry.id);
    
    const items = runIds
      .map(id => {
        const run = this.storage.runs.get(id);
        return run ? { ...run, id } : null;
      })
      .filter((run): run is RunResult => run !== null);
    
    return { items, total: this.storage.runsIndex.length };
  }

  async deleteRun(id: string): Promise<boolean> {
    const deleted = this.storage.runs.delete(id);
    if (deleted) {
      const index = this.storage.runsIndex.findIndex(entry => entry.id === id);
      if (index !== -1) {
        this.storage.runsIndex.splice(index, 1);
      }
    }
    return deleted;
  }

  async clearAll(): Promise<void> {
    this.storage.apis.clear();
    this.storage.extracts.clear();
    this.storage.transforms.clear();
    this.storage.runs.clear();
    this.storage.runsIndex = [];
  }

  async disconnect(): Promise<void> {
    // No-op for memory store
  }

  async ping(): Promise<boolean> {
    return true;
  }
} 