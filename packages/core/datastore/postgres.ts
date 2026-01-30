import type {
  ApiConfig,
  DiscoveryRun,
  FileReference,
  FileStatus,
  OrgSettings,
  RequestSource,
  Run,
  RunStatus,
  System,
  Tool,
} from "@superglue/shared";
import jsonpatch from "fast-json-patch";
import { Pool, PoolConfig } from "pg";
import { credentialEncryption } from "../utils/encryption.js";
import { logMessage } from "../utils/logs.js";
import { extractRun, normalizeTool } from "./migrations/migration.js";
import type {
  DataStore,
  PrometheusRunMetrics,
  PrometheusRunSourceLabel,
  PrometheusRunStatusLabel,
  ToolHistoryEntry,
  ToolScheduleInternal,
} from "./types.js";

type ConfigType = "api" | "workflow";
type ConfigData = ApiConfig | Tool;

export class PostgresService implements DataStore {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      ...config,
      max: 20,
      min: 2,
      ssl:
        config.ssl === false ||
        config.host.includes("localhost") ||
        config.host.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false },
    });
    this.pool.on("error", (err) => {
      logMessage(
        "error",
        "postgres pool error: " + (err instanceof Error ? err.message : String(err)),
      );
    });

    this.pool.on("connect", () => {
      logMessage("debug", "Datastore: 🐘 postgres connected");
    });

    this.pool
      .connect()
      .catch((err) => {
        logMessage(
          "error",
          "[CRITICAL] Postgres connection failed: " +
            (err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
      })
      .then((client) => {
        client?.release();
      });

    this.initializeTables();
  }
  async getManySystems(params: {
    ids: string[];
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<System[]> {
    const { ids, includeDocs = true, orgId } = params;
    const client = await this.pool.connect();
    try {
      let query;
      if (includeDocs) {
        query = `SELECT i.id, i.name, i.type, i.url_host, i.url_path, i.credentials, 
                        i.documentation_url, i.documentation_pending,
                        i.open_api_url, i.specific_instructions, i.documentation_keywords, i.icon, i.metadata, i.template_name, i.documentation_files, i.version, i.created_at, i.updated_at,
                        d.documentation, d.open_api_schema
                 FROM integrations i
                 LEFT JOIN integration_details d ON i.id = d.integration_id AND i.org_id = d.org_id
                 WHERE i.id = ANY($1) AND i.org_id = $2`;
      } else {
        query = `SELECT id, name, type, url_host, url_path, credentials, 
                        documentation_url, documentation_pending,
                        open_api_url, specific_instructions, documentation_keywords, icon, metadata, template_name, documentation_files, version, created_at, updated_at
                 FROM integrations WHERE id = ANY($1) AND org_id = $2`;
      }

      const result = await client.query(query, [ids, orgId || ""]);

      return result.rows.map((row: any) => {
        const system: System = {
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
          metadata: row.metadata,
          templateName: row.template_name,
          documentationFiles: row.documentation_files || {},
          version: row.version,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        return system;
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
          type VARCHAR(20) NOT NULL CHECK (type IN ('api', 'workflow')),
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
          status VARCHAR(50),
          request_source VARCHAR(50) CHECK (request_source IN ('api','frontend','scheduler','mcp','tool-chain','webhook')),
          data JSONB NOT NULL,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id, org_id)
        )
      `);

      // Backwards-compatible schema updates for existing deployments
      await client.query(`ALTER TABLE runs ADD COLUMN IF NOT EXISTS status VARCHAR(50)`);
      await client.query(`ALTER TABLE runs ADD COLUMN IF NOT EXISTS request_source VARCHAR(50)`);

      // Ensure request_source is constrained to allowed enum values (idempotent)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'runs_request_source_check'
          ) THEN
            ALTER TABLE runs
              ADD CONSTRAINT runs_request_source_check
              CHECK (request_source IN ('api','frontend','scheduler','mcp','tool-chain','webhook'));
          END IF;
        END
        $$;
      `);

      // Backfill columns from JSON for existing rows
      // - New format: data.status = RUNNING|SUCCESS|FAILED|ABORTED
      // - Legacy format: data.success = true|false (no status field)
      await client.query(`
        UPDATE runs
        SET
          status = COALESCE(
            status,
            NULLIF(data->>'status', ''),
            CASE
              WHEN data->>'success' = 'true' THEN 'SUCCESS'
              WHEN data->>'success' = 'false' THEN 'FAILED'
              ELSE NULL
            END
          ),
          request_source = COALESCE(
            request_source,
            CASE
              WHEN data->>'requestSource' = 'scheduler' THEN 'scheduler'
              WHEN data->>'requestSource' = 'scheduled' THEN 'scheduler'
              WHEN data->>'requestSource' = 'frontend' THEN 'frontend'
              WHEN data->>'requestSource' = 'mcp' THEN 'mcp'
              WHEN data->>'requestSource' = 'rest_api' THEN 'api'
              WHEN data->>'requestSource' = 'api' THEN 'api'
              WHEN data->>'requestSource' = 'tool-chain' THEN 'tool-chain'
              WHEN data->>'requestSource' IN ('api-chain', 'api_chain') THEN 'tool-chain'
              WHEN data->>'requestSource' = 'webhook' THEN 'webhook'
              ELSE 'frontend'
            END
          )
        WHERE status IS NULL OR request_source IS NULL
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
      metadata JSONB,
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

      // Backwards-compatible schema updates for integrations table
      await client.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS metadata JSONB`);
      await client.query(
        `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS template_name VARCHAR(255)`,
      );
      await client.query(
        `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS documentation_files JSONB DEFAULT '{}'`,
      );

      // Integration templates table for Superglue OAuth credentials (and potentially further fields in the future)
      await client.query(`
    CREATE TABLE IF NOT EXISTS integration_templates (
        id VARCHAR(255) PRIMARY KEY,
        sg_client_id VARCHAR(500),
        sg_client_secret TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      await client.query(`
             CREATE TABLE IF NOT EXISTS workflow_schedules (
                id UUID NOT NULL,
                org_id TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                workflow_type TEXT NOT NULL,
                cron_expression TEXT NOT NULL,
                timezone TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                payload JSONB,
                options JSONB,
                last_run_at TIMESTAMPTZ,
                next_run_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id, org_id),
                FOREIGN KEY (workflow_id, workflow_type, org_id) REFERENCES configurations(id, type, org_id) ON DELETE CASCADE
             )
            `);

      await client.query(`
                CREATE TABLE IF NOT EXISTS integration_oauth (
                    uid TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    client_secret TEXT NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

      await client.query(`
                CREATE TABLE IF NOT EXISTS discovery_runs (
                    id VARCHAR(255) NOT NULL,
                    org_id VARCHAR(255) NOT NULL,
                    sources JSONB NOT NULL,
                    data JSONB,
                    status VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, org_id)
                )
            `);

      await client.query(`
                CREATE TABLE IF NOT EXISTS file_references (
                    id VARCHAR(255) NOT NULL,
                    org_id VARCHAR(255) NOT NULL,
                    storage_uri TEXT NOT NULL,
                    processed_storage_uri TEXT,
                    metadata JSONB NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    error TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, org_id)
                )
            `);

      // Tool version history table (stores previous versions on each save)
      await client.query(`
                CREATE TABLE IF NOT EXISTS tool_history (
                    id SERIAL PRIMARY KEY,
                    tool_id VARCHAR(255) NOT NULL,
                    org_id VARCHAR(255) NOT NULL,
                    version INTEGER NOT NULL,
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by_user_id VARCHAR(255),
                    created_by_email VARCHAR(255),
                    UNIQUE(tool_id, org_id, version)
                )
            `);

      // Org settings table (notifications, preferences, etc.)
      await client.query(`
                CREATE TABLE IF NOT EXISTS org_settings (
                    org_id VARCHAR(255) PRIMARY KEY,
                    notifications JSONB DEFAULT '{}',
                    preferences JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_configurations_type_org ON configurations(type, org_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_configurations_version ON configurations(version)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_configurations_integration_ids ON configurations USING GIN(integration_ids)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_runs_config_id ON runs(config_id, org_id)`,
      );
      await client.query(`CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at)`);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_runs_org_status_source ON runs(org_id, status, request_source)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_runs_org_source_completed_at ON runs(org_id, request_source, completed_at) WHERE completed_at IS NOT NULL`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type, org_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_integrations_url_host ON integrations(url_host)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_integration_details_integration_id ON integration_details(integration_id, org_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_workflow_schedules_due ON workflow_schedules(next_run_at, enabled) WHERE enabled = true`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_integration_oauth_expires ON integration_oauth(expires_at)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_discovery_runs_org_status ON discovery_runs(org_id, status)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_file_references_org_id ON file_references(org_id, id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_file_references_org_status ON file_references(org_id, status)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_tool_history_lookup ON tool_history(tool_id, org_id, version DESC)`,
      );
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

    if (result.createdAt && typeof result.createdAt === "string") {
      result.createdAt = new Date(result.createdAt);
    }
    if (result.updatedAt && typeof result.updatedAt === "string") {
      result.updatedAt = new Date(result.updatedAt);
    }
    if (result.startedAt && typeof result.startedAt === "string") {
      result.startedAt = new Date(result.startedAt);
    }
    if (result.completedAt && typeof result.completedAt === "string") {
      result.completedAt = new Date(result.completedAt);
    }

    // Parse dates in nested config object
    if (result.config) {
      result.config = this.parseDates(result.config);
    }

    return result;
  }

  private async getConfig<T extends ConfigData>(
    id: string,
    type: ConfigType,
    orgId?: string,
  ): Promise<T | null> {
    if (!id) return null;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT data FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3",
        [id, type, orgId || ""],
      );
      return result.rows[0] ? { ...this.parseDates(result.rows[0].data), id } : null;
    } finally {
      client.release();
    }
  }

  private async listConfigs<T extends ConfigData>(
    type: ConfigType,
    limit = 10,
    offset = 0,
    orgId?: string,
  ): Promise<{ items: T[]; total: number }> {
    const client = await this.pool.connect();
    try {
      const countResult = await client.query(
        "SELECT COUNT(*) FROM configurations WHERE type = $1 AND org_id = $2",
        [type, orgId || ""],
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        "SELECT id, data FROM configurations WHERE type = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
        [type, orgId || "", limit, offset],
      );

      const items = result.rows.map((row) => ({ ...this.parseDates(row.data), id: row.id }));
      return { items, total };
    } finally {
      client.release();
    }
  }

  private async upsertConfig<T extends ConfigData>(
    id: string,
    config: T,
    type: ConfigType,
    orgId?: string,
    integrationIds: string[] = [],
  ): Promise<T> {
    if (!id || !config) return null;
    const client = await this.pool.connect();
    try {
      const version = this.extractVersion(config);
      await client.query(
        `
        INSERT INTO configurations (id, org_id, type, version, data, integration_ids, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (id, type, org_id) 
        DO UPDATE SET data = $5, version = $4, integration_ids = $6, updated_at = CURRENT_TIMESTAMP
      `,
        [id, orgId || "", type, version, JSON.stringify(config), integrationIds],
      );

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
        "DELETE FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3",
        [id, type, orgId || ""],
      );
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  // API Config Methods
  async getApiConfig(params: { id: string; orgId?: string }): Promise<ApiConfig | null> {
    const { id, orgId } = params;
    return this.getConfig<ApiConfig>(id, "api", orgId);
  }

  async listApiConfigs(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: ApiConfig[]; total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    return this.listConfigs<ApiConfig>("api", limit, offset, orgId);
  }

  async upsertApiConfig(params: {
    id: string;
    config: ApiConfig;
    orgId?: string;
  }): Promise<ApiConfig> {
    const { id, config, orgId } = params;
    return this.upsertConfig(id, config, "api", orgId);
  }

  async deleteApiConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    return this.deleteConfig(id, "api", orgId);
  }

  // Run Methods
  async getRun(params: { id: string; orgId?: string }): Promise<Run | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT id, config_id, data, started_at, completed_at, request_source FROM runs WHERE id = $1 AND org_id = $2",
        [id, orgId || ""],
      );
      if (!result.rows[0]) return null;

      const row = result.rows[0];
      const run = extractRun(row.data, {
        id: row.id,
        config_id: row.config_id,
        started_at: row.started_at,
        completed_at: row.completed_at,
      });
      // Source of truth for requestSource is the column, not the JSON
      run.requestSource = row.request_source || run.requestSource;
      return run;
    } finally {
      client.release();
    }
  }

  async listRuns(params?: {
    limit?: number;
    offset?: number;
    configId?: string;
    status?: RunStatus;
    requestSources?: RequestSource[];
    orgId?: string;
  }): Promise<{ items: Run[]; total: number }> {
    const { limit = 10, offset = 0, configId, status, requestSources, orgId } = params || {};
    const client = await this.pool.connect();
    try {
      let selectQuery = `
                SELECT 
                    id, config_id, data, started_at, completed_at, request_source,
                    COUNT(*) OVER() as total_count
                FROM runs
                WHERE org_id = $1
            `;
      const queryParams: (string | string[])[] = [orgId || ""];

      if (configId) {
        selectQuery += " AND config_id = $2";
        queryParams.push(configId);
      }

      if (status !== undefined) {
        const paramIndex = queryParams.length + 1;
        selectQuery += ` AND data->>'status' = $${paramIndex}`;
        queryParams.push(status);
      }

      if (requestSources !== undefined && requestSources.length > 0) {
        const paramIndex = queryParams.length + 1;
        selectQuery += ` AND request_source = ANY($${paramIndex})`;
        queryParams.push(requestSources);
      }

      selectQuery +=
        " ORDER BY started_at DESC LIMIT $" +
        (queryParams.length + 1) +
        " OFFSET $" +
        (queryParams.length + 2);
      queryParams.push(String(limit), String(offset));

      const result = await client.query(selectQuery, queryParams);

      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

      const items = result.rows.map((row) => {
        const run = extractRun(row.data, {
          id: row.id,
          config_id: row.config_id,
          started_at: row.started_at,
          completed_at: row.completed_at,
        });
        // Source of truth for requestSource is the column, not the JSON
        run.requestSource = row.request_source || run.requestSource;
        return run;
      });

      return { items, total };
    } finally {
      client.release();
    }
  }

  async createRun(params: { run: Run; orgId?: string }): Promise<Run> {
    const { run, orgId = "" } = params;
    if (!run) throw new Error("Run is required");
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
                INSERT INTO runs (id, config_id, org_id, status, request_source, data, started_at, completed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id, org_id) DO NOTHING
            `,
        [
          run.runId,
          run.toolId,
          orgId,
          run.status,
          run.requestSource ?? "api",
          JSON.stringify(run),
          run.metadata.startedAt,
          run.metadata.completedAt ?? null,
        ],
      );

      if (result.rowCount === 0) {
        throw new Error(`Run with id ${run.runId} already exists`);
      }

      return run;
    } finally {
      client.release();
    }
  }

  async updateRun(params: { id: string; orgId: string; updates: Partial<Run> }): Promise<Run> {
    const { id, orgId, updates } = params;
    const client = await this.pool.connect();
    try {
      const existingResult = await client.query(
        "SELECT id, config_id, data, started_at, completed_at, request_source FROM runs WHERE id = $1 AND org_id = $2",
        [id, orgId],
      );

      if (!existingResult.rows[0]) {
        throw new Error(`Run with id ${id} not found`);
      }

      const row = existingResult.rows[0];
      const existingRun = extractRun(row.data, {
        id: row.id,
        config_id: row.config_id,
        started_at: row.started_at,
        completed_at: row.completed_at,
      });
      // Source of truth for requestSource is the column, not the JSON
      existingRun.requestSource = row.request_source || existingRun.requestSource;

      const updatedRun: Run = {
        ...existingRun,
        ...updates,
        runId: id,
        metadata: {
          ...existingRun.metadata,
          ...updates.metadata,
        },
      };

      await client.query(
        `
                UPDATE runs 
                SET data = $1, completed_at = $2, status = $3, request_source = $4
                WHERE id = $5 AND org_id = $6
            `,
        [
          JSON.stringify(updatedRun),
          updatedRun.metadata.completedAt ?? null,
          updatedRun.status,
          updatedRun.requestSource ?? "api",
          id,
          orgId,
        ],
      );

      return updatedRun;
    } finally {
      client.release();
    }
  }

  async getPrometheusRunMetrics(params: {
    orgId: string;
    windowSeconds: number;
  }): Promise<PrometheusRunMetrics> {
    const { orgId, windowSeconds } = params;
    const client = await this.pool.connect();
    try {
      const totals = await client.query(
        `
          SELECT
            status,
            request_source,
            COUNT(*)::bigint AS count
          FROM runs
          WHERE org_id = $1
            AND status IN ('SUCCESS', 'FAILED', 'ABORTED')
          GROUP BY status, request_source
        `,
        [orgId],
      );

      const validSources = ["api", "frontend", "scheduler", "mcp", "tool-chain", "webhook"];
      const runsTotal: PrometheusRunMetrics["runsTotal"] = totals.rows
        .map((r: any) => {
          const status = String(r.status || "").toLowerCase() as PrometheusRunStatusLabel;
          const source = String(r.request_source || "api") as PrometheusRunSourceLabel;
          const value = Number(r.count ?? 0);
          if (status !== "success" && status !== "failed" && status !== "aborted") return null;
          if (!validSources.includes(source)) return null;
          return { status, source, value };
        })
        .filter(Boolean) as PrometheusRunMetrics["runsTotal"];

      const p95Rows = await client.query(
        `
          SELECT
            request_source,
            percentile_cont(0.95) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))
            ) AS p95
          FROM runs
          WHERE org_id = $1
            AND completed_at IS NOT NULL
            AND started_at IS NOT NULL
            AND status IN ('SUCCESS', 'FAILED', 'ABORTED')
            AND completed_at > (NOW() - make_interval(secs => $2))
          GROUP BY request_source
        `,
        [orgId, windowSeconds],
      );

      const runDurationSecondsP95: PrometheusRunMetrics["runDurationSecondsP95"] = p95Rows.rows
        .map((r: any) => {
          const source = String(r.request_source || "api") as PrometheusRunSourceLabel;
          const value = Number(r.p95);
          if (!Number.isFinite(value)) return null;
          if (!validSources.includes(source)) return null;
          return { source, windowSeconds, value };
        })
        .filter(Boolean) as PrometheusRunMetrics["runDurationSecondsP95"];

      return { runsTotal, runDurationSecondsP95 };
    } finally {
      client.release();
    }
  }

  async getWorkflow(params: { id: string; orgId?: string }): Promise<Tool | null> {
    const { id, orgId } = params;
    const workflow = await this.getConfig<Tool>(id, "workflow", orgId);
    return workflow ? normalizeTool(workflow) : null;
  }

  async listWorkflows(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: Tool[]; total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const result = await this.listConfigs<Tool>("workflow", limit, offset, orgId);
    return { items: result.items.map(normalizeTool), total: result.total };
  }

  async upsertWorkflow(params: {
    id: string;
    workflow: Tool;
    orgId?: string;
    userId?: string;
    userEmail?: string;
  }): Promise<Tool> {
    const { id, workflow, orgId = "", userId, userEmail } = params;
    if (!id || !workflow) return null;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Check if tool already exists - if so, archive current version
      const existingResult = await client.query(
        "SELECT data FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3",
        [id, "workflow", orgId],
      );

      if (existingResult.rows.length > 0) {
        const existingTool = existingResult.rows[0].data as Tool;

        const { updatedAt: _u1, createdAt: _c1, ...existingRest } = existingTool as any;
        const { updatedAt: _u2, createdAt: _c2, ...workflowRest } = workflow as any;
        const hasChanges = jsonpatch.compare(existingRest, workflowRest).length > 0;

        if (hasChanges) {
          // Get next version number
          const versionResult = await client.query(
            "SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM tool_history WHERE tool_id = $1 AND org_id = $2",
            [id, orgId],
          );
          const nextVersion = versionResult.rows[0].next_version;

          // Archive the existing version (normalized to ensure consistent format)
          await client.query(
            `INSERT INTO tool_history (tool_id, org_id, version, data, created_by_user_id, created_by_email)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              orgId,
              nextVersion,
              JSON.stringify(normalizeTool(existingTool)),
              userId || null,
              userEmail || null,
            ],
          );
        }
      }

      // Now upsert the new version
      const version = this.extractVersion(workflow);
      await client.query(
        `INSERT INTO configurations (id, org_id, type, version, data, integration_ids, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (id, type, org_id) 
         DO UPDATE SET data = $5, version = $4, integration_ids = $6, updated_at = CURRENT_TIMESTAMP`,
        [id, orgId, "workflow", version, JSON.stringify(workflow), []],
      );

      await client.query("COMMIT");
      return { ...workflow, id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    return this.deleteConfig(id, "workflow", orgId);
  }

  async renameWorkflow(params: { oldId: string; newId: string; orgId?: string }): Promise<Tool> {
    const { oldId, newId, orgId = "" } = params;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Check if newId already exists
      const existingCheck = await client.query(
        "SELECT id FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3",
        [newId, "workflow", orgId],
      );

      if (existingCheck.rows.length > 0) {
        throw new Error(`Workflow with ID '${newId}' already exists`);
      }

      // 2. Get old workflow
      const oldWorkflowResult = await client.query(
        "SELECT data FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3",
        [oldId, "workflow", orgId],
      );

      if (oldWorkflowResult.rows.length === 0) {
        throw new Error(`Workflow with ID '${oldId}' not found`);
      }

      const oldWorkflow = oldWorkflowResult.rows[0].data as Tool;
      const now = new Date();

      // 3. Create new workflow with newId
      const newWorkflow: Tool = {
        ...oldWorkflow,
        id: newId,
        updatedAt: now,
      };

      const integrationIds: string[] = [];
      await client.query(
        `INSERT INTO configurations (id, org_id, type, version, data, integration_ids, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newId,
          orgId,
          "workflow",
          newWorkflow.version || null,
          newWorkflow,
          integrationIds,
          newWorkflow.createdAt || now,
          now,
        ],
      );

      // 4. CRITICAL: Update workflow_schedules BEFORE deleting old workflow (to avoid CASCADE delete)
      await client.query(
        `UPDATE workflow_schedules 
                 SET workflow_id = $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE workflow_id = $2 AND workflow_type = 'workflow' AND org_id = $3`,
        [newId, oldId, orgId],
      );

      // 5. Migrate tool_history to new tool_id
      await client.query(
        `UPDATE tool_history SET tool_id = $1 WHERE tool_id = $2 AND org_id = $3`,
        [newId, oldId, orgId],
      );

      // 6. Delete old workflow
      await client.query("DELETE FROM configurations WHERE id = $1 AND type = $2 AND org_id = $3", [
        oldId,
        "workflow",
        orgId,
      ]);

      await client.query("COMMIT");
      return newWorkflow;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Tool History Methods
  async listToolHistory(params: { toolId: string; orgId?: string }): Promise<ToolHistoryEntry[]> {
    const { toolId, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT version, data, created_at, created_by_user_id, created_by_email
         FROM tool_history
         WHERE tool_id = $1 AND org_id = $2
         ORDER BY version DESC`,
        [toolId, orgId],
      );

      return result.rows.map((row) => ({
        version: row.version,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id || undefined,
        createdByEmail: row.created_by_email || undefined,
        tool: row.data as Tool,
      }));
    } finally {
      client.release();
    }
  }

  async restoreToolVersion(params: {
    toolId: string;
    version: number;
    orgId?: string;
    userId?: string;
    userEmail?: string;
  }): Promise<Tool> {
    const { toolId, version, orgId = "", userId, userEmail } = params;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get the archived version to restore
      const archiveResult = await client.query(
        `SELECT data FROM tool_history WHERE tool_id = $1 AND org_id = $2 AND version = $3`,
        [toolId, orgId, version],
      );

      if (archiveResult.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new Error(`Version ${version} not found for tool ${toolId}`);
      }

      const toolToRestore = archiveResult.rows[0].data as Tool;

      // Get current tool to archive it first
      const currentResult = await client.query(
        `SELECT data FROM configurations WHERE id = $1 AND org_id = $2 AND type = 'workflow'`,
        [toolId, orgId],
      );

      if (currentResult.rows.length > 0) {
        const currentTool = currentResult.rows[0].data as Tool;

        // Always archive the current version before restore
        const versionResult = await client.query(
          "SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM tool_history WHERE tool_id = $1 AND org_id = $2",
          [toolId, orgId],
        );
        const nextVersion = versionResult.rows[0].next_version;

        await client.query(
          `INSERT INTO tool_history (tool_id, org_id, version, data, created_by_user_id, created_by_email)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            toolId,
            orgId,
            nextVersion,
            JSON.stringify(currentTool),
            userId || null,
            userEmail || null,
          ],
        );
      }

      // Save the restored version (override id to match current tool's primary key)
      const restoredWorkflow = { ...toolToRestore, id: toolId, updatedAt: new Date() };
      const toolVersion = this.extractVersion(restoredWorkflow);
      await client.query(
        `UPDATE configurations SET data = $1, version = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND org_id = $4 AND type = 'workflow'`,
        [JSON.stringify(restoredWorkflow), toolVersion, toolId, orgId],
      );

      await client.query("COMMIT");
      return restoredWorkflow;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Tool Schedule Methods
  async listToolSchedules(params: {
    toolId?: string;
    orgId: string;
  }): Promise<ToolScheduleInternal[]> {
    const client = await this.pool.connect();

    try {
      let query: string;
      let queryParams: string[];

      if (params.toolId) {
        query =
          "SELECT id, org_id, workflow_id, cron_expression, timezone, enabled, payload, options, last_run_at, next_run_at, created_at, updated_at FROM workflow_schedules WHERE workflow_id = $1 AND org_id = $2";
        queryParams = [params.toolId, params.orgId];
      } else {
        query =
          "SELECT id, org_id, workflow_id, cron_expression, timezone, enabled, payload, options, last_run_at, next_run_at, created_at, updated_at FROM workflow_schedules WHERE org_id = $1";
        queryParams = [params.orgId];
      }

      const queryResult = await client.query(query, queryParams);
      return queryResult.rows.map(this.mapToolSchedule);
    } finally {
      client.release();
    }
  }

  async getToolSchedule({
    id,
    orgId,
  }: {
    id: string;
    orgId?: string;
  }): Promise<ToolScheduleInternal | null> {
    const client = await this.pool.connect();
    try {
      const query =
        "SELECT id, org_id, workflow_id, cron_expression, timezone, enabled, payload, options, last_run_at, next_run_at, created_at, updated_at FROM workflow_schedules WHERE id = $1 AND org_id = $2";

      const queryResult = await client.query(query, [id, orgId || ""]);
      if (!queryResult.rows[0]) {
        return null;
      }

      return this.mapToolSchedule(queryResult.rows[0]);
    } finally {
      client.release();
    }
  }

  async upsertToolSchedule({ schedule }: { schedule: ToolScheduleInternal }): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
                INSERT INTO workflow_schedules (id, org_id, workflow_id, workflow_type, cron_expression, timezone, enabled, payload, options, last_run_at, next_run_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                ON CONFLICT (id, org_id)
                DO UPDATE SET 
                    cron_expression = $5,
                    timezone = $6,
                    enabled = $7,
                    payload = $8,
                    options = $9,
                    last_run_at = $10,
                    next_run_at = $11,
                    updated_at = CURRENT_TIMESTAMP
            `;

      await client.query(query, [
        schedule.id,
        schedule.orgId,
        schedule.toolId,
        "workflow",
        schedule.cronExpression,
        schedule.timezone,
        schedule.enabled,
        JSON.stringify(schedule.payload),
        JSON.stringify(schedule.options),
        schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
        schedule.nextRunAt ? schedule.nextRunAt.toISOString() : null,
      ]);
    } finally {
      client.release();
    }
  }

  async deleteToolSchedule({ id, orgId }: { id: string; orgId: string }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM workflow_schedules WHERE id = $1 AND org_id = $2",
        [id, orgId],
      );
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async listDueToolSchedules(): Promise<ToolScheduleInternal[]> {
    const client = await this.pool.connect();

    // We check for schedules that are enabled and have a next run time that is in the past (all timestamps in the database are in UTC)
    try {
      const query = `SELECT id, org_id, workflow_id, cron_expression, timezone, enabled, payload, options, last_run_at, next_run_at, created_at, updated_at FROM workflow_schedules WHERE enabled = true AND next_run_at <= CURRENT_TIMESTAMP at time zone 'utc'`;
      const queryResult = await client.query(query);

      return queryResult.rows.map(this.mapToolSchedule);
    } finally {
      client.release();
    }
  }

  async updateScheduleNextRun(params: {
    id: string;
    nextRunAt: Date;
    lastRunAt: Date;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const query =
        "UPDATE workflow_schedules SET next_run_at = $1, last_run_at = $2 WHERE id = $3";
      const result = await client.query(query, [
        params.nextRunAt ? params.nextRunAt.toISOString() : null,
        params.lastRunAt ? params.lastRunAt.toISOString() : null,
        params.id,
      ]);
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  private mapToolSchedule(row: any): ToolScheduleInternal {
    return {
      id: row.id,
      toolId: row.workflow_id,
      orgId: row.org_id,
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      enabled: row.enabled,
      payload: row.payload,
      options: row.options,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // System Methods
  async getSystem(params: {
    id: string;
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<System | null> {
    const { id, includeDocs = true, orgId } = params;
    if (!id) return null;
    const client = await this.pool.connect();
    try {
      let query;
      if (includeDocs) {
        query = `SELECT i.id, i.name, i.type, i.url_host, i.url_path, i.credentials, 
                        i.documentation_url, i.documentation_pending,
                        i.open_api_url, i.specific_instructions, i.documentation_keywords, i.icon, i.metadata, i.template_name, i.documentation_files, i.version, i.created_at, i.updated_at,
                        d.documentation, d.open_api_schema
                 FROM integrations i
                 LEFT JOIN integration_details d ON i.id = d.integration_id AND i.org_id = d.org_id
                 WHERE i.id = $1 AND i.org_id = $2`;
      } else {
        query = `SELECT id, name, type, url_host, url_path, credentials, 
                        documentation_url, documentation_pending,
                        open_api_url, specific_instructions, documentation_keywords, icon, metadata, template_name, documentation_files, version, created_at, updated_at
                 FROM integrations WHERE id = $1 AND org_id = $2`;
      }

      const result = await client.query(query, [id, orgId || ""]);
      if (!result.rows[0]) return null;

      const row = result.rows[0] as any;
      const system: System = {
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
        metadata: row.metadata,
        templateName: row.template_name,
        documentationFiles: row.documentation_files || {},
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return system;
    } finally {
      client.release();
    }
  }

  async listSystems(params?: {
    limit?: number;
    offset?: number;
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<{ items: System[]; total: number }> {
    const { limit = 10, offset = 0, includeDocs = false, orgId } = params || {};
    const client = await this.pool.connect();
    try {
      const countResult = await client.query(
        "SELECT COUNT(*) FROM integrations WHERE org_id = $1",
        [orgId || ""],
      );
      const total = parseInt(countResult.rows[0].count);

      let query;
      if (includeDocs) {
        query = `SELECT i.id, i.name, i.type, i.url_host, i.url_path, i.credentials, 
                        i.documentation_url, i.documentation_pending,
                        i.open_api_url, i.specific_instructions, i.documentation_keywords, i.icon, i.metadata, i.template_name, i.documentation_files, i.version, i.created_at, i.updated_at,
                        d.documentation, d.open_api_schema
                 FROM integrations i
                 LEFT JOIN integration_details d ON i.id = d.integration_id AND i.org_id = d.org_id
                 WHERE i.org_id = $1 
                 ORDER BY i.created_at DESC LIMIT $2 OFFSET $3`;
      } else {
        query = `SELECT id, name, type, url_host, url_path, credentials, 
                        documentation_url, documentation_pending,
                        open_api_url, specific_instructions, documentation_keywords, icon, metadata, template_name, documentation_files, version, created_at, updated_at
                 FROM integrations WHERE org_id = $1 
                 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      }

      const result = await client.query(query, [orgId || "", limit, offset]);

      const items = result.rows.map((row: any) => {
        const system: System = {
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
          metadata: row.metadata,
          templateName: row.template_name,
          documentationFiles: row.documentation_files || {},
          version: row.version,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        return system;
      });
      return { items, total };
    } finally {
      client.release();
    }
  }

  async upsertSystem(params: { id: string; system: System; orgId?: string }): Promise<System> {
    const { id, system, orgId } = params;
    if (!id || !system) return null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Encrypt credentials if provided
      const encryptedCredentials = system.credentials
        ? credentialEncryption.encrypt(system.credentials)
        : null;

      // Insert/update main system record (uses integrations table)
      await client.query(
        `
        INSERT INTO integrations (
            id, org_id, name, type, url_host, url_path, credentials,
            documentation_url, documentation_pending,
            open_api_url, specific_instructions, documentation_keywords, icon, metadata, template_name, documentation_files, version, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
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
            metadata = $14,
            template_name = $15,
            documentation_files = $16,
            version = $17,
            updated_at = $19
      `,
        [
          id,
          orgId || "",
          system.name,
          system.type,
          system.urlHost,
          system.urlPath,
          encryptedCredentials,
          system.documentationUrl,
          system.documentationPending,
          system.openApiUrl,
          system.specificInstructions,
          system.documentationKeywords,
          system.icon,
          system.metadata ? JSON.stringify(system.metadata) : null,
          system.templateName,
          system.documentationFiles ? JSON.stringify(system.documentationFiles) : "{}",
          system.version,
          system.createdAt || new Date(),
          system.updatedAt || new Date(),
        ],
      );

      // Insert/update details if any large fields are provided
      if (system.documentation || system.openApiSchema) {
        await client.query(
          `
            INSERT INTO integration_details (
                integration_id, org_id, documentation, open_api_schema
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_id, org_id)
            DO UPDATE SET
                documentation = COALESCE($3, integration_details.documentation),
                open_api_schema = COALESCE($4, integration_details.open_api_schema)
          `,
          [id, orgId || "", system.documentation, system.openApiSchema],
        );
      }

      await client.query("COMMIT");
      return { ...system, id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSystem(params: { system: System; orgId?: string }): Promise<System> {
    const { system, orgId } = params;
    if (!system?.id) throw new Error("System id is required");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const encryptedCredentials = system.credentials
        ? credentialEncryption.encrypt(system.credentials)
        : null;

      const result = await client.query(
        `
        INSERT INTO integrations (
            id, org_id, name, type, url_host, url_path, credentials,
            documentation_url, documentation_pending,
            open_api_url, specific_instructions, documentation_keywords, icon, metadata, template_name, documentation_files, version, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        RETURNING id
      `,
        [
          system.id,
          orgId || "",
          system.name,
          system.type,
          system.urlHost,
          system.urlPath,
          encryptedCredentials,
          system.documentationUrl,
          system.documentationPending,
          system.openApiUrl,
          system.specificInstructions,
          system.documentationKeywords,
          system.icon,
          system.metadata ? JSON.stringify(system.metadata) : null,
          system.templateName,
          system.documentationFiles ? JSON.stringify(system.documentationFiles) : "{}",
          system.version,
          system.createdAt || new Date(),
          system.updatedAt || new Date(),
        ],
      );

      if (result.rowCount === 0) {
        throw new Error("Failed to create system");
      }

      if (system.documentation || system.openApiSchema) {
        await client.query(
          `
            INSERT INTO integration_details (
                integration_id, org_id, documentation, open_api_schema
            ) VALUES ($1, $2, $3, $4)
          `,
          [system.id, orgId || "", system.documentation, system.openApiSchema],
        );
      }

      await client.query("COMMIT");
      return { ...system };
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        throw new Error(`System with id '${system.id}' already exists`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSystem(params: {
    id: string;
    system: Partial<System>;
    orgId?: string;
  }): Promise<System | null> {
    const { id, system, orgId } = params;
    if (!id) throw new Error("System id is required");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const encryptedCredentials = system.credentials
        ? credentialEncryption.encrypt(system.credentials)
        : null;

      const result = await client.query(
        `
        UPDATE integrations SET
            name = COALESCE($3, name),
            type = COALESCE($4, type),
            url_host = COALESCE($5, url_host),
            url_path = COALESCE($6, url_path),
            credentials = COALESCE($7, credentials),
            documentation_url = COALESCE($8, documentation_url),
            documentation_pending = COALESCE($9, documentation_pending),
            open_api_url = COALESCE($10, open_api_url),
            specific_instructions = COALESCE($11, specific_instructions),
            documentation_keywords = COALESCE($12, documentation_keywords),
            icon = COALESCE($13, icon),
            metadata = COALESCE($14, metadata),
            template_name = COALESCE($15, template_name),
            documentation_files = COALESCE($16, documentation_files),
            version = COALESCE($17, version),
            updated_at = $18
        WHERE id = $1 AND org_id = $2
        RETURNING *
      `,
        [
          id,
          orgId || "",
          system.name,
          system.type,
          system.urlHost,
          system.urlPath,
          encryptedCredentials,
          system.documentationUrl,
          system.documentationPending,
          system.openApiUrl,
          system.specificInstructions,
          system.documentationKeywords,
          system.icon,
          system.metadata ? JSON.stringify(system.metadata) : null,
          system.templateName,
          system.documentationFiles ? JSON.stringify(system.documentationFiles) : null,
          system.version,
          new Date(),
        ],
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      if (system.documentation || system.openApiSchema) {
        await client.query(
          `
            INSERT INTO integration_details (
                integration_id, org_id, documentation, open_api_schema
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_id, org_id)
            DO UPDATE SET
                documentation = COALESCE($3, integration_details.documentation),
                open_api_schema = COALESCE($4, integration_details.open_api_schema)
          `,
          [id, orgId || "", system.documentation, system.openApiSchema],
        );
      }

      await client.query("COMMIT");

      const row = result.rows[0];
      const decryptedCredentials = row.credentials
        ? credentialEncryption.decrypt(row.credentials)
        : {};

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        urlHost: row.url_host,
        urlPath: row.url_path,
        credentials: decryptedCredentials,
        documentationUrl: row.documentation_url,
        documentationPending: row.documentation_pending,
        openApiUrl: row.open_api_url,
        specificInstructions: row.specific_instructions,
        documentationKeywords: row.documentation_keywords,
        icon: row.icon,
        metadata: row.metadata,
        templateName: row.template_name,
        documentationFiles: row.documentation_files,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteSystem(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const client = await this.pool.connect();
    try {
      // Delete integration_details first due to foreign key constraint
      await client.query(
        "DELETE FROM integration_details WHERE integration_id = $1 AND org_id = $2",
        [id, orgId || ""],
      );

      // Then delete the system (from integrations table)
      const result = await client.query("DELETE FROM integrations WHERE id = $1 AND org_id = $2", [
        id,
        orgId || "",
      ]);
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async copyTemplateDocumentationToUserSystem(params: {
    templateId: string;
    userSystemId: string;
    orgId?: string;
  }): Promise<boolean> {
    const { templateId, userSystemId, orgId } = params;
    if (!templateId || !userSystemId) return false;
    const client = await this.pool.connect();
    try {
      // Copy the template documentation (identified by the org_id == 'template') to the user system
      const result = await client.query(
        "INSERT INTO integration_details (integration_id, org_id, documentation, open_api_schema) SELECT $1::text, $2::text, documentation, open_api_schema FROM integration_details WHERE integration_id = $3 AND org_id = $4",
        [userSystemId, orgId || "", templateId, "template"],
      );
      // return true, if we inserted at least one row
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  // Tenant Information Methods
  async getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT email, email_entry_skipped FROM tenant_info WHERE id = $1",
        ["default"],
      );
      if (result.rows[0]) {
        return {
          email: result.rows[0].email,
          emailEntrySkipped: result.rows[0].email_entry_skipped,
        };
      }
      return { email: null, emailEntrySkipped: false };
    } catch (error) {
      console.error("Error getting tenant info:", error);
      return { email: null, emailEntrySkipped: false };
    } finally {
      client.release();
    }
  }

  async setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean }): Promise<void> {
    const { email, emailEntrySkipped } = params || {};
    const client = await this.pool.connect();
    try {
      await client.query(
        `
        INSERT INTO tenant_info (id, email, email_entry_skipped, updated_at) 
        VALUES ('default', $1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (id) 
        DO UPDATE SET 
          email = COALESCE($1, tenant_info.email),
          email_entry_skipped = COALESCE($2, tenant_info.email_entry_skipped),
          updated_at = CURRENT_TIMESTAMP
      `,
        [email, emailEntrySkipped],
      );
    } catch (error) {
      console.error("Error setting tenant info:", error);
    } finally {
      client.release();
    }
  }

  // Utility methods
  async clearAll(orgId?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const condition = "WHERE org_id = $1";
      const param = [orgId || ""];

      await client.query(`DELETE FROM runs ${condition}`, param);
      await client.query(`DELETE FROM configurations ${condition}`, param);
      await client.query(`DELETE FROM workflow_schedules ${condition}`, param);
      await client.query(`DELETE FROM integration_details ${condition}`, param); // Delete details first
      await client.query(`DELETE FROM integrations ${condition}`, param);
      await client.query(`DELETE FROM tool_history ${condition}`, param);
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
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch (error) {
      return false;
    }
  }

  async getTemplateOAuthCredentials(params: {
    templateId: string;
  }): Promise<{ client_id: string; client_secret: string } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT sg_client_id, sg_client_secret FROM integration_templates WHERE id = $1",
        [params.templateId],
      );

      if (!result.rows[0]) return null;

      const decrypted = credentialEncryption.decrypt({
        secret: result.rows[0].sg_client_secret,
      });

      return {
        client_id: result.rows[0].sg_client_id,
        client_secret: decrypted?.secret || "",
      };
    } catch (error) {
      logMessage(
        "debug",
        `No template OAuth credentials found for ${params.templateId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return null;
    } finally {
      client.release();
    }
  }

  async cacheOAuthSecret(params: {
    uid: string;
    clientId: string;
    clientSecret: string;
    ttlMs: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      const expiresAt = new Date(Date.now() + params.ttlMs);
      const encrypted = credentialEncryption.encrypt({ secret: params.clientSecret });
      const encryptedSecret = encrypted?.secret || params.clientSecret;

      await client.query(
        `INSERT INTO integration_oauth (uid, client_id, client_secret, expires_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (uid) DO UPDATE SET
                    client_id = EXCLUDED.client_id,
                    client_secret = EXCLUDED.client_secret,
                    expires_at = EXCLUDED.expires_at`,
        [params.uid, params.clientId, encryptedSecret, expiresAt],
      );
    } finally {
      client.release();
    }
  }

  async getOAuthSecret(params: {
    uid: string;
  }): Promise<{ clientId: string; clientSecret: string } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT client_id, client_secret, expires_at
                 FROM integration_oauth
                 WHERE uid = $1`,
        [params.uid],
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      if (new Date(row.expires_at) <= new Date()) {
        await client.query("DELETE FROM integration_oauth WHERE uid = $1", [params.uid]);
        return null;
      }

      await client.query("DELETE FROM integration_oauth WHERE uid = $1", [params.uid]);
      const decrypted = credentialEncryption.decrypt({ secret: row.client_secret });

      return {
        clientId: row.client_id,
        clientSecret: decrypted?.secret || "",
      };
    } finally {
      client.release();
    }
  }

  async createDiscoveryRun(params: { run: DiscoveryRun; orgId?: string }): Promise<DiscoveryRun> {
    const { run, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO discovery_runs (id, org_id, sources, data, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [run.id, orgId, JSON.stringify(run.sources), JSON.stringify(run.data), run.status],
      );
      return run;
    } finally {
      client.release();
    }
  }

  async getDiscoveryRun(params: { id: string; orgId?: string }): Promise<DiscoveryRun | null> {
    const { id, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, sources, data, status, created_at FROM discovery_runs WHERE id = $1 AND org_id = $2`,
        [id, orgId],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        sources: row.sources || [],
        data: row.data,
        status: row.status,
        createdAt: new Date(row.created_at),
      };
    } finally {
      client.release();
    }
  }

  async updateDiscoveryRun(params: {
    id: string;
    updates: Partial<DiscoveryRun>;
    orgId?: string;
  }): Promise<DiscoveryRun> {
    const { id, updates, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.sources !== undefined) {
        setClauses.push(`sources = $${paramCount++}`);
        values.push(JSON.stringify(updates.sources));
      }
      if (updates.data !== undefined) {
        setClauses.push(`data = $${paramCount++}`);
        values.push(JSON.stringify(updates.data));
      }
      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramCount++}`);
        values.push(updates.status);
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, orgId);

      await client.query(
        `UPDATE discovery_runs SET ${setClauses.join(", ")} WHERE id = $${paramCount++} AND org_id = $${paramCount++}`,
        values,
      );

      const updated = await this.getDiscoveryRun({ id, orgId });
      if (!updated) throw new Error("Failed to retrieve updated discovery run");
      return updated;
    } finally {
      client.release();
    }
  }

  async listDiscoveryRuns(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: DiscoveryRun[]; total: number }> {
    const { limit = 10, offset = 0, orgId = "" } = params || {};
    const client = await this.pool.connect();
    try {
      const countResult = await client.query(
        `SELECT COUNT(*) FROM discovery_runs WHERE org_id = $1`,
        [orgId],
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT id, org_id, sources, data, status, created_at 
                 FROM discovery_runs WHERE org_id = $1 
                 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [orgId, limit, offset],
      );

      const items = result.rows.map((row) => ({
        id: row.id,
        sources: row.sources || [],
        data: row.data,
        status: row.status,
        createdAt: new Date(row.created_at),
      }));

      return { items, total };
    } finally {
      client.release();
    }
  }

  async deleteDiscoveryRun(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM discovery_runs WHERE id = $1 AND org_id = $2`,
        [id, orgId],
      );
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  async createFileReference(params: {
    file: FileReference;
    orgId?: string;
  }): Promise<FileReference> {
    const { file, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO file_references (id, org_id, storage_uri, processed_storage_uri, metadata, status, error, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          file.id,
          orgId,
          file.storageUri,
          file.processedStorageUri || null,
          JSON.stringify(file.metadata),
          file.status,
          file.error || null,
        ],
      );
      // Fetch and return the complete record with database-generated fields
      const created = await this.getFileReference({ id: file.id, orgId });
      if (!created) throw new Error("Failed to retrieve created file reference");
      return created;
    } finally {
      client.release();
    }
  }

  async getFileReference(params: { id: string; orgId?: string }): Promise<FileReference | null> {
    const { id, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, storage_uri, processed_storage_uri, metadata, status, error, created_at FROM file_references WHERE id = $1 AND org_id = $2`,
        [id, orgId],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        storageUri: row.storage_uri,
        processedStorageUri: row.processed_storage_uri || undefined,
        metadata: row.metadata,
        status: row.status,
        error: row.error || undefined,
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
      };
    } finally {
      client.release();
    }
  }

  async updateFileReference(params: {
    id: string;
    updates: Partial<FileReference>;
    orgId?: string;
  }): Promise<FileReference> {
    const { id, updates, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.storageUri !== undefined) {
        setClauses.push(`storage_uri = $${paramCount++}`);
        values.push(updates.storageUri);
      }
      if (updates.processedStorageUri !== undefined) {
        setClauses.push(`processed_storage_uri = $${paramCount++}`);
        values.push(updates.processedStorageUri);
      }
      if (updates.metadata !== undefined) {
        setClauses.push(`metadata = $${paramCount++}`);
        values.push(JSON.stringify(updates.metadata));
      }
      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramCount++}`);
        values.push(updates.status);
      }
      if (updates.error !== undefined) {
        setClauses.push(`error = $${paramCount++}`);
        values.push(updates.error);
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, orgId);

      await client.query(
        `UPDATE file_references SET ${setClauses.join(", ")} WHERE id = $${paramCount++} AND org_id = $${paramCount++}`,
        values,
      );

      const updated = await this.getFileReference({ id, orgId });
      if (!updated) throw new Error("Failed to retrieve updated file reference");
      return updated;
    } finally {
      client.release();
    }
  }

  async listFileReferences(params?: {
    fileIds?: string[];
    status?: FileStatus;
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: FileReference[]; total: number }> {
    const { fileIds, status, limit = 10, offset = 0, orgId = "" } = params || {};
    const client = await this.pool.connect();
    try {
      let whereClause = "WHERE org_id = $1";
      const queryParams: any[] = [orgId];
      let paramCount = 2;

      if (fileIds && fileIds.length > 0) {
        whereClause += ` AND id = ANY($${paramCount++})`;
        queryParams.push(fileIds);
      }
      if (status) {
        whereClause += ` AND status = $${paramCount++}`;
        queryParams.push(status);
      }

      const countResult = await client.query(
        `SELECT COUNT(*) FROM file_references ${whereClause}`,
        queryParams,
      );
      const total = parseInt(countResult.rows[0].count);

      queryParams.push(limit, offset);
      const result = await client.query(
        `SELECT id, org_id, storage_uri, processed_storage_uri, metadata, status, error, created_at 
                 FROM file_references ${whereClause} 
                 ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        queryParams,
      );

      const items = result.rows.map((row) => ({
        id: row.id,
        storageUri: row.storage_uri,
        processedStorageUri: row.processed_storage_uri || undefined,
        metadata: row.metadata,
        status: row.status,
        error: row.error || undefined,
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
      }));

      return { items, total };
    } finally {
      client.release();
    }
  }

  async deleteFileReference(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId = "" } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM file_references WHERE id = $1 AND org_id = $2`,
        [id, orgId],
      );
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  // Org Settings Methods
  private mapOrgSettingsRow(row: any): OrgSettings {
    return {
      orgId: row.org_id,
      notifications: row.notifications || {
        enabled: false,
        rules: [],
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: new Date().toISOString() },
      },
      preferences: row.preferences || {},
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  async getOrgSettings(params: { orgId: string }): Promise<OrgSettings | null> {
    const { orgId } = params;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT org_id, notifications, preferences, created_at, updated_at 
         FROM org_settings WHERE org_id = $1`,
        [orgId],
      );
      if (result.rows.length === 0) return null;
      return this.mapOrgSettingsRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async upsertOrgSettings(params: {
    orgId: string;
    settings: Partial<OrgSettings>;
  }): Promise<OrgSettings> {
    const { orgId, settings } = params;
    const client = await this.pool.connect();
    try {
      // Get existing settings to merge (using existing client to avoid extra connection)
      const existingResult = await client.query(
        `SELECT org_id, notifications, preferences, created_at, updated_at 
         FROM org_settings WHERE org_id = $1`,
        [orgId],
      );
      const existing =
        existingResult.rows.length > 0 ? this.mapOrgSettingsRow(existingResult.rows[0]) : null;

      const notifications = settings.notifications
        ? { ...(existing?.notifications || {}), ...settings.notifications }
        : existing?.notifications || {
            channels: {},
            rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: new Date().toISOString() },
          };

      const preferences = settings.preferences
        ? { ...(existing?.preferences || {}), ...settings.preferences }
        : existing?.preferences || {};

      await client.query(
        `INSERT INTO org_settings (org_id, notifications, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (org_id) DO UPDATE SET
           notifications = $2,
           preferences = $3,
           updated_at = CURRENT_TIMESTAMP
         RETURNING org_id, notifications, preferences, created_at, updated_at`,
        [orgId, JSON.stringify(notifications), JSON.stringify(preferences)],
      );

      // Fetch the updated row using the same client
      const updatedResult = await client.query(
        `SELECT org_id, notifications, preferences, created_at, updated_at 
         FROM org_settings WHERE org_id = $1`,
        [orgId],
      );
      if (updatedResult.rows.length === 0)
        throw new Error("Failed to retrieve upserted org settings");
      return this.mapOrgSettingsRow(updatedResult.rows[0]);
    } finally {
      client.release();
    }
  }
}
