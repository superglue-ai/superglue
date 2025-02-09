import { ApiConfig, ApiInput, DataStore, ExtractConfig, ExtractInput, RunResult, TransformConfig, TransformInput } from "@superglue/shared";
import objectHash from 'object-hash';
import { createClient, RedisClientType } from 'redis';
import { getAllKeys } from '../utils/tools.js';

export class RedisService implements DataStore {
  private redis: RedisClientType;
  private readonly RUN_PREFIX = 'run:';
  private readonly RUNS_BY_CONFIG_PREFIX = 'runs:config:';
  private readonly API_PREFIX = 'api:';
  private readonly EXTRACT_PREFIX = 'extract:';
  private readonly TRANSFORM_PREFIX = 'transform:';
  private readonly TTL = 60 * 60 * 24 * 90; // 90 days

  constructor(config: { 
    host: string; 
    port: number; 
    username: string;
    password?: string;
  }) {
    this.redis = createClient({
      username: config.username,
      password: config.password,
      socket: {
          host: config.host,
          port: config.port
      }
    });
    this.redis.on('error', (err) => {
      console.error('redis error:', err);
    });
    this.redis.on('connect', () => {
      console.log('🔥 redis connected');
    });
    this.redis.connect();
  }

  private getKey(prefix: string, id: string, orgId: string): string {
    return `${orgId}:${prefix}${id}`;
  }

  private getPattern(prefix: string, orgId?: string): string {
    return `${orgId ? `${orgId}:` : ''}${prefix}*`;
  }

  // API Config Methods
  async getApiConfig(id: string, orgId?: string): Promise<ApiConfig | null> {
    const data = await this.redis.get(this.getKey(this.API_PREFIX, id, orgId));
    return parseWithId(data, id);
  }

