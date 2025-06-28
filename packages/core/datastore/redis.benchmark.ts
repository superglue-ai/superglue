import { ApiConfig, HttpMethod } from '@superglue/client';
import { RedisService } from './redis.js';

// Original implementation of listApiConfigs with N+1 query pattern
async function listApiConfigsOriginal(
  redis: RedisService,
  limit = 10,
  offset = 0,
  orgId?: string
): Promise<{ items: ApiConfig[], total: number }> {
  const pattern = (redis as any).getPattern((redis as any).API_PREFIX, orgId);
  const keys = await (redis as any).redis.keys(pattern);
  const slicedKeys = keys.slice(offset, offset + limit);

  const configs = await Promise.all(
    slicedKeys.map(async (key: string) => {
      const data = await (redis as any).redis.get(key);
      const id = key.split(':').pop()!.replace((redis as any).API_PREFIX, '');
      return (redis as any).parseWithId(data, id);
    })
  );
  return { 
    items: configs.filter((config: any): config is ApiConfig => config !== null), 
    total: keys.length 
  };
}

// Run benchmark
async function runBenchmark() {
  // Connect to Redis
  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD
  };
  
  const redisService = new RedisService(config);
  const testOrgId = 'benchmark-org';
  
  try {
    console.log('Starting Redis benchmark...');
    await redisService.clearAll(testOrgId);
    
    // Generate test data
    const dataSize = parseInt(process.env.BENCHMARK_SIZE || '100');
    console.log(`Generating ${dataSize} test API configs...`);
    
    const configs: ApiConfig[] = [];
    for (let i = 0; i < dataSize; i++) {
      configs.push({
        id: `benchmark-api-${i}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        urlHost: `https://benchmark-${i}.com`,
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: `Benchmark API ${i}`,
      });
    }
    
    // Insert test data
    console.log('Inserting test data...');
    await Promise.all(
      configs.map(config => redisService.upsertApiConfig(config.id, config, testOrgId))
    );
    
    // Warm up Redis
    await redisService.listApiConfigs(10, 0, testOrgId);
    await listApiConfigsOriginal(redisService, 10, 0, testOrgId);
    
    // Benchmark: Original N+1 implementation
    console.log('\nBenchmarking original N+1 implementation...');
    const originalStartTime = performance.now();
    await listApiConfigsOriginal(redisService, dataSize, 0, testOrgId);
    const originalEndTime = performance.now();
    const originalDuration = originalEndTime - originalStartTime;
    
    // Benchmark: Optimized MGET implementation
    console.log('Benchmarking optimized MGET implementation...');
    const optimizedStartTime = performance.now();
    await redisService.listApiConfigs(dataSize, 0, testOrgId);
    const optimizedEndTime = performance.now();
    const optimizedDuration = optimizedEndTime - optimizedStartTime;
    
    // Calculate improvement
    const improvementPercent = ((originalDuration - optimizedDuration) / originalDuration) * 100;
    
    // Report results
    console.log('\n=== Benchmark Results ===');
    console.log(`Dataset size: ${dataSize} items`);
    console.log(`Original N+1 implementation: ${originalDuration.toFixed(2)}ms`);
    console.log(`Optimized MGET implementation: ${optimizedDuration.toFixed(2)}ms`);
    console.log(`Improvement: ${improvementPercent.toFixed(2)}%`);
    console.log(`Time saved: ${(originalDuration - optimizedDuration).toFixed(2)}ms`);
    console.log('========================');
    
  } catch (error) {
    console.error('Benchmark error:', error);
  } finally {
    // Clean up
    await redisService.clearAll(testOrgId);
    await redisService.disconnect();
  }
}

// Run benchmark if executed directly
if (require.main === module) {
  runBenchmark()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { runBenchmark };