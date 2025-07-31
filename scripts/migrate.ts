#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from 'redis';
import { PostgresService } from '../packages/core/datastore/postgres.js';
import { RedisService } from '../packages/core/datastore/redis.js';

dotenv.config();

// Configuration
const BATCH_SIZE = 500; // Process items in batches

interface MigrationStats {
  apiConfigs: number;
  extractConfigs: number;
  transformConfigs: number;
  workflows: number;
  integrations: number;
  runs: number;
  errors: string[];
}

async function getAllOrgIds(redis: any): Promise<string[]> {
  // Get all keys to find unique org IDs
  const allKeys = await redis.keys('*');
  const orgIds = new Set<string>();
  
  // Add empty string for items without orgId
  orgIds.add('');
  
  // Extract org IDs from keys (format: "orgId:prefix:id")
  allKeys.forEach((key: string) => {
    const parts = key.split(':');
    if (parts.length >= 3) {
      // If the key has at least 3 parts, the first might be an orgId
      const possibleOrgId = parts[0];
      // Check if it's not one of our known prefixes
      if (!['api', 'extract', 'transform', 'workflow', 'integration', 'run', 'tenant'].includes(possibleOrgId)) {
        orgIds.add(possibleOrgId);
      }
    }
  });
  
  return Array.from(orgIds);
}

async function migrateApiConfigs(redisService: RedisService, postgresService: PostgresService, orgId: string, stats: MigrationStats) {
  console.log(`  Migrating API configs for org: ${orgId || '(default)'}`);
  let offset = 0;
  
  while (true) {
    try {
      const { items, total } = await redisService.listApiConfigs({ limit: BATCH_SIZE, offset, orgId });
      
      if (items.length === 0) break;
      
      for (const config of items) {
        try {
          await postgresService.upsertApiConfig({ id: config.id, config, orgId });
          stats.apiConfigs++;
        } catch (error) {
          stats.errors.push(`Failed to migrate API config ${config.id}: ${error.message}`);
          console.error(`    Error migrating API config ${config.id}:`, error.message);
        }
      }
      
      console.log(`    Migrated ${Math.min(offset + items.length, total)}/${total} API configs`);
      
      if (offset + items.length >= total) break;
      offset += BATCH_SIZE;
    } catch (error) {
      stats.errors.push(`Failed to list API configs for org ${orgId}: ${error.message}`);
      console.error(`    Error listing API configs:`, error.message);
      break;
    }
  }
}

async function migrateExtractConfigs(redisService: RedisService, postgresService: PostgresService, orgId: string, stats: MigrationStats) {
  console.log(`  Migrating Extract configs for org: ${orgId || '(default)'}`);
  let offset = 0;
  
  while (true) {
    try {
      const { items, total } = await redisService.listExtractConfigs({ limit: BATCH_SIZE, offset, orgId });
      
      if (items.length === 0) break;
      
      for (const config of items) {
        try {
          await postgresService.upsertExtractConfig({ id: config.id, config, orgId });
          stats.extractConfigs++;
        } catch (error) {
          stats.errors.push(`Failed to migrate Extract config ${config.id}: ${error.message}`);
          console.error(`    Error migrating Extract config ${config.id}:`, error.message);
        }
      }
      
      console.log(`    Migrated ${Math.min(offset + items.length, total)}/${total} Extract configs`);
      
      if (offset + items.length >= total) break;
      offset += BATCH_SIZE;
    } catch (error) {
      stats.errors.push(`Failed to list Extract configs for org ${orgId}: ${error.message}`);
      console.error(`    Error listing Extract configs:`, error.message);
      break;
    }
  }
}