  async listApiConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: ApiConfig[], total: number }> {
    const pattern = this.getPattern(this.API_PREFIX, orgId);
    const keys = await this.redis.keys(pattern);
    const slicedKeys = keys.slice(offset, offset + limit);
    
    const configs = await Promise.all(
      slicedKeys.map(async (key) => {
        const data = await this.redis.get(key);
        const id = key.split(':').pop()!.replace(this.API_PREFIX, '');
        return parseWithId(data, id);
      })
    );
    return { items: configs.filter((config): config is ApiConfig => config !== null), total: keys.length };
  }

  async saveApiConfig(request: ApiInput, payload: any, config: ApiConfig, orgId?: string): Promise<ApiConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey(this.API_PREFIX, hash, orgId);
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async getApiConfigFromRequest(request: ApiInput, payload: any, orgId?: string): Promise<ApiConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey(this.API_PREFIX, hash, orgId);
    const data = await this.redis.get(key);
    return parseWithId(data, hash);
  }

  async getExtractConfigFromRequest(request: ExtractInput, payload: any, orgId?: string): Promise<ExtractConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey(this.EXTRACT_PREFIX, hash, orgId);
    const data = await this.redis.get(key);
    return parseWithId(data, hash);
  }

  async getTransformConfigFromRequest(request: TransformInput, payload: any, orgId?: string): Promise<TransformConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey(this.TRANSFORM_PREFIX, hash, orgId);
    const data = await this.redis.get(key);
    return parseWithId(data, hash);
  }

  async upsertApiConfig(id: string, config: ApiConfig, orgId: string): Promise<ApiConfig> {
    const key = this.getKey(this.API_PREFIX, id, orgId);
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async deleteApiConfig(id: string, orgId: string): Promise<void> {
    await this.redis.del(this.getKey(this.API_PREFIX, id, orgId));
  }

  // Extract Methods
  async getExtractConfig(id: string, orgId: string): Promise<ExtractConfig | null> {
    const data = await this.redis.get(this.getKey(this.EXTRACT_PREFIX, id, orgId));
    return parseWithId(data, id);
  }

  async listExtractConfigs(limit: number = 10, offset: number = 0, orgId: string): Promise<{ items: ExtractConfig[], total: number }> {
    const pattern = this.getPattern(this.EXTRACT_PREFIX, orgId);
    const keys = await this.redis.keys(pattern);
    const slicedKeys = keys.slice(offset, offset + limit);
    
    const configs = await Promise.all(
      slicedKeys.map(async (key) => {
        const data = await this.redis.get(key);
        const id = key.split(':').pop()!.replace(this.EXTRACT_PREFIX, '');
        return parseWithId(data, id);
      })
    );
    return { items: configs.filter((config): config is ExtractConfig => config !== null), total: keys.length };
  }

  async saveExtractConfig(request: ExtractInput, payload: any, config: ExtractConfig, orgId?: string): Promise<ExtractConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey(this.EXTRACT_PREFIX, hash, orgId);
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async upsertExtractConfig(id: string, config: ExtractConfig, orgId?: string): Promise<ExtractConfig> {
    const key = this.getKey(this.EXTRACT_PREFIX, id, orgId);
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async deleteExtractConfig(id: string, orgId?: string): Promise<void> {
    await this.redis.del(this.getKey(this.EXTRACT_PREFIX, id, orgId));
  }

  // Transform Methods
  async getTransformConfig(id: string, orgId?: string): Promise<TransformConfig | null> {
    const data = await this.redis.get(this.getKey(this.TRANSFORM_PREFIX, id, orgId));
    return parseWithId(data, id);
  }

  async listTransformConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: TransformConfig[], total: number }> {
    const pattern = this.getPattern(this.TRANSFORM_PREFIX, orgId);
    const keys = await this.redis.keys(pattern);
    const slicedKeys = keys.slice(offset, offset + limit);
    
    const configs = await Promise.all(
      slicedKeys.map(async (key) => {
        const data = await this.redis.get(key);
        const id = key.split(':').pop()!.replace(this.TRANSFORM_PREFIX, '');
        return parseWithId(data, id);
      })
    );
    return { items: configs.filter((config): config is TransformConfig => config !== null), total: keys.length };
  }

  async saveTransformConfig(request: TransformInput, payload: any, config: TransformConfig, orgId?: string): Promise<TransformConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = this.getKey(this.TRANSFORM_PREFIX, hash, orgId);
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async upsertTransformConfig(id: string, config: TransformConfig, orgId?: string): Promise<TransformConfig> {
    const key = this.getKey(this.TRANSFORM_PREFIX, id, orgId);
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async deleteTransformConfig(id: string, orgId?: string): Promise<void> {
    await this.redis.del(this.getKey(this.TRANSFORM_PREFIX, id, orgId));
  }

  async getRun(id: string, orgId?: string): Promise<RunResult | null> {
    const data = await this.redis.get(this.getKey(this.RUN_PREFIX, id, orgId));
    return parseWithId(data, id);
  }

  async listRuns(limit: number = 10, offset: number = 0, orgId?: string, configId?: string): Promise<{ items: RunResult[], total: number }> {
    // Build the pattern based on whether we have a configId
    const prefix = this.getPattern(this.TRANSFORM_PREFIX, orgId);
    const pattern = configId 
      ? `${prefix}${configId}:*`
      : `${prefix}*`;
      
    // Get all matching keys
    const keys = await this.redis.keys(pattern);
    const total = keys.length;
    
    if (total === 0) {
      return { items: [], total: 0 };
    }

    // Get all matching runs data in parallel
    const runs = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.get(key);
        const runId = configId 
          ? key.replace(`${prefix}${configId}:`, '')
          : key.replace(prefix, '');
        return parseWithId(data, runId);
      })
    );

    // Filter nulls, sort by startedAt, and apply pagination
    const validRuns = runs
      .filter((run): run is RunResult => run !== null)
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));

    return {
      items: validRuns.slice(offset, offset + limit),
      total
    };
  }

  async deleteAllRuns(orgId: string): Promise<void> {
    const runIds = await this.redis.zRange(`${orgId}:runs:index`, 0, -1);
    
    const multi = this.redis.multi();
    
    // Delete all run records
    for (const id of runIds) {
      multi.del(this.getKey(this.RUN_PREFIX, id, orgId));
    }
    
    // Delete the index
    multi.del(`${orgId}:runs:index`);
    
    await multi.exec();
  }

  async createRun(run: RunResult, orgId?: string): Promise<RunResult> {
    const key = `${orgId}:${this.RUN_PREFIX}${run.config?.id}:${run.id}`;
    const timestamp = run.startedAt.getTime();
    
    const multi = this.redis.multi();
    
    multi.set(key, JSON.stringify(run), {
        EX: this.TTL
    });
    
    multi.zAdd(`${orgId}:runs:index`, {
        score: timestamp,
        value: run.id
    });
    return run;
  }

  async deleteRun(id: string, orgId?: string): Promise<boolean> {
    // Since we don't know the configId, we need to scan for the key
    const pattern = `${orgId}:${this.RUN_PREFIX}*${id}`;
    for await (const key of this.redis.scanIterator({ MATCH: pattern })) {
      await this.redis.del(key);
      return true;
    }
    return false;
  }

  // Utility methods
  async clearAll(orgId: string): Promise<void> {
    const pattern = `${orgId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
}

function parseWithId(data: string, id: string): any {
  if(!data) return null;
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  return { 
    ...parsed, 
    ...(parsed.startedAt && { startedAt: new Date(parsed.startedAt) }), 
    ...(parsed.completedAt && { completedAt: new Date(parsed.completedAt) }),
    ...(parsed.createdAt && { createdAt: new Date(parsed.createdAt) }),
    ...(parsed.updatedAt && { updatedAt: new Date(parsed.updatedAt) }),
    ...(parsed.config && { config: parseWithId(parsed.config, parsed.config.id) }),
    id: id
  };
}