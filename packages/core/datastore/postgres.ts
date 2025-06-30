import type { ApiConfig, ExtractConfig, Integration, RunResult, TransformConfig, Workflow } from "@superglue/client";
import { Pool, PoolConfig } from 'pg';
import { logMessage } from "../utils/logs.js";
import type { DataStore } from "./types.js";

type ConfigType = 'api' | 'extract' | 'transform' | 'workflow';
type ConfigData = ApiConfig | ExtractConfig | TransformConfig | Workflow;

export class PostgresService implements DataStore {
    private pool: Pool;

    constructor(config: PoolConfig) {
        this.pool = new Pool({
            ...config,
            ssl: config.ssl || {
                rejectUnauthorized: false
            }
        });

        this.pool.on('error', (err) => {
            console.error('postgres pool error:', err);
        });

        this.pool.on('connect', () => {
            logMessage('info', '🐘 postgres connected');
        });

        this.initializeTables();
    }

    private async initializeTables(): Promise<void> {
        const client = await this.pool.connect();
        try {
            // Unified configurations table (merged configs + workflows)
            await client.query(`
        CREATE TABLE IF NOT EXISTS configurations (
          id VARCHAR(255) NOT NULL,
          org_id VARCHAR(255),
          type VARCHAR(20) NOT NULL CHECK (type IN ('api', 'extract', 'transform', 'workflow')),
          version VARCHAR(50),
          data JSONB NOT NULL,
          integration_ids VARCHAR(255)[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id, type, org_id)
        )
      `);

            // Runs table
            await client.query(`
        CREATE TABLE IF NOT EXISTS runs (
          id VARCHAR(255) NOT NULL,
          config_id VARCHAR(255),
          org_id VARCHAR(255),
          data JSONB NOT NULL,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id, org_id)
        )
      `);

            // Integrations table
            await client.query(`
        CREATE TABLE IF NOT EXISTS integrations (
          id VARCHAR(255) NOT NULL,
          org_id VARCHAR(255),
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id, org_id)
        )
      `);

            // Tenant info table
            await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_info (
          id VARCHAR(10) DEFAULT 'default',
          email VARCHAR(255),
          email_entry_skipped BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);

            // Create indexes for better performance
            await client.query(`CREATE INDEX IF NOT EXISTS idx_configurations_type_org ON configurations(type, org_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_configurations_version ON configurations(version)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_configurations_integration_ids ON configurations USING GIN(integration_ids)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_runs_config_id ON runs(config_id, org_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at)`);
        } finally {
            client.release();
        }
    }

    private extractVersion(config: ConfigData): string | null {
        return (config as any)?.version || null;
    }

