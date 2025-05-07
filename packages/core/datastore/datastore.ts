import { DataStore } from '@superglue/shared';
import { RedisService } from './redis.js';
import { MemoryStore } from './memory.js';
import { FileStore } from './filestore.js';
import { PostgresStore } from './postgres.js';

export function createDataStore(config: {
  type: 'redis' | 'memory' | 'file' | 'postgres';
}): DataStore {
  if (config.type === 'redis') {
    const redisConfig = getRedisConfig();
    return new RedisService(redisConfig);
  }
  else if (config.type === 'file') {
    const fileStoreConfig = getFileStoreConfig();
    return new FileStore(fileStoreConfig.storageDir);
  }
  else if (config.type === 'postgres') {
    const postgresConfig = getPostgresConfig();
    return new PostgresStore(postgresConfig);
  }
  return new MemoryStore();
} 

export function getFileStoreConfig() {
  return {
    storageDir: process.env.STORAGE_DIR || '/data'
  };
}

export function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    username: process.env.REDIS_USERNAME!,
    password: process.env.REDIS_PASSWORD!
  };
}

export function getPostgresConfig() {
  return {
    host: process.env.PG_HOST!,
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD ,
    database: process.env.PG_DATABASE || 'superglue',
  };
}