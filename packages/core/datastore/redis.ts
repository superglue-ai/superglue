import { createClient, RedisClientType } from 'redis';
import { ApiConfig, ApiInput, ExtractConfig, ExtractInput, TransformConfig, TransformInput, RunResult } from "@superglue/shared";
import objectHash from 'object-hash';
import { getAllKeys } from '../utils/tools.js';
import { DataStore } from '@superglue/shared';

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

  // API Config Methods
  async getApiConfig(id: string): Promise<ApiConfig | null> {
    const data = await this.redis.get(`${this.API_PREFIX}${id}`);
    return parseWithId(data, id);
  }

  async listApiConfigs(limit: number = 10, offset: number = 0): Promise<{ items: ApiConfig[], total: number }> {
    const pattern = `${this.API_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    const slicedKeys = keys.slice(offset, offset + limit);
    
    const configs = await Promise.all(
      slicedKeys.map(async (key) => {
        const data = await this.redis.get(key);
        return parseWithId(data, key.replace(this.API_PREFIX, ''));
      })
    );
    return { items: configs.filter((config): config is ApiConfig => config !== null), total: keys.length };
  }

  async saveApiConfig(request: ApiInput, payload: any, config: ApiConfig): Promise<ApiConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = `${this.API_PREFIX}${hash}`;
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async getApiConfigFromRequest(request: ApiInput, payload: any): Promise<ApiConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = `${this.API_PREFIX}${hash}`;
    const data = await this.redis.get(key);
    return parseWithId(data, hash);
  }

  async getExtractConfigFromRequest(request: ExtractInput, payload: any): Promise<ExtractConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = `${this.EXTRACT_PREFIX}${hash}`;
    const data = await this.redis.get(key);
    return parseWithId(data, hash);
  }

  async getTransformConfigFromRequest(request: TransformInput, payload: any): Promise<TransformConfig | null> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = `${this.TRANSFORM_PREFIX}${hash}`;
    const data = await this.redis.get(key);
    return parseWithId(data, hash);
  }

  async upsertApiConfig(id: string, config: ApiConfig): Promise<ApiConfig> {
    await this.redis.set(`${this.API_PREFIX}${id}`, JSON.stringify(config));
    return config;
  }


  async deleteApiConfig(id: string): Promise<boolean> {
    const result = await this.redis.del(`${this.API_PREFIX}${id}`);
    return result === 1;
  }

  // Extract Methods
  async getExtractConfig(id: string): Promise<ExtractConfig | null> {
    const data = await this.redis.get(`${this.EXTRACT_PREFIX}${id}`);
    return parseWithId(data, id);
  }

  async listExtractConfigs(limit: number = 10, offset: number = 0): Promise<{ items: ExtractConfig[], total: number }> {
    const pattern = `${this.EXTRACT_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    const slicedKeys = keys.slice(offset, offset + limit);
    
    const configs = await Promise.all(
      slicedKeys.map(async (key) => {
        const data = await this.redis.get(key);
        return parseWithId(data, key.replace(this.EXTRACT_PREFIX, ''));
      })
    );

  return { items: configs.filter((config): config is ExtractConfig => config !== null), total: keys.length };
  }

  async saveExtractConfig(request: ExtractInput, payload: any, config: ExtractConfig): Promise<ExtractConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});  
    const key = `${this.EXTRACT_PREFIX}${hash}`;
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async upsertExtractConfig(id: string, config: ExtractConfig): Promise<ExtractConfig> {
    await this.redis.set(`${this.EXTRACT_PREFIX}${id}`, JSON.stringify(config));
    return config;
  }

  async deleteExtractConfig(id: string): Promise<boolean> {
    const result = await this.redis.del(`${this.EXTRACT_PREFIX}${id}`);
    return result === 1;
  }

  // Transform Methods
  async getTransformConfig(id: string): Promise<TransformConfig | null> {
    const data = await this.redis.get(`${this.TRANSFORM_PREFIX}${id}`);
    return parseWithId(data, id);
  }

  async listTransformConfigs(limit: number = 10, offset: number = 0): Promise<{ items: TransformConfig[], total: number }> {
    const pattern = `${this.TRANSFORM_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    const slicedKeys = keys.slice(offset, offset + limit);
    
    const configs = await Promise.all(
      slicedKeys.map(async (key) => {
        const data = await this.redis.get(key);
        return parseWithId(data, key.replace(this.TRANSFORM_PREFIX, ''));
      })
    );

    return { items: configs.filter((config): config is TransformConfig => config !== null), total: keys.length };
  }

  async saveTransformConfig(request: TransformInput, payload: any, config: TransformConfig): Promise<TransformConfig> {
    const hash = objectHash({request, payloadKeys: getAllKeys(payload)});
    const key = `${this.TRANSFORM_PREFIX}${hash}`;
    await this.redis.set(key, JSON.stringify(config));
    return config;
  }

  async upsertTransformConfig(id: string, config: TransformConfig): Promise<TransformConfig> {
    await this.redis.set(`${this.TRANSFORM_PREFIX}${id}`, JSON.stringify(config));
    return config;
  }

  async deleteTransformConfig(id: string): Promise<boolean> {
    const result = await this.redis.del(`${this.TRANSFORM_PREFIX}${id}`);
    return result === 1;
  }

  async getRun(id: string): Promise<RunResult | null> {
    const data = await this.redis.get(`${this.RUN_PREFIX}${id}`);
    return parseWithId(data, id);
  }

  async listRuns(limit: number = 10, offset: number = 0, configId?: string): Promise<{ items: RunResult[], total: number }> {
    // Build the pattern based on whether we have a configId
    const pattern = configId 
      ? `${this.RUN_PREFIX}${configId}:*`
      : `${this.RUN_PREFIX}*`;
      
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
          ? key.replace(`${this.RUN_PREFIX}${configId}:`, '')
          : key.replace(this.RUN_PREFIX, '');
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

  async deleteAllRuns(): Promise<void> {    
    // Get all run keys
    for await (const key of this.redis.scanIterator({
      MATCH: `${this.RUN_PREFIX}*`,
      COUNT: 100
    })) {
      await this.redis.del(key);
    }
  }

  async createRun(run: RunResult): Promise<RunResult> {
    // Include configId in key for faster filtering
    const key = `${this.RUN_PREFIX}${run.config?.id}:${run.id}`;
    await this.redis.set(key, JSON.stringify(run), {
      EX: this.TTL
    });
    return run;
  }

  async deleteRun(id: string): Promise<boolean> {
    // Since we don't know the configId, we need to scan for the key
    const pattern = `${this.RUN_PREFIX}*${id}`;
    for await (const key of this.redis.scanIterator({ MATCH: pattern })) {
      await this.redis.del(key);
      return true;
    }
    return false;
  }

  // Utility methods
  async clearAll(): Promise<void> {
    await this.redis.flushDb();
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
  const parsed = JSON.parse(data);
  return { 
    ...parsed, 
    ...(parsed.startedAt && { startedAt: new Date(parsed.startedAt) }), 
    ...(parsed.completedAt && { completedAt: new Date(parsed.completedAt) }),
    ...(parsed.createdAt && { createdAt: new Date(parsed.createdAt) }),
    ...(parsed.updatedAt && { updatedAt: new Date(parsed.updatedAt) }),
    id: id
  };
}
