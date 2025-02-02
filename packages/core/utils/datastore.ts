import { DataStore } from '@superglue/shared';
import { RedisService } from './redis.js';
import { MemoryStore } from './memory.js';

export function createDataStore(config: {
  type: 'redis' | 'memory';
}): DataStore {
  if (config.type === 'redis') {
    const redisConfig = getRedisConfig();
    return new RedisService(redisConfig);
  }
  return new MemoryStore();
} 

export function getRedisConfig() {
    return {
      host: process.env.REDIS_HOST!,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      username: process.env.REDIS_USERNAME!,
      password: process.env.REDIS_PASSWORD!
    };
  }
  