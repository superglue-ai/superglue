import { ApiConfig, RequestOptions } from "@superglue/client";
import { Pool, PoolConfig } from "pg";
import { server_defaults } from "../../default.js";
import { parseJSON } from "../../utils/json-parser.js";
import { composeUrl, replaceVariables } from "../../utils/tools.js";

// Pool cache management
interface PoolCacheEntry {
  pool: Pool;
  lastUsed: number;
  connectionString: string;
}

const poolCache = new Map<string, PoolCacheEntry>();

// Start cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of poolCache.entries()) {
        if (now - entry.lastUsed > server_defaults.POSTGRES.POOL_IDLE_TIMEOUT) {
          entry.pool.end().catch(console.error);
          poolCache.delete(key);
        }
      }
    }, server_defaults.POSTGRES.POOL_CLEANUP_INTERVAL);

    // Prevent the interval from keeping the process alive
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }
}

function getOrCreatePool(
  connectionString: string,
  poolConfig: PoolConfig,
): Pool {
  const cacheKey = connectionString;
  const existingEntry = poolCache.get(cacheKey);

  if (existingEntry) {
    existingEntry.lastUsed = Date.now();
    return existingEntry.pool;
  }

  const pool = new Pool({
    ...poolConfig,
    max: 10,
    idleTimeoutMillis: server_defaults.POSTGRES.DEFAULT_TIMEOUT,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error("Unexpected pool error:", err);
    poolCache.delete(cacheKey);
  });

  poolCache.set(cacheKey, {
    pool,
    lastUsed: Date.now(),
    connectionString,
  });

  startCleanupInterval();

  return pool;
}

export async function closeAllPools(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  const closePromises = Array.from(poolCache.values()).map((entry) =>
    entry.pool.end().catch(console.error),
  );

  await Promise.all(closePromises);
  poolCache.clear();
}

function sanitizeDatabaseName(connectionString: string): string {
  let cleanUrl = connectionString.replace(/\/+$/, "");

  const lastSlashIndex = cleanUrl.lastIndexOf("/");
  if (lastSlashIndex === -1) return cleanUrl;

  const baseUrl = cleanUrl.substring(0, lastSlashIndex + 1);
  const dbName = cleanUrl.substring(lastSlashIndex + 1);

  const cleanDbName = dbName
    .replace(/[^a-zA-Z0-9_$-]/g, "")
    .replace(/^-+|-+$/g, "");

  return baseUrl + cleanDbName;
}

export async function callPostgres(
  endpoint: ApiConfig,
  payload: Record<string, any>,
  credentials: Record<string, any>,
  options: RequestOptions,
): Promise<any> {
  const requestVars = { ...payload, ...credentials };
  let connectionString = await replaceVariables(
    composeUrl(endpoint.urlHost, endpoint.urlPath),
    requestVars,
  );
  connectionString = sanitizeDatabaseName(connectionString);

  let bodyParsed: any;
  try {
    bodyParsed = parseJSON(await replaceVariables(endpoint.body, requestVars));
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${error.message} for body: ${JSON.stringify(endpoint.body)}`,
    );
  }
  const queryText = bodyParsed.query;
  const queryParams = bodyParsed.params || bodyParsed.values;

  const poolConfig: PoolConfig = {
    connectionString,
    statement_timeout:
      options?.timeout || server_defaults.POSTGRES.DEFAULT_TIMEOUT,
    ssl:
      connectionString.includes("sslmode=") ||
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1") === false
        ? { rejectUnauthorized: false }
        : false,
  };

  const pool = getOrCreatePool(connectionString, poolConfig);
  let attempts = 0;
  const maxRetries =
    options?.retries || server_defaults.POSTGRES.DEFAULT_RETRIES;

  do {
    try {
      const result = queryParams
        ? await pool.query(queryText, queryParams)
        : await pool.query(queryText);
      return result.rows;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        if (error instanceof Error) {
          const errorContext = queryParams
            ? ` for query: ${queryText} with params: ${JSON.stringify(queryParams)}`
            : ` for query: ${queryText}`;
          throw new Error(`PostgreSQL error: ${error.message}${errorContext}`);
        }
        throw new Error("Unknown PostgreSQL error occurred");
      }

      const retryDelay =
        options?.retryDelay || server_defaults.POSTGRES.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);
}