async function migrateTransformConfigs(redisService: RedisService, postgresService: PostgresService, orgId: string, stats: MigrationStats) {
  console.log(`  Migrating Transform configs for org: ${orgId || '(default)'}`);
  let offset = 0;
  
  while (true) {
    try {
      const { items, total } = await redisService.listTransformConfigs({ limit: BATCH_SIZE, offset, orgId });
      
      if (items.length === 0) break;
      
      for (const config of items) {
        try {
          await postgresService.upsertTransformConfig({ id: config.id, config, orgId });
          stats.transformConfigs++;
        } catch (error) {
          stats.errors.push(`Failed to migrate Transform config ${config.id}: ${error.message}`);
          console.error(`    Error migrating Transform config ${config.id}:`, error.message);
        }
      }
      
      console.log(`    Migrated ${Math.min(offset + items.length, total)}/${total} Transform configs`);
      
      if (offset + items.length >= total) break;
      offset += BATCH_SIZE;
    } catch (error) {
      stats.errors.push(`Failed to list Transform configs for org ${orgId}: ${error.message}`);
      console.error(`    Error listing Transform configs:`, error.message);
      break;
    }
  }
}

async function migrateWorkflows(redisService: RedisService, postgresService: PostgresService, orgId: string, stats: MigrationStats) {
  console.log(`  Migrating Workflows for org: ${orgId || '(default)'}`);
  let offset = 0;
  
  while (true) {
    try {
      const { items, total } = await redisService.listWorkflows({ limit: BATCH_SIZE, offset, orgId });
      
      if (items.length === 0) break;
      
      for (const workflow of items) {
        try {
          // Extract integration IDs from the workflow
          const integrationIds = workflow.integrationIds || [];
                      await postgresService.upsertWorkflow({ id: workflow.id, workflow, orgId });
          stats.workflows++;
        } catch (error) {
          stats.errors.push(`Failed to migrate Workflow ${workflow.id}: ${error.message}`);
          console.error(`    Error migrating Workflow ${workflow.id}:`, error.message);
        }
      }
      
      console.log(`    Migrated ${Math.min(offset + items.length, total)}/${total} Workflows`);
      
      if (offset + items.length >= total) break;
      offset += BATCH_SIZE;
    } catch (error) {
      stats.errors.push(`Failed to list Workflows for org ${orgId}: ${error.message}`);
      console.error(`    Error listing Workflows:`, error.message);
      break;
    }
  }
}

async function migrateIntegrations(redisService: RedisService, postgresService: PostgresService, orgId: string, stats: MigrationStats) {
  console.log(`  Migrating Integrations for org: ${orgId || '(default)'}`);
  let offset = 0;
  
  while (true) {
    try {
      const { items, total } = await redisService.listIntegrations({ limit: BATCH_SIZE, offset, includeDocs: true, orgId });
      
      if (items.length === 0) break;
      
      for (const integration of items) {
        try {
          await postgresService.upsertIntegration({ id: integration.id, integration, orgId });
          stats.integrations++;
        } catch (error) {
          stats.errors.push(`Failed to migrate Integration ${integration.id}: ${error.message}`);
          console.error(`    Error migrating Integration ${integration.id}:`, error.message);
        }
      }
      
      console.log(`    Migrated ${Math.min(offset + items.length, total)}/${total} Integrations`);
      
      if (offset + items.length >= total) break;
      offset += BATCH_SIZE;
    } catch (error) {
      stats.errors.push(`Failed to list Integrations for org ${orgId}: ${error.message}`);
      console.error(`    Error listing Integrations:`, error.message);
      break;
    }
  }
}

async function migrateRuns(redisService: RedisService, postgresService: PostgresService, orgId: string, stats: MigrationStats) {
  console.log(`  Migrating Runs for org: ${orgId || '(default)'}`);
  let offset = 0;
  
  while (true) {
    try {
      const { items, total } = await redisService.listRuns({ limit: BATCH_SIZE, offset, orgId });
      
      if (items.length === 0) break;
      
      for (const run of items) {
        try {
          await postgresService.createRun({ result: run, orgId });
          stats.runs++;
        } catch (error) {
          stats.errors.push(`Failed to migrate Run ${run.id}: ${error.message}`);
          console.error(`    Error migrating Run ${run.id}:`, error.message);
        }
      }
      
      console.log(`    Migrated ${Math.min(offset + items.length, total)}/${total} Runs`);
      
      if (offset + items.length >= total) break;
      offset += BATCH_SIZE;
    } catch (error) {
      stats.errors.push(`Failed to list Runs for org ${orgId}: ${error.message}`);
      console.error(`    Error listing Runs:`, error.message);
      break;
    }
  }
}

async function migrateTenantInfo(redisService: RedisService, postgresService: PostgresService) {
  console.log('Migrating Tenant Info...');
  try {
    const tenantInfo = await redisService.getTenantInfo();
    await postgresService.setTenantInfo({ email: tenantInfo.email, emailEntrySkipped: tenantInfo.emailEntrySkipped });
    console.log('  Tenant info migrated successfully');
  } catch (error) {
    console.error('  Error migrating tenant info:', error.message);
  }
}

async function main() {
  console.log('Starting Redis to Postgres migration...\n');
  
  // Initialize services
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD
  };
  
  const postgresConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'superglue',
    user: process.env.POSTGRES_USERNAME || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  };
  
  console.log('Connecting to Redis:', `${redisConfig.host}:${redisConfig.port}`);
  console.log('Connecting to Postgres:', `${postgresConfig.host}:${postgresConfig.port}/${postgresConfig.database}`);
  console.log('');
  
  const redisService = new RedisService(redisConfig);
  const postgresService = new PostgresService(postgresConfig);
  
  // Wait for connections
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check connections
  const redisConnected = await redisService.ping();
  const postgresConnected = await postgresService.ping();
  
  if (!redisConnected) {
    console.error('Failed to connect to Redis');
    process.exit(1);
  }
  
  if (!postgresConnected) {
    console.error('Failed to connect to Postgres');
    process.exit(1);
  }
  
  console.log('Connections established\n');
  
  // Create Redis client for getting all org IDs
  const redisClient = createClient({
    username: redisConfig.username,
    password: redisConfig.password,
    socket: {
      host: redisConfig.host,
      port: redisConfig.port
    }
  });
  await redisClient.connect();
  
  const stats: MigrationStats = {
    apiConfigs: 0,
    extractConfigs: 0,
    transformConfigs: 0,
    workflows: 0,
    integrations: 0,
    runs: 0,
    errors: []
  };
  
  try {
    // Get all organization IDs
    const orgIds = await getAllOrgIds(redisClient);
    console.log(`Found ${orgIds.length} organization(s) to migrate\n`);
    
    // Migrate data for each organization
    for (const orgId of orgIds) {
      console.log(`\nMigrating organization: ${orgId || '(default)'}`);
      console.log('='.repeat(50));
      
      await migrateApiConfigs(redisService, postgresService, orgId, stats);
      await migrateExtractConfigs(redisService, postgresService, orgId, stats);
      await migrateTransformConfigs(redisService, postgresService, orgId, stats);
      await migrateWorkflows(redisService, postgresService, orgId, stats);
      await migrateIntegrations(redisService, postgresService, orgId, stats);
      //await migrateRuns(redisService, postgresService, orgId, stats);
    }
    
    // Migrate tenant info (not org-specific)
    await migrateTenantInfo(redisService, postgresService);
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('Migration Summary:');
    console.log('='.repeat(50));
    console.log(`API Configs:       ${stats.apiConfigs}`);
    console.log(`Extract Configs:   ${stats.extractConfigs}`);
    console.log(`Transform Configs: ${stats.transformConfigs}`);
    console.log(`Workflows:         ${stats.workflows}`);
    console.log(`Integrations:      ${stats.integrations}`);
    console.log(`Runs:              ${stats.runs}`);
    console.log(`Total Errors:      ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('\nErrors encountered:');
      stats.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    console.log('\nMigration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Cleanup
    await redisClient.quit();
    await redisService.disconnect();
    await postgresService.disconnect();
  }
}

// Run the migration
main().catch(console.error);
