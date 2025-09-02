import type { ApiConfig, ExtractConfig, Integration, RunResult, TransformConfig, Workflow } from "@superglue/client";
import { Pool, PoolConfig } from 'pg';
import { credentialEncryption } from "../utils/encryption.js";
import { logMessage } from "../utils/logs.js";
import type { DataStore } from "./types.js";

type ConfigType = 'api' | 'extract' | 'transform' | 'workflow';
type ConfigData = ApiConfig | ExtractConfig | TransformConfig | Workflow;

export class PostgresService implements DataStore {
    private pool: Pool;

    constructor(config: PoolConfig) {
        this.pool = new Pool({
            ...config,
            max: 20,
            min: 2,
            ssl: config.ssl || {
                rejectUnauthorized: false
            }
        });

        this.pool.on('error', (err) => {
            console.error('postgres pool error:', err);
        });

        this.pool.on('connect', () => {
            logMessage('debug', '🐘 postgres connected');
        });

        this.initializeTables();
    }
    async getManyWorkflows(params: { ids: string[]; orgId?: string }): Promise<Workflow[]> {
        const { ids, orgId } = params;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT id, data FROM configurations WHERE id = ANY($1) AND type = $2 AND org_id = $3',
                [ids, 'workflow', orgId || '']
            );
            return result.rows.map(row => ({ ...row.data, id: row.id }));
        } finally {
            client.release();
        }
    }
    async getManyIntegrations(params: { ids: string[]; includeDocs?: boolean; orgId?: string }): Promise<Integration[]> {
        const { ids, includeDocs = true, orgId } = params;
        const client = await this.pool.connect();
        try {
            let query;
            if (includeDocs) {
                query = `SELECT i.id, i.name, i.type, i.url_host, i.url_path, i.credentials, 
                        i.documentation_url, i.documentation_pending,
                        i.open_api_url, i.specific_instructions, i.documentation_keywords, i.icon, i.version, i.created_at, i.updated_at,
                        d.documentation, d.open_api_schema
                 FROM integrations i
                 LEFT JOIN integration_details d ON i.id = d.integration_id AND i.org_id = d.org_id
                 WHERE i.id = ANY($1) AND i.org_id = $2`;
            } else {
                query = `SELECT id, name, type, url_host, url_path, credentials, 
                        documentation_url, documentation_pending,
                        open_api_url, specific_instructions, documentation_keywords, icon, version, created_at, updated_at
                 FROM integrations WHERE id = ANY($1) AND org_id = $2`;
            }

            const result = await client.query(query, [ids, orgId || '']);

            return result.rows.map((row: any) => {
                const integration: Integration = {
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    urlHost: row.url_host,
                    urlPath: row.url_path,
                    credentials: row.credentials ? credentialEncryption.decrypt(row.credentials) : {},
                    documentationUrl: row.documentation_url,
                    documentation: includeDocs ? row.documentation : undefined,
                    documentationPending: row.documentation_pending,
                    openApiUrl: row.open_api_url,
                    openApiSchema: includeDocs ? row.open_api_schema : undefined,
                    specificInstructions: row.specific_instructions,
                    documentationKeywords: row.documentation_keywords,
                    icon: row.icon,
                    version: row.version,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };

                return integration;
            });
        } finally {
            client.release();
        }
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

            // Integrations table (without large fields)
            await client.query(`
    CREATE TABLE IF NOT EXISTS integrations (
      id VARCHAR(255) NOT NULL,
      org_id VARCHAR(255),
      name VARCHAR(255),
      type VARCHAR(100),
      url_host VARCHAR(500),
      url_path VARCHAR(500),
      credentials JSONB, -- Encrypted JSON object
      documentation_url VARCHAR(1000),
      documentation_pending BOOLEAN DEFAULT FALSE,
      open_api_url VARCHAR(1000),
      specific_instructions TEXT,
      documentation_keywords TEXT[],
      icon VARCHAR(255),
      version VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, org_id)
    )
  `);

        // New table for large integration fields
        await client.query(`
    CREATE TABLE IF NOT EXISTS integration_details (
      integration_id VARCHAR(255) NOT NULL,
      org_id VARCHAR(255),
      documentation TEXT,
      open_api_schema TEXT,
      PRIMARY KEY (integration_id, org_id),
      FOREIGN KEY (integration_id, org_id) REFERENCES integrations(id, org_id) ON DELETE CASCADE
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

            await client.query(`CREATE INDEX IF NOT EXISTS idx_configurations_type_org ON configurations(type, org_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_configurations_version ON configurations(version)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_configurations_integration_ids ON configurations USING GIN(integration_ids)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_runs_config_id ON runs(config_id, org_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type, org_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_integrations_url_host ON integrations(url_host)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_integration_details_integration_id ON integration_details(integration_id, org_id)`);
        } finally {
            client.release();
        }
    }

    private extractVersion(config: ConfigData): string | null {
        return (config as any)?.version || null;
    }

    private parseDates(data: any): any {
        if (!data) return data;

        const result = { ...data };

        if (result.createdAt && typeof result.createdAt === 'string') {
            result.createdAt = new Date(result.createdAt);
        }
        if (result.updatedAt && typeof result.updatedAt === 'string') {
            result.updatedAt = new Date(result.updatedAt);
        }
        if (result.startedAt && typeof result.startedAt === 'string') {
            result.startedAt = new Date(result.startedAt);
        }
        if (result.completedAt && typeof result.completedAt === 'string') {
            result.completedAt = new Date(result.completedAt);
        }

        // Parse dates in nested config object
        if (result.config) {
            result.config = this.parseDates(result.config);
        }

        return result;
    }

    private async getConfig<T extends ConfigData>(id: string, type: ConfigType, orgId?: string): Promise<T | null> {
        if (!id) return null;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT data FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3',
                [id, type, orgId || '']
            );
            return result.rows[0] ? { ...this.parseDates(result.rows[0].data), id } : null;
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

            const items = result.rows.map(row => ({ ...this.parseDates(row.data), id: row.id }));
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
    async getApiConfig(params: { id: string; orgId?: string }): Promise<ApiConfig | null> {
        const { id, orgId } = params;
        return this.getConfig<ApiConfig>(id, 'api', orgId);
    }

    async listApiConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ApiConfig[], total: number }> {
        const { limit = 10, offset = 0, orgId } = params || {};
        return this.listConfigs<ApiConfig>('api', limit, offset, orgId);
    }

    async upsertApiConfig(params: { id: string; config: ApiConfig; orgId?: string }): Promise<ApiConfig> {
        const { id, config, orgId } = params;
        return this.upsertConfig(id, config, 'api', orgId);
    }

    async deleteApiConfig(params: { id: string; orgId?: string }): Promise<boolean> {
        const { id, orgId } = params;
        return this.deleteConfig(id, 'api', orgId);
    }

    // Extract Config Methods
    async getExtractConfig(params: { id: string; orgId?: string }): Promise<ExtractConfig | null> {
        const { id, orgId } = params;
        return this.getConfig<ExtractConfig>(id, 'extract', orgId);
    }

    async listExtractConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ExtractConfig[], total: number }> {
        const { limit = 10, offset = 0, orgId } = params || {};
        return this.listConfigs<ExtractConfig>('extract', limit, offset, orgId);
    }

    async upsertExtractConfig(params: { id: string; config: ExtractConfig; orgId?: string }): Promise<ExtractConfig> {
        const { id, config, orgId } = params;
        return this.upsertConfig(id, config, 'extract', orgId);
    }

    async deleteExtractConfig(params: { id: string; orgId?: string }): Promise<boolean> {
        const { id, orgId } = params;
        return this.deleteConfig(id, 'extract', orgId);
    }

    // Transform Config Methods
    async getTransformConfig(params: { id: string; orgId?: string }): Promise<TransformConfig | null> {
        const { id, orgId } = params;
        return this.getConfig<TransformConfig>(id, 'transform', orgId);
    }

    async listTransformConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: TransformConfig[], total: number }> {
        const { limit = 10, offset = 0, orgId } = params || {};
        return this.listConfigs<TransformConfig>('transform', limit, offset, orgId);
    }

    async upsertTransformConfig(params: { id: string; config: TransformConfig; orgId?: string }): Promise<TransformConfig> {
        const { id, config, orgId } = params;
        return this.upsertConfig(id, config, 'transform', orgId);
    }

    async deleteTransformConfig(params: { id: string; orgId?: string }): Promise<boolean> {
        const { id, orgId } = params;
        return this.deleteConfig(id, 'transform', orgId);
    }

    // Run Result Methods
    async getRun(params: { id: string; orgId?: string }): Promise<RunResult | null> {
        const { id, orgId } = params;
        if (!id) return null;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT data FROM runs WHERE id = $1 AND org_id = $2',
                [id, orgId || '']
            );
            if (!result.rows[0]) return null;

            const run = this.parseDates(result.rows[0].data);
            return {
                ...run,
                id
            };
        } finally {
            client.release();
        }
    }

    async listRuns(params?: { limit?: number; offset?: number; configId?: string; orgId?: string }): Promise<{ items: RunResult[], total: number }> {
        const { limit = 10, offset = 0, configId, orgId } = params || {};
        const client = await this.pool.connect();
        try {
            let countQuery = 'SELECT COUNT(*) FROM runs WHERE org_id = $1';
            let selectQuery = 'SELECT id, data, started_at FROM runs WHERE org_id = $1';
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

    async createRun(params: { result: RunResult; orgId?: string }): Promise<RunResult> {
        const { result: run, orgId } = params;
        if (!run) return null;
        if ((run as any).stepResults) delete (run as any).stepResults;
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

    async deleteRun(params: { id: string; orgId?: string }): Promise<boolean> {
        const { id, orgId } = params;
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

    async deleteAllRuns(params?: { orgId?: string }): Promise<boolean> {
        const { orgId } = params || {};
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

    async getWorkflow(params: { id: string; orgId?: string }): Promise<Workflow | null> {
        const { id, orgId } = params;
        return this.getConfig<Workflow>(id, 'workflow', orgId);
    }

    async listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Workflow[], total: number }> {
        const { limit = 10, offset = 0, orgId } = params || {};
        return this.listConfigs<Workflow>('workflow', limit, offset, orgId);
    }

    async upsertWorkflow(params: { id: string; workflow: Workflow; orgId?: string }): Promise<Workflow> {
        const { id, workflow, orgId } = params;
        const integrationIds: string[] = [];
        return this.upsertConfig(id, workflow, 'workflow', orgId, integrationIds);
    }

    async deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean> {
        const { id, orgId } = params;
        return this.deleteConfig(id, 'workflow', orgId);
    }


    // Integration Methods
    async getIntegration(params: { id: string; includeDocs?: boolean; orgId?: string }): Promise<Integration | null> {
        const { id, includeDocs = true, orgId } = params;
        if (!id) return null;
        const client = await this.pool.connect();
        try {
            let query;
            if (includeDocs) {
                query = `SELECT i.id, i.name, i.type, i.url_host, i.url_path, i.credentials, 
                        i.documentation_url, i.documentation_pending,
                        i.open_api_url, i.specific_instructions, i.documentation_keywords, i.icon, i.version, i.created_at, i.updated_at,
                        d.documentation, d.open_api_schema
                 FROM integrations i
                 LEFT JOIN integration_details d ON i.id = d.integration_id AND i.org_id = d.org_id
                 WHERE i.id = $1 AND i.org_id = $2`;
            } else {
                query = `SELECT id, name, type, url_host, url_path, credentials, 
                        documentation_url, documentation_pending,
                        open_api_url, specific_instructions, documentation_keywords, icon, version, created_at, updated_at
                 FROM integrations WHERE id = $1 AND org_id = $2`;
            }

            const result = await client.query(query, [id, orgId || '']);
            if (!result.rows[0]) return null;

            const row = result.rows[0] as any;
            const integration: Integration = {
                id: row.id,
                name: row.name,
                type: row.type,
                urlHost: row.url_host,
                urlPath: row.url_path,
                credentials: row.credentials ? credentialEncryption.decrypt(row.credentials) : {},
                documentationUrl: row.documentation_url,
                documentation: includeDocs ? row.documentation : undefined,
                documentationPending: row.documentation_pending,
                openApiUrl: row.open_api_url,
                openApiSchema: includeDocs ? row.open_api_schema : undefined,
                specificInstructions: row.specific_instructions,
                documentationKeywords: row.documentation_keywords,
                icon: row.icon,
                version: row.version,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };

            return integration;
        } finally {
            client.release();
        }
    }

    async listIntegrations(params?: { limit?: number; offset?: number; includeDocs?: boolean; orgId?: string }): Promise<{ items: Integration[], total: number }> {
        const { limit = 10, offset = 0, includeDocs = false, orgId } = params || {};
        const client = await this.pool.connect();
        try {
            const countResult = await client.query(
                'SELECT COUNT(*) FROM integrations WHERE org_id = $1',
                [orgId || '']
            );
            const total = parseInt(countResult.rows[0].count);

            let query;
            if (includeDocs) {
                query = `SELECT i.id, i.name, i.type, i.url_host, i.url_path, i.credentials, 
                        i.documentation_url, i.documentation_pending,
                        i.open_api_url, i.specific_instructions, i.documentation_keywords, i.icon, i.version, i.created_at, i.updated_at,
                        d.documentation, d.open_api_schema
                 FROM integrations i
                 LEFT JOIN integration_details d ON i.id = d.integration_id AND i.org_id = d.org_id
                 WHERE i.org_id = $1 
                 ORDER BY i.created_at DESC LIMIT $2 OFFSET $3`;
            } else {
                query = `SELECT id, name, type, url_host, url_path, credentials, 
                        documentation_url, documentation_pending,
                        open_api_url, specific_instructions, documentation_keywords, icon, version, created_at, updated_at
                 FROM integrations WHERE org_id = $1 
                 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
            }

            const result = await client.query(query, [orgId || '', limit, offset]);

            const items = result.rows.map((row: any) => {
                const integration: Integration = {
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    urlHost: row.url_host,
                    urlPath: row.url_path,
                    credentials: row.credentials ? credentialEncryption.decrypt(row.credentials) : {},
                    documentationUrl: row.documentation_url,
                    documentation: includeDocs ? row.documentation : undefined,
                    documentationPending: row.documentation_pending,
                    openApiUrl: row.open_api_url,
                    openApiSchema: includeDocs ? row.open_api_schema : undefined,
                    specificInstructions: row.specific_instructions,
                    documentationKeywords: row.documentation_keywords,
                    icon: row.icon,
                    version: row.version,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };

                return integration;
            });
            return { items, total };
        } finally {
            client.release();
        }
    }

    async upsertIntegration(params: { id: string; integration: Integration; orgId?: string }): Promise<Integration> {
        const { id, integration, orgId } = params;
        if (!id || !integration) return null;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Encrypt credentials if provided
            const encryptedCredentials = integration.credentials
                ? credentialEncryption.encrypt(integration.credentials)
                : null;

            // Insert/update main integration record
            await client.query(`
        INSERT INTO integrations (
            id, org_id, name, type, url_host, url_path, credentials,
            documentation_url, documentation_pending,
            open_api_url, specific_instructions, documentation_keywords, icon, version, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (id, org_id) 
        DO UPDATE SET 
            name = $3,
            type = $4,
            url_host = $5,
            url_path = $6,
            credentials = $7,
            documentation_url = $8,
            documentation_pending = $9,
            open_api_url = $10,
            specific_instructions = $11,
            documentation_keywords = $12,
            icon = $13,
            version = $14,
            updated_at = $16
      `, [
                id,
                orgId || '',
                integration.name,
                integration.type,
                integration.urlHost,
                integration.urlPath,
                encryptedCredentials,
                integration.documentationUrl,
                integration.documentationPending,
                integration.openApiUrl,
                integration.specificInstructions,
                integration.documentationKeywords,
                integration.icon,
                integration.version,
                integration.createdAt || new Date(),
                integration.updatedAt || new Date()
            ]);

            // Insert/update details if any large fields are provided
            if (integration.documentation || integration.openApiSchema) {
                await client.query(`
            INSERT INTO integration_details (
                integration_id, org_id, documentation, open_api_schema
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_id, org_id)
            DO UPDATE SET
                documentation = COALESCE($3, integration_details.documentation),
                open_api_schema = COALESCE($4, integration_details.open_api_schema)
          `, [
                    id,
                    orgId || '',
                    integration.documentation,
                    integration.openApiSchema
                ]);
            }

            await client.query('COMMIT');
            return { ...integration, id };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteIntegration(params: { id: string; orgId?: string }): Promise<boolean> {
        const { id, orgId } = params;
        if (!id) return false;
        const client = await this.pool.connect();
        try {
            // Delete integration_details first due to foreign key constraint
            await client.query(
                'DELETE FROM integration_details WHERE integration_id = $1 AND org_id = $2',
                [id, orgId || '']
            );
            
            // Then delete the integration
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

    async setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean }): Promise<void> {
        const { email, emailEntrySkipped } = params || {};
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
            await client.query(`DELETE FROM integration_details ${condition}`, param); // Delete details first
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
