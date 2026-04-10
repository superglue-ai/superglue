/**
 * PostgreSQL Strategy for Deno runtime
 *
 * Uses npm:pg for PostgreSQL connections.
 */

import { Pool, type PoolConfig } from "npm:pg";
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

// Connection pool cache
interface PoolCacheEntry {
  pool: Pool;
  lastUsed: number;
  connectionString: string;
}

const poolCache = new Map<string, PoolCacheEntry>();

/**
 * Get or create a connection pool
 */
function getOrCreatePool(connectionString: string, poolConfig: PoolConfig): Pool {
  const cacheKey = connectionString;
  const existingEntry = poolCache.get(cacheKey);

  if (existingEntry) {
    existingEntry.lastUsed = Date.now();
    return existingEntry.pool;
  }

  const pool = new Pool({
    ...poolConfig,
    max: 10,
    idleTimeoutMillis: DENO_DEFAULTS.POSTGRES.DEFAULT_TIMEOUT,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err: Error) => {
    console.error("Unexpected pool error:", err);
    poolCache.delete(cacheKey);
  });

  poolCache.set(cacheKey, {
    pool,
    lastUsed: Date.now(),
    connectionString,
  });

  return pool;
}

/**
 * Execute a PostgreSQL step
 */
export async function executePostgresStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
): Promise<StepExecutionResult> {
  try {
    const rows = await callPostgres({
      endpoint: config,
      payload,
      credentials,
      options,
      metadata,
    });
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Main PostgreSQL call function
 */
async function callPostgres({
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
    bodyParsed = parseJSON(resolvedBody) as {
      query: string;
      params?: unknown[];
      values?: unknown[];
    };
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${(error as Error).message} for body: ${JSON.stringify(endpoint.body)}`,
    );
  }

  const queryText = bodyParsed.query;
  const queryParams = bodyParsed.params || bodyParsed.values;

  const poolConfig: PoolConfig = {
    connectionString,
    statement_timeout: options?.timeout || DENO_DEFAULTS.POSTGRES.DEFAULT_TIMEOUT,
    ssl:
      connectionString.includes("sslmode=") || !connectionString.includes("localhost")
        ? { rejectUnauthorized: false }
        : false,
  };

  const pool = getOrCreatePool(connectionString, poolConfig);
  let attempts = 0;
  const maxRetries = options?.retries || DENO_DEFAULTS.POSTGRES.DEFAULT_RETRIES;

  do {
    try {
      debug(`Executing PostgreSQL query: ${queryText?.split(" ")?.[0]}`, metadata);
      const result = queryParams
        ? await pool.query(queryText, queryParams as unknown[])
        : await pool.query(queryText);
      return result.rows;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        const errorContext = queryParams
          ? ` for query: ${queryText} with params: ${JSON.stringify(queryParams)}`
          : ` for query: ${queryText}`;
        throw new Error(`PostgreSQL error: ${(error as Error).message}${errorContext}`);
      }

      const retryDelay = options?.retryDelay || DENO_DEFAULTS.POSTGRES.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);

  throw new Error("PostgreSQL query failed after all retries");
}

/**
 * Close all connection pools (for cleanup)
 */
export async function closeAllPools(): Promise<void> {
  const closePromises = Array.from(poolCache.values()).map((entry) =>
    entry.pool.end().catch(console.error),
  );
  await Promise.all(closePromises);
  poolCache.clear();
}
