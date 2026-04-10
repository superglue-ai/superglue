/**
 * MSSQL Strategy for Deno runtime
 *
 * Uses npm:mssql for Microsoft SQL Server / Azure SQL connections.
 */

import sql from "npm:mssql";
import { createHash } from "node:crypto";
import type {
  RequestStepConfig,
  RequestOptions,
  ServiceMetadata,
  StepExecutionResult,
} from "../types.ts";
import { DENO_DEFAULTS } from "../types.ts";
import { replaceVariables } from "../utils/transform.ts";
import { parseJSON } from "../utils/files.ts";
import { debug } from "../utils/logging.ts";

type MSSQLConfig = sql.config;

interface PoolCacheEntry {
  pool: sql.ConnectionPool;
  lastUsed: number;
  connectionString: string;
}

const poolCache = new Map<string, PoolCacheEntry>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of poolCache.entries()) {
      if (now - entry.lastUsed > DENO_DEFAULTS.MSSQL.POOL_IDLE_TIMEOUT) {
        entry.pool.close().catch((err: Error) => {
          console.error(`Failed to close idle MSSQL pool: ${err?.message || String(err)}`);
        });
        poolCache.delete(key);
      }
    }
  }, DENO_DEFAULTS.MSSQL.POOL_CLEANUP_INTERVAL);

  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    (cleanupInterval as { unref: () => void }).unref();
  }
}

function parseConnectionString(connectionString: string): MSSQLConfig {
  let urlString = connectionString
    .replace(/^mssql:\/\//, "sqlserver://")
    .replace(/^sqlserver:\/\//, "sqlserver://");

  const semicolonMatch = urlString.match(/^(sqlserver:\/\/[^;]+)(;.+)$/);
  if (semicolonMatch) {
    const [, baseUrl, params] = semicolonMatch;
    const queryParams = params
      .slice(1)
      .split(";")
      .map((param) => {
        const [key, value] = param.split("=");
        return key === "database"
          ? null
          : `${encodeURIComponent(key)}=${encodeURIComponent(value || "")}`;
      })
      .filter(Boolean)
      .join("&");

    const dbMatch = params.match(/database=([^;]+)/);
    const database = dbMatch ? dbMatch[1] : "";
    urlString = `${baseUrl}/${database}${queryParams ? `?${queryParams}` : ""}`;
  }

  const url = new URL(urlString);

  const config: MSSQLConfig = {
    server: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 1433,
    database: url.pathname.replace(/^\//, ""),
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };

  url.searchParams.forEach((value, key) => {
    if (key === "encrypt") {
      config.options!.encrypt = value === "true";
    } else if (key === "trustServerCertificate") {
      config.options!.trustServerCertificate = value === "true";
    } else if (key === "database" && !config.database) {
      config.database = value;
    }
  });

  return config;
}

async function getOrCreatePool(
  connectionString: string,
  timeout: number,
): Promise<sql.ConnectionPool> {
  const cacheKey = createHash("sha256").update(connectionString).digest("hex");
  const existing = poolCache.get(cacheKey);

  if (existing) {
    existing.lastUsed = Date.now();
    if (!existing.pool.connected && !existing.pool.connecting) {
      await existing.pool.connect();
    }
    return existing.pool;
  }

  const config = parseConnectionString(connectionString);
  config.requestTimeout = timeout;
  config.connectionTimeout = DENO_DEFAULTS.MSSQL.CONNECTION_TIMEOUT;
  config.pool = {
    max: DENO_DEFAULTS.MSSQL.POOL_MAX,
    min: DENO_DEFAULTS.MSSQL.POOL_MIN,
    idleTimeoutMillis: DENO_DEFAULTS.MSSQL.POOL_IDLE_TIMEOUT,
  };

  const pool = new sql.ConnectionPool(config);

  pool.on("error", (err: Error) => {
    console.error(`Unexpected MSSQL pool error: ${err.message}`);
    poolCache.delete(cacheKey);
  });

  await pool.connect();

  poolCache.set(cacheKey, {
    pool,
    lastUsed: Date.now(),
    connectionString,
  });

  startCleanupInterval();
  return pool;
}

export async function executeMssqlStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
): Promise<StepExecutionResult> {
  try {
    const rows = await callMssql({ endpoint: config, payload, credentials, options, metadata });
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function callMssql({
  endpoint,
  payload,
  credentials,
  options,
  metadata,
}: {
  endpoint: RequestStepConfig;
  payload: Record<string, unknown>;
  credentials: Record<string, unknown>;
  options: RequestOptions;
  metadata: ServiceMetadata;
}): Promise<unknown> {
  const requestVars = { ...payload, ...credentials };
  let connectionString = await replaceVariables(endpoint.url, requestVars, metadata);
  connectionString = connectionString.replace(/\/+(\?)/, "$1").replace(/\/+$/, "");

  let bodyParsed: { query: string; params?: unknown[]; values?: unknown[] };
  try {
    const resolvedBody = await replaceVariables(endpoint.body || "", requestVars, metadata);
    bodyParsed = parseJSON(resolvedBody) as typeof bodyParsed;
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${(error as Error).message} for body: ${JSON.stringify(endpoint.body)}`,
    );
  }

  const queryText = bodyParsed.query;
  const queryParams = bodyParsed.params || bodyParsed.values;

  if (typeof queryText !== "string" || !queryText.trim()) {
    throw new Error("Query must be a non-empty string");
  }
  if (queryParams !== undefined && !Array.isArray(queryParams)) {
    throw new Error("Params must be an array");
  }

  const timeout = options?.timeout ?? DENO_DEFAULTS.MSSQL.DEFAULT_TIMEOUT;
  const pool = await getOrCreatePool(connectionString, timeout);
  let attempts = 0;
  const maxRetries = options?.retries ?? DENO_DEFAULTS.MSSQL.DEFAULT_RETRIES;

  do {
    try {
      debug(`Executing MSSQL query: ${queryText?.split(" ")?.[0]}`, metadata);
      const request = pool.request();

      if (queryParams && Array.isArray(queryParams)) {
        queryParams.forEach((value, index) => {
          request.input(`param${index + 1}`, value);
        });
      }

      const result = await request.query(queryText);
      return result.recordset || [];
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        const truncatedQuery = queryText?.substring(0, 100) || "";
        const queryPreview =
          truncatedQuery.length < (queryText?.length || 0)
            ? `${truncatedQuery}...`
            : truncatedQuery;
        const errorContext = queryParams?.length
          ? ` for query: ${queryPreview} (${queryParams.length} params)`
          : ` for query: ${queryPreview}`;
        throw new Error(`MSSQL error: ${(error as Error).message}${errorContext}`);
      }

      const retryDelay = options?.retryDelay ?? DENO_DEFAULTS.MSSQL.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);

  throw new Error("MSSQL query failed after all retries");
}

export async function closeAllPools(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  const closePromises = Array.from(poolCache.values()).map((entry) =>
    entry.pool.close().catch((err: Error) => {
      console.error(`Failed to close MSSQL pool during shutdown: ${err?.message || String(err)}`);
    }),
  );

  await Promise.all(closePromises);
  poolCache.clear();
}