    private async getConfig<T extends ConfigData>(id: string, type: ConfigType, orgId?: string): Promise<T | null> {
        if (!id) return null;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT data FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3',
                [id, type, orgId || '']
            );
            return result.rows[0] ? { ...result.rows[0].data, id } : null;
        } finally {
            client.release();
        }
    }

    private async listConfigs<T extends ConfigData>(type: ConfigType, limit = 10, offset = 0, orgId?: string): Promise<{ items: T[], total: number }> {
        const client = await this.pool.connect();
        try {
            const countResult = await client.query(
                'SELECT COUNT(*) FROM configurations WHERE type = $1 AND org_id = $2',
                [type, orgId || '']
            );
            const total = parseInt(countResult.rows[0].count);

            const result = await client.query(
                'SELECT id, data FROM configurations WHERE type = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
                [type, orgId || '', limit, offset]
            );

            const items = result.rows.map(row => ({ ...row.data, id: row.id }));
            return { items, total };
        } finally {
            client.release();
        }
    }

    private async upsertConfig<T extends ConfigData>(id: string, config: T, type: ConfigType, orgId?: string, integrationIds: string[] = []): Promise<T> {
        if (!id || !config) return null;
        const client = await this.pool.connect();
        try {
            const version = this.extractVersion(config);
            await client.query(`
        INSERT INTO configurations (id, org_id, type, version, data, integration_ids, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (id, type, org_id) 
        DO UPDATE SET data = $5, version = $4, integration_ids = $6, updated_at = CURRENT_TIMESTAMP
      `, [id, orgId || '', type, version, JSON.stringify(config), integrationIds]);

            return { ...config, id };
        } finally {
            client.release();
        }
    }

    private async deleteConfig(id: string, type: ConfigType, orgId?: string): Promise<boolean> {
        if (!id) return false;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'DELETE FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3',
                [id, type, orgId || '']
            );
            return result.rowCount > 0;
        } finally {
            client.release();
        }
    }

    // API Config Methods
    async getApiConfig(id: string, orgId?: string): Promise<ApiConfig | null> {
        return this.getConfig<ApiConfig>(id, 'api', orgId);
    }

    async listApiConfigs(limit = 10, offset = 0, orgId?: string): Promise<{ items: ApiConfig[], total: number }> {
        return this.listConfigs<ApiConfig>('api', limit, offset, orgId);
    }

    async upsertApiConfig(id: string, config: ApiConfig, orgId?: string): Promise<ApiConfig> {
        return this.upsertConfig(id, config, 'api', orgId);
    }

    async deleteApiConfig(id: string, orgId?: string): Promise<boolean> {
        return this.deleteConfig(id, 'api', orgId);
    }

    // Extract Config Methods
    async getExtractConfig(id: string, orgId?: string): Promise<ExtractConfig | null> {
        return this.getConfig<ExtractConfig>(id, 'extract', orgId);
    }

    async listExtractConfigs(limit = 10, offset = 0, orgId?: string): Promise<{ items: ExtractConfig[], total: number }> {
        return this.listConfigs<ExtractConfig>('extract', limit, offset, orgId);
    }

    async upsertExtractConfig(id: string, config: ExtractConfig, orgId?: string): Promise<ExtractConfig> {
        return this.upsertConfig(id, config, 'extract', orgId);
    }

    async deleteExtractConfig(id: string, orgId?: string): Promise<boolean> {
        return this.deleteConfig(id, 'extract', orgId);
    }

    // Transform Config Methods
    async getTransformConfig(id: string, orgId?: string): Promise<TransformConfig | null> {
        return this.getConfig<TransformConfig>(id, 'transform', orgId);
    }

    async listTransformConfigs(limit = 10, offset = 0, orgId?: string): Promise<{ items: TransformConfig[], total: number }> {
        return this.listConfigs<TransformConfig>('transform', limit, offset, orgId);
    }

    async upsertTransformConfig(id: string, config: TransformConfig, orgId?: string): Promise<TransformConfig> {
        return this.upsertConfig(id, config, 'transform', orgId);
    }

    async deleteTransformConfig(id: string, orgId?: string): Promise<boolean> {
        return this.deleteConfig(id, 'transform', orgId);
    }

    // Run Result Methods
    async getRun(id: string, orgId?: string): Promise<RunResult | null> {
        if (!id) return null;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT data FROM runs WHERE id = $1 AND org_id = $2',
                [id, orgId || '']
            );
            if (!result.rows[0]) return null;

            const run = result.rows[0].data;
            return {
                ...run,
                id,
                startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
                completedAt: run.completedAt ? new Date(run.completedAt) : undefined
            };
        } finally {
            client.release();
        }
    }

    async listRuns(limit = 10, offset = 0, configId?: string, orgId?: string): Promise<{ items: RunResult[], total: number }> {
        const client = await this.pool.connect();
        try {
            let countQuery = 'SELECT COUNT(*) FROM runs WHERE org_id = $1';
            let selectQuery = 'SELECT id, data FROM runs WHERE org_id = $1';
            let params = [orgId || ''];

            if (configId) {
                countQuery += ' AND config_id = $2';
                selectQuery += ' AND config_id = $2';
                params.push(configId);
            }

            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count);

            selectQuery += ' ORDER BY started_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            params.push(String(limit), String(offset));

            const result = await client.query(selectQuery, params);

            const items = result.rows.map(row => {
                const run = row.data;
                return {
                    ...run,
                    id: row.id,
                    startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
                    completedAt: run.completedAt ? new Date(run.completedAt) : undefined
                };
            });

            return { items, total };
        } finally {
            client.release();
        }
    }

    async createRun(run: RunResult, orgId?: string): Promise<RunResult> {
        if (!run) return null;
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO runs (id, config_id, org_id, data, started_at, completed_at) 
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id, org_id) 
        DO UPDATE SET data = $4, started_at = $5, completed_at = $6
      `, [
                run.id,
                run.config?.id,
                orgId || '',
                JSON.stringify(run),
                run.startedAt,
                run.completedAt
            ]);

            return run;
        } finally {
            client.release();
        }
    }

    async deleteRun(id: string, orgId?: string): Promise<boolean> {
        if (!id) return false;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'DELETE FROM runs WHERE id = $1 AND org_id = $2',
                [id, orgId || '']
            );
            return result.rowCount > 0;
        } finally {
            client.release();
        }
    }

    async deleteAllRuns(orgId?: string): Promise<boolean> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'DELETE FROM runs WHERE org_id = $1',
                [orgId || '']
            );
            return result.rowCount > 0;
        } finally {
            client.release();
        }
    }

    // Workflow Methods (now using configurations table)
    async getWorkflow(id: string, orgId?: string): Promise<Workflow | null> {
        return this.getConfig<Workflow>(id, 'workflow', orgId);
    }

    async listWorkflows(limit = 10, offset = 0, orgId?: string): Promise<{ items: Workflow[], total: number }> {
        return this.listConfigs<Workflow>('workflow', limit, offset, orgId);
    }

    async upsertWorkflow(id: string, workflow: Workflow, orgId?: string, integrationIds: string[] = []): Promise<Workflow> {
        return this.upsertConfig(id, workflow, 'workflow', orgId, integrationIds);
    }

    async deleteWorkflow(id: string, orgId?: string): Promise<boolean> {
        return this.deleteConfig(id, 'workflow', orgId);
    }

    // Get workflow with integration dependencies
    async getWorkflowWithIntegrations(id: string, orgId?: string): Promise<{ workflow: Workflow | null, integrations: Integration[] }> {
        if (!id) return { workflow: null, integrations: [] };
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT data, integration_ids FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3',
                [id, 'workflow', orgId || '']
            );

            if (!result.rows[0]) {
                return { workflow: null, integrations: [] };
            }

            const workflow = { ...result.rows[0].data, id };
            const integrationIds = result.rows[0].integration_ids || [];

            if (integrationIds.length === 0) {
                return { workflow, integrations: [] };
            }

            const integrationsResult = await client.query(
                'SELECT id, data FROM integrations WHERE id = ANY($1) AND org_id = $2',
                [integrationIds, orgId || '']
            );

            const integrations = integrationsResult.rows.map(row => ({ ...row.data, id: row.id }));

            return { workflow, integrations };
        } finally {
            client.release();
        }
    }

    // Integration Methods
    async getIntegration(id: string, orgId?: string): Promise<Integration | null> {
        if (!id) return null;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT data FROM integrations WHERE id = $1 AND org_id = $2',
                [id, orgId || '']
            );
            return result.rows[0] ? { ...result.rows[0].data, id } : null;
        } finally {
            client.release();
        }
    }

    async listIntegrations(limit = 10, offset = 0, orgId?: string): Promise<{ items: Integration[], total: number }> {
        const client = await this.pool.connect();
        try {
            const countResult = await client.query(
                'SELECT COUNT(*) FROM integrations WHERE org_id = $1',
                [orgId || '']
            );
            const total = parseInt(countResult.rows[0].count);

            const result = await client.query(
                'SELECT id, data FROM integrations WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
                [orgId || '', limit, offset]
            );

            const items = result.rows.map(row => ({ ...row.data, id: row.id }));
            return { items, total };
        } finally {
            client.release();
        }
    }

    async upsertIntegration(id: string, integration: Integration, orgId?: string): Promise<Integration> {
        if (!id || !integration) return null;
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO integrations (id, org_id, data, updated_at) 
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (id, org_id) 
        DO UPDATE SET data = $3, updated_at = CURRENT_TIMESTAMP
      `, [id, orgId || '', JSON.stringify(integration)]);

            return { ...integration, id };
        } finally {
            client.release();
        }
    }

    async deleteIntegration(id: string, orgId?: string): Promise<boolean> {
        if (!id) return false;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'DELETE FROM integrations WHERE id = $1 AND org_id = $2',
                [id, orgId || '']
            );
            return result.rowCount > 0;
        } finally {
            client.release();
        }
    }

    // Tenant Information Methods
    async getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT email, email_entry_skipped FROM tenant_info WHERE id = $1', ['default']);
            if (result.rows[0]) {
                return {
                    email: result.rows[0].email,
                    emailEntrySkipped: result.rows[0].email_entry_skipped
                };
            }
            return { email: null, emailEntrySkipped: false };
        } catch (error) {
            console.error('Error getting tenant info:', error);
            return { email: null, emailEntrySkipped: false };
        } finally {
            client.release();
        }
    }

    async setTenantInfo(email?: string, emailEntrySkipped?: boolean): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO tenant_info (id, email, email_entry_skipped, updated_at) 
        VALUES ('default', $1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (id) 
        DO UPDATE SET 
          email = COALESCE($1, tenant_info.email),
          email_entry_skipped = COALESCE($2, tenant_info.email_entry_skipped),
          updated_at = CURRENT_TIMESTAMP
      `, [email, emailEntrySkipped]);
        } catch (error) {
            console.error('Error setting tenant info:', error);
        } finally {
            client.release();
        }
    }

    // Utility methods
    async clearAll(orgId?: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            const condition = 'WHERE org_id = $1';
            const param = [orgId || ''];

            await client.query(`DELETE FROM runs ${condition}`, param);
            await client.query(`DELETE FROM configurations ${condition}`, param);
            await client.query(`DELETE FROM integrations ${condition}`, param);
        } finally {
            client.release();
        }
    }

    async disconnect(): Promise<void> {
        await this.pool.end();
    }

    async ping(): Promise<boolean> {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
        } catch (error) {
            return false;
        }
    }
}
