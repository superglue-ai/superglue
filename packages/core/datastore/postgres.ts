import { DataStore } from '@superglue/shared';
import { Pool, PoolClient } from 'pg';
import { getPostgresConfig } from './datastore.js';
import type { ApiConfig, ExtractConfig, RunResult, Workflow, TransformConfig } from '@superglue/shared';

export class PostgresStore implements DataStore {
  private pool: Pool;

  constructor(config: ReturnType<typeof getPostgresConfig>) {
    this.pool = new Pool(config);
    this.initializeSchema();
  }

  // Initialize database schema
  private async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS api_configs (
          id TEXT PRIMARY KEY,
          org_id TEXT,
          config JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS extract_configs (
          id TEXT PRIMARY KEY,
          org_id TEXT,
          config JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS transform_configs (
          id TEXT PRIMARY KEY,
          org_id TEXT,
          config JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          org_id TEXT,
          config JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          org_id TEXT,
          config_id TEXT NOT NULL,
          data JSONB NOT NULL,
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          success BOOLEAN DEFAULT FALSE
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE,
          email_entry_skipped BOOLEAN DEFAULT FALSE
        )
      `);
    } finally {
      client.release();
    }
  }

  // Helper method for querying the database
  private async withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  // Utility functions for mapping fields
  private mapRowToConfig<T extends { [key: string]: any }>(row: any): T {
    if (!row) return row;
    const mapped: any = { ...row };
    if ('created_at' in mapped) {
      mapped.createdAt = mapped.created_at ? new Date(mapped.created_at) : undefined;
      delete mapped.created_at;
    }
    if ('updated_at' in mapped) {
      mapped.updatedAt = mapped.updated_at ? new Date(mapped.updated_at) : undefined;
      delete mapped.updated_at;
    }
    if ('config' in mapped && typeof mapped.config === 'object') {
      Object.assign(mapped, mapped.config);
      delete mapped.config;
    }
    return mapped;
  }

  private mapRowToRunResult(row: any): any {
    if (!row) return row;
    const mapped: any = { ...row };
    if ('started_at' in mapped) {
      mapped.startedAt = mapped.started_at ? new Date(mapped.started_at) : undefined;
      delete mapped.started_at;
    }
    if ('completed_at' in mapped) {
      mapped.completedAt = mapped.completed_at ? new Date(mapped.completed_at) : undefined;
      delete mapped.completed_at;
    }
    if ('data' in mapped && typeof mapped.data === 'object') {
      Object.assign(mapped, mapped.data);
      delete mapped.data;
    }
    return mapped;
  }

  // API Config Methods
  async getApiConfig(id: string, orgId?: string): Promise<ApiConfig | null> {
    id = id.replace('%3A', ':');
    const result = await this.withClient(async (client) => {
      const res = await client.query('SELECT * FROM api_configs WHERE id = $1 AND ($2::TEXT IS NULL OR org_id = $2::TEXT)', [id, orgId || null]);
      return res.rows[0] || null;
    });
    return result ? this.mapRowToConfig<ApiConfig>(result) : null;
  }

  async listApiConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: ApiConfig[], total: number }> {
    const result = await this.withClient(async (client) => {
      const countRes = await client.query('SELECT COUNT(*) FROM api_configs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT', [orgId || null]);
      const total = parseInt(countRes.rows[0].count);

      const res = await client.query(
        'SELECT * FROM api_configs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT ORDER BY id LIMIT $2 OFFSET $3', 
        [orgId || null, limit, offset]
      );

      return { items: res.rows, total };
    });

    return { 
      items: result.items.map((item: any) => this.mapRowToConfig<ApiConfig>(item)), 
      total: result.total 
    };
  }

  async upsertApiConfig(id: string, config: ApiConfig, orgId?: string): Promise<ApiConfig> {
    const createdAt = config.createdAt instanceof Date
      ? config.createdAt.toISOString()
      : (typeof config.createdAt === 'string' ? config.createdAt : new Date().toISOString());
    const updatedAt = config.updatedAt instanceof Date
      ? config.updatedAt.toISOString()
      : (typeof config.updatedAt === 'string' ? config.updatedAt : new Date().toISOString());
    await this.withClient(async (client) => {
      await client.query(
        'INSERT INTO api_configs (id, org_id, config, created_at, updated_at) VALUES ($1, $2::TEXT, $3, $4, $5) '
        + 'ON CONFLICT (id) DO UPDATE SET org_id = $2::TEXT, config = $3, updated_at = $5',
        [
          id,
          orgId || null,
          JSON.stringify(config),
          createdAt,
          updatedAt
        ]
      );
    });
    return config;
  }

  async deleteApiConfig(id: string, orgId?: string): Promise<boolean> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('DELETE FROM api_configs WHERE id = $1 AND ($2 IS NULL OR org_id = $2) RETURNING id', [id, orgId]);
      return res.rowCount > 0;
    });
    return result;
  }

  // Extract Methods
  async getExtractConfig(id: string, orgId?: string): Promise<ExtractConfig | null> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('SELECT * FROM extract_configs WHERE id = $1 AND ($2 IS NULL OR org_id = $2)', [id, orgId]);
      return res.rows[0] || null;
    });
    return result ? this.mapRowToConfig<ExtractConfig>(result) : null;
  }

  async listExtractConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: ExtractConfig[], total: number }> {
    const result = await this.withClient(async (client) => {
      const countRes = await client.query('SELECT COUNT(*) FROM extract_configs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT', [orgId || null]);
      const total = parseInt(countRes.rows[0].count);

      const res = await client.query(
        'SELECT * FROM extract_configs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT ORDER BY id LIMIT $2 OFFSET $3', 
        [orgId || null, limit, offset]
      );

      return { items: res.rows, total };
    });

    return { 
      items: result.items.map((item: any) => this.mapRowToConfig<ExtractConfig>(item)), 
      total: result.total 
    };
  }

  async upsertExtractConfig(id: string, config: ExtractConfig, orgId?: string): Promise<ExtractConfig> {
    const createdAt = config.createdAt instanceof Date
      ? config.createdAt.toISOString()
      : (typeof config.createdAt === 'string' ? config.createdAt : new Date().toISOString());
    const updatedAt = config.updatedAt instanceof Date
      ? config.updatedAt.toISOString()
      : (typeof config.updatedAt === 'string' ? config.updatedAt : new Date().toISOString());
    await this.withClient(async (client) => {
      await client.query(
        'INSERT INTO extract_configs (id, org_id, config, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) '
        + 'ON CONFLICT (id) DO UPDATE SET org_id = $2, config = $3, updated_at = $5',
        [
          id,
          orgId,
          JSON.stringify(config),
          createdAt,
          updatedAt
        ]
      );
    });
    return config;
  }

  async deleteExtractConfig(id: string, orgId?: string): Promise<boolean> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('DELETE FROM extract_configs WHERE id = $1 AND ($2 IS NULL OR org_id IS NOT DISTINCT FROM $2) RETURNING id', [id, orgId]);
      return res.rowCount > 0;
    });
    return result;
  }

  // Transform Methods
  async getTransformConfig(id: string, orgId?: string): Promise<TransformConfig | null> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('SELECT * FROM transform_configs WHERE id = $1 AND ($2::TEXT IS NULL OR org_id = $2::TEXT)', [id, orgId || null]);
      return res.rows[0] || null;
    });
    return result ? this.mapRowToConfig<TransformConfig>(result) : null;
  }

  async listTransformConfigs(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: TransformConfig[], total: number }> {
    const result = await this.withClient(async (client) => {
      const countRes = await client.query('SELECT COUNT(*) FROM transform_configs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT', [orgId || null]);
      const total = parseInt(countRes.rows[0].count);

      const res = await client.query(
        'SELECT * FROM transform_configs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT ORDER BY id LIMIT $2 OFFSET $3', 
        [orgId || null, limit, offset]
      );

      return { items: res.rows, total };
    });

    return { 
      items: result.items.map((item: any) => this.mapRowToConfig<TransformConfig>(item)), 
      total: result.total 
    };
  }

  async upsertTransformConfig(id: string, config: TransformConfig, orgId?: string): Promise<TransformConfig> {
    const createdAt = config.createdAt instanceof Date
      ? config.createdAt.toISOString()
      : (typeof config.createdAt === 'string' ? config.createdAt : new Date().toISOString());
    const updatedAt = config.updatedAt instanceof Date
      ? config.updatedAt.toISOString()
      : (typeof config.updatedAt === 'string' ? config.updatedAt : new Date().toISOString());
    await this.withClient(async (client) => {
      await client.query(
        'INSERT INTO transform_configs (id, org_id, config, created_at, updated_at) VALUES ($1, $2::TEXT, $3, $4, $5) '
        + 'ON CONFLICT (id) DO UPDATE SET org_id = $2::TEXT, config = $3, updated_at = $5',
        [
          id,
          orgId || null,
          JSON.stringify(config),
          createdAt,
          updatedAt
        ]
      );
    });
    return config;
  }

  async deleteTransformConfig(id: string, orgId?: string): Promise<boolean> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('DELETE FROM transform_configs WHERE id = $1 AND ($2 IS NULL OR org_id = $2) RETURNING id', [id, orgId]);
      return res.rowCount > 0;
    });
    return result;
  }

  // Run Result Methods
  async getRun(id: string, orgId?: string): Promise<RunResult | null> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('SELECT * FROM runs WHERE id = $1 AND ($2 IS NULL OR org_id = $2)', [id, orgId]);
      const row = res.rows[0] || null;
      return row ? this.mapRowToRunResult(row) : null;
    });
    return result;
  }

  async listRuns(limit: number = 10, offset: number = 0, configId?: string, orgId?: string): Promise<{ items: RunResult[], total: number }> {
    const result = await this.withClient(async (client) => {
      let query = 'SELECT * FROM runs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT';
      if (configId) {
        query += ' AND config_id = $2';
      }
      query += ' ORDER BY id LIMIT $' + (configId ? '3' : '2') + ' OFFSET $' + (configId ? '4' : '3');
      const params = configId ? [orgId || null, configId, limit, offset] : [orgId || null, limit, offset];
      const res = await client.query(query, params);

      const countQuery = 'SELECT COUNT(*) FROM runs WHERE $1::TEXT IS NULL OR org_id = $1::TEXT' + (configId ? ' AND config_id = $2' : '');
      const countParams = configId ? [orgId || null, configId] : [orgId || null];
      const total = parseInt((await client.query(countQuery, countParams)).rows[0].count);

      return {
        items: res.rows.map((item: any) => this.mapRowToRunResult(item)),
        total
      };
    });
    return result;
  }

  async createRun(result: RunResult, orgId?: string): Promise<RunResult> {
    await this.withClient(async (client) => {
      await client.query(
        'INSERT INTO runs (id, org_id, config_id, data, started_at, completed_at, success) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          result.id,
          orgId,
          result.config?.id,
          JSON.stringify(result),
          result.startedAt ? result.startedAt.toISOString() : new Date().toISOString(),
          result.completedAt ? result.completedAt.toISOString() : new Date().toISOString(),
          result.success ?? false
        ]
      );
    });
    return result;
  }

  async deleteRun(id: string, orgId?: string): Promise<boolean> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('DELETE FROM runs WHERE id = $1 AND ($2 IS NULL OR org_id = $2) RETURNING id', [id, orgId]);
      return res.rowCount > 0;
    });
    return result;
  }

  async deleteAllRuns(orgId?: string): Promise<boolean> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('DELETE FROM runs WHERE $1 IS NULL OR org_id = $1 RETURNING id', [orgId]);
      return res.rowCount > 0;
    });
    return result;
  }

  // Workflow Methods
  async getWorkflow(id: string, orgId?: string): Promise<Workflow | null> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('SELECT * FROM workflows WHERE id = $1 AND ($2 IS NULL OR org_id = $2)', [id, orgId]);
      return res.rows[0] || null;
    });
    return result ? this.mapRowToConfig<Workflow>(result) : null;
  }

  async listWorkflows(limit: number = 10, offset: number = 0, orgId?: string): Promise<{ items: Workflow[], total: number }> {
    const result = await this.withClient(async (client) => {
      const countRes = await client.query(
        'SELECT COUNT(*) FROM workflows WHERE $1::TEXT IS NULL OR org_id = $1::TEXT',
        [orgId || null]
      );
      const total = parseInt(countRes.rows[0].count);

      const res = await client.query(
        'SELECT * FROM workflows WHERE $1::TEXT IS NULL OR org_id = $1::TEXT ORDER BY id LIMIT $2 OFFSET $3',
        [orgId || null, limit, offset]
      );

      return { items: res.rows, total };
    });

    return { 
      items: result.items.map((item: any) => this.mapRowToConfig<Workflow>(item)), 
      total: result.total 
    };
  }

  async upsertWorkflow(id: string, workflow: Workflow, orgId?: string): Promise<Workflow> {
    const createdAt = workflow.createdAt instanceof Date
      ? workflow.createdAt.toISOString()
      : (typeof workflow.createdAt === 'string' ? workflow.createdAt : new Date().toISOString());
    const updatedAt = workflow.updatedAt instanceof Date
      ? workflow.updatedAt.toISOString()
      : (typeof workflow.updatedAt === 'string' ? workflow.updatedAt : new Date().toISOString());
    await this.withClient(async (client) => {
      await client.query(
        'INSERT INTO workflows (id, org_id, config, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) '
        + 'ON CONFLICT (id) DO UPDATE SET org_id = $2, config = $3, updated_at = $5',
        [
          id,
          orgId,
          JSON.stringify(workflow),
          createdAt,
          updatedAt
        ]
      );
    });
    return workflow;
  }

  async deleteWorkflow(id: string, orgId?: string): Promise<boolean> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('DELETE FROM workflows WHERE id = $1 AND ($2 IS NULL OR org_id = $2) RETURNING id', [id, orgId]);
      return res.rowCount > 0;
    });
    return result;
  }

  // Tenant Information Methods
  async getTenantInfo(): Promise<{ email: string | null, emailEntrySkipped: boolean }> {
    const result = await this.withClient(async (client) => {
      const res = await client.query('SELECT email, email_entry_skipped FROM tenants LIMIT 1');
      return res.rows[0] || { email: null, email_entry_skipped: false };
    });
    
    return {
      email: result.email,
      emailEntrySkipped: result.email_entry_skipped
    };
  }

  async setTenantInfo(email?: string, emailEntrySkipped?: boolean): Promise<void> {
    await this.withClient(async (client) => {
      if (email !== undefined && emailEntrySkipped !== undefined) {
        await client.query(
          'INSERT INTO tenants (email, email_entry_skipped) VALUES ($1, $2) '
          + 'ON CONFLICT (email) DO UPDATE SET email = $1, email_entry_skipped = $2',
          [email, emailEntrySkipped]
        );
      } else if (email !== undefined) {
        await client.query(
          'INSERT INTO tenants (email) VALUES ($1) '
          + 'ON CONFLICT (email) DO UPDATE SET email = $1',
          [email]
        );
      } else if (emailEntrySkipped !== undefined) {
        await client.query(
          'INSERT INTO tenants (email_entry_skipped) VALUES ($1) '
          + 'ON CONFLICT (email_entry_skipped) DO UPDATE SET email_entry_skipped = $1',
          [emailEntrySkipped]
        );
      }
    });
  }
}