import { FileStore } from './filestore.js';
import { MemoryStore } from './memory.js';
import { PostgresService } from './postgres.js';
import { DataStore } from './types.js';

export function createDataStore(config: {
  type: 'redis' | 'memory' | 'file' | 'postgres';
}): DataStore {
  if (config.type === 'file') {
    const fileStoreConfig = getFileStoreConfig();
    return new FileStore(fileStoreConfig.storageDir);
  }
  else if (config.type === 'postgres') {
    const postgresConfig = getPostgresConfig();
    return new PostgresService(postgresConfig);
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
    host: process.env.POSTGRES_HOST!,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USERNAME!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    ssl: process.env.POSTGRES_SSL === 'false' ? false : true,
  };
}