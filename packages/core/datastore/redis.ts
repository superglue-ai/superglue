import { createClient, RedisClientType } from 'redis';
import { ApiConfig, ApiInput, ExtractConfig, ExtractInput, TransformConfig, TransformInput, RunResult } from "@superglue/shared";
import objectHash from 'object-hash';
import { getAllKeys } from '../utils/tools.js';
import { DataStore } from '@superglue/shared';

export class RedisService implements DataStore {
  private redis: RedisClientType;
  private readonly RUN_PREFIX = 'run:';
  private readonly API_PREFIX = 'api:';
  private readonly EXTRACT_PREFIX = 'extract:';
  private readonly TRANSFORM_PREFIX = 'transform:';
  private readonly TTL = 60 * 60 * 24 * 30; // 30 days

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

  async listRuns(limit: number = 10, offset: number = 0): Promise<{ items: RunResult[], total: number }> {
    const runIds = await this.redis.zRange('runs:index', -offset - limit, -(offset + 1));
    
    const runs = await Promise.all(
      runIds.map(async (id) => {
        const data = await this.redis.get(`${this.RUN_PREFIX}${id}`);
        return parseWithId(data, id);
      })
    );
    return { items: runs.filter((run): run is RunResult => run !== null), total: runIds.length };
  }

  async deleteAllRuns(): Promise<void> {
    const runIds = await this.redis.zRange('runs:index', 0, -1);
    
    const multi = this.redis.multi();
    
    // Delete all run records
    for (const id of runIds) {
      multi.del(`${this.RUN_PREFIX}${id}`);
    }
    
    // Delete the index
    multi.del('runs:index');
    
    await multi.exec();
  }

  async createRun(run: RunResult): Promise<RunResult> {
    const key = `${this.RUN_PREFIX}${run.id}`;
    const timestamp = run.startedAt.getTime();
    
    const multi = this.redis.multi();
    
    multi.set(key, JSON.stringify(run), {
        EX: this.TTL
    });
    
    multi.zAdd('runs:index', {
        score: timestamp,
        value: run.id
    });

    await multi.exec();
    return run;
  }

  async deleteRun(id: string): Promise<boolean> {
    const result = await this.redis.del(`${this.RUN_PREFIX}${id}`);
    return result === 1;
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
  return { ...JSON.parse(data), id: id };
}
