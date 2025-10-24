import { RequestOptions } from "@superglue/client";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { Pool, PoolConfig } from 'pg';
import { server_defaults } from "../default.js";

export interface PostgresExecutorInput {
    axiosConfig: AxiosRequestConfig;
    inputData: Record<string, any>;
    credentials: Record<string, any>;
    options: RequestOptions;
}

export interface PostgresExecutorResult {
    data: any;
    response: AxiosResponse;
}

export async function executePostgres(input: PostgresExecutorInput): Promise<PostgresExecutorResult> {
    const { axiosConfig, options } = input;
    
    const body = typeof axiosConfig.data === 'string' 
        ? JSON.parse(axiosConfig.data) 
        : axiosConfig.data || {};
    
    const query = body.query;
    const params = body.params || body.values;
    
    const data = await callPostgres({
        connectionString: axiosConfig.url,
        query,
        params,
        options
    });
    
    return {
        data,
        response: {
            data,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: axiosConfig as any
        } as AxiosResponse
    };
}

interface PoolCacheEntry {
  pool: Pool;
  lastUsed: number;
  connectionString: string;
}

const poolCache = new Map<string, PoolCacheEntry>();

let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of poolCache.entries()) {
        if (now - entry.lastUsed > server_defaults.POSTGRES.POOL_IDLE_TIMEOUT) {
          entry.pool.end().catch(console.error);
          poolCache.delete(key);
        }
      }
    }, server_defaults.POSTGRES.POOL_CLEANUP_INTERVAL);
    
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }
}

function getOrCreatePool(connectionString: string, poolConfig: PoolConfig): Pool {
  const cacheKey = connectionString;
  const existingEntry = poolCache.get(cacheKey);
  
  if (existingEntry) {
    existingEntry.lastUsed = Date.now();
    return existingEntry.pool;
  }
  
  const pool = new Pool({
    ...poolConfig,
    max: 10,
    idleTimeoutMillis: server_defaults.POSTGRES.DEFAULT_TIMEOUT,
    connectionTimeoutMillis: 5000,
  });
  
  pool.on('error', (err) => {
    console.error('Unexpected pool error:', err);
    poolCache.delete(cacheKey);
  });
  
  poolCache.set(cacheKey, {
    pool,
    lastUsed: Date.now(),
    connectionString
  });
  
  startCleanupInterval();
  
  return pool;
}

export async function closeAllPools(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  const closePromises = Array.from(poolCache.values()).map(entry => 
    entry.pool.end().catch(console.error)
  );
  
  await Promise.all(closePromises);
  poolCache.clear();
}

function sanitizeDatabaseName(connectionString: string): string {
  let cleanUrl = connectionString.replace(/\/+$/, '');

  const lastSlashIndex = cleanUrl.lastIndexOf('/');
  if (lastSlashIndex === -1) return cleanUrl;

  const baseUrl = cleanUrl.substring(0, lastSlashIndex + 1);
  const dbName = cleanUrl.substring(lastSlashIndex + 1);

  const cleanDbName = dbName
    .replace(/[^a-zA-Z0-9_$-]/g, '')
    .replace(/^-+|-+$/g, '');

  return baseUrl + cleanDbName;
}

export async function callPostgres({connectionString, query, params, options}: {connectionString: string, query: string, params?: any[], options: RequestOptions}): Promise<any> {  
  const poolConfig: PoolConfig = {
    connectionString: connectionString,
    statement_timeout: options?.timeout || server_defaults.POSTGRES.DEFAULT_TIMEOUT,
    ssl: connectionString.includes('sslmode=') || connectionString.includes('localhost') === false 
      ? { rejectUnauthorized: false }
      : false
  };

  const pool = getOrCreatePool(connectionString, poolConfig);
  let attempts = 0;
  const maxRetries = options?.retries || server_defaults.POSTGRES.DEFAULT_RETRIES;

  do {
    try {
      const result = await pool.query(query, params)
        return result.rows;
    } catch (error) {
      
      attempts++;

      if (attempts > maxRetries) {
        if (error instanceof Error) {
          const errorContext = params 
            ? ` for query: ${query} with params: ${JSON.stringify(params)}`
            : ` for query: ${query}`;
          throw new Error(`PostgreSQL error: ${error.message}${errorContext}`);
        }
        throw new Error('Unknown PostgreSQL error occurred');
      }

      const retryDelay = options?.retryDelay || server_defaults.POSTGRES.DEFAULT_RETRY_DELAY;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);
}

