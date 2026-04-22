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

const IS_LINUX = Deno.build.os === "linux";

interface PgBackend {
  query(
    connectionString: string,
    queryText: string,
    queryParams: unknown[] | undefined,
    options: RequestOptions,
    metadata: ServiceMetadata,
  ): Promise<Record<string, unknown>[]>;
  closeAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Backend A: jsr:@db/postgres (Deno-native, works on Linux)
// ---------------------------------------------------------------------------

async function createDenoBackend(): Promise<PgBackend> {
  const { Pool } = await import("jsr:@db/postgres@0.19.5");
  type ClientOptions = {
    hostname?: string;
    port?: string | number;
    user?: string;
    password?: string;
    database?: string;
    tls?: { enabled?: boolean; enforce?: boolean; caCertificates?: string[] };
    applicationName?: string;
    options?: string;
  };

  const CA_BUNDLE_PATHS = [
    "/usr/local/share/ca-certificates/aws-rds-global-bundle.crt",
    "/etc/ssl/certs/aws-rds-global-bundle.pem",
  ];

  let _caCerts: string[] | null = null;
  function loadCaCerts(): string[] {
    if (_caCerts !== null) return _caCerts;
    _caCerts = [];
    for (const path of CA_BUNDLE_PATHS) {
      try {
        const pem = Deno.readTextFileSync(path);
        const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
        if (certs) {
          _caCerts = certs;
          break;
        }
      } catch {
        /* file not found, try next */
      }
    }
    return _caCerts;
  }

  interface PoolEntry {
    pool: InstanceType<typeof Pool>;
    lastUsed: number;
    hasConnected: boolean;
  }
  const pools = new Map<string, PoolEntry>();

  function buildOpts(cs: string): ClientOptions {
    const url = new URL(cs.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
    const sslmode = url.searchParams.get("sslmode") || "";
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const tlsDisabled = sslmode === "disable" || (isLocal && !sslmode);
    const caCerts = loadCaCerts();
    const tls = tlsDisabled
      ? ({ enabled: false } as const)
      : {
          enabled: true,
          enforce: sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full",
          ...(caCerts.length > 0 ? { caCertificates: caCerts } : {}),
        };
    const opts: ClientOptions = {
      hostname: url.hostname,
      port: url.port || "5432",
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, "") || undefined,
      tls,
    };
    const app = url.searchParams.get("application_name");
    if (app) opts.applicationName = app;
    const pgOpts = url.searchParams.get("options");
    if (pgOpts) opts.options = pgOpts;
    return opts;
  }

  function getPool(cs: string): PoolEntry {
    const existing = pools.get(cs);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }
    const pool = new Pool(buildOpts(cs), 10, true);
    const entry: PoolEntry = { pool, lastUsed: Date.now(), hasConnected: false };
    pools.set(cs, entry);
    return entry;
  }

  return {
    async query(cs, queryText, queryParams, options, metadata) {
      const entry = getPool(cs);
      const client = await entry.pool.connect();
      entry.hasConnected = true;
      try {
        const timeout = options?.timeout || DENO_DEFAULTS.POSTGRES.DEFAULT_TIMEOUT;
        await client.queryObject(`SET statement_timeout = ${timeout}`);
        debug(`Executing PostgreSQL query: ${queryText?.split(" ")?.[0]}`, metadata);
        const result = queryParams
          ? await client.queryObject(queryText, queryParams as unknown[])
          : await client.queryObject(queryText);
        return result.rows as Record<string, unknown>[];
      } finally {
        client.release();
      }
    },
    async closeAll() {
      const promises = Array.from(pools.values()).map((e) =>
        e.hasConnected ? e.pool.end().catch(() => {}) : Promise.resolve(),
      );
      await Promise.all(promises);
      pools.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Backend B: npm:pg (Node compat, works on macOS / Windows)
// ---------------------------------------------------------------------------

async function createNodeBackend(): Promise<PgBackend> {
  const pg = await import("npm:pg");
  const Pool = pg.default?.Pool ?? pg.Pool;
  const { Buffer } = await import("node:buffer");
  const { createConnection } = await import("node:net");

  type NpmPool = InstanceType<typeof Pool>;
  interface PoolEntry {
    pool: NpmPool;
    lastUsed: number;
    connectionString: string;
  }
  const pools = new Map<string, PoolEntry>();

  function getNodePoolCacheKey(cs: string, options: RequestOptions): string {
    const timeout = options?.timeout || DENO_DEFAULTS.POSTGRES.DEFAULT_TIMEOUT;
    return `${cs}::timeout=${timeout}`;
  }

  async function resolveSsl(
    cs: string,
    metadata: ServiceMetadata,
  ): Promise<false | { rejectUnauthorized: boolean }> {
    if (cs.includes("sslmode=disable")) return false;
    if (cs.includes("sslmode=")) return { rejectUnauthorized: false };
    try {
      const url = new URL(cs.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
      const host = url.hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        return false;
      }
      const port = parseInt(url.port, 10) || 5432;
      const supportsSSL = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host, port }, () => {
          const buf = Buffer.alloc(8);
          buf.writeInt32BE(8, 0);
          buf.writeInt32BE(80877103, 4);
          socket.write(buf);
        });
        socket.setTimeout(3000);
        socket.once("data", (data) => {
          socket.destroy();
          resolve(data.toString("utf8", 0, 1) === "S");
        });
        socket.once("timeout", () => {
          socket.destroy();
          resolve(false);
        });
        socket.once("error", () => {
          socket.destroy();
          resolve(false);
        });
      });
      debug(
        `SSL probe for ${host}:${port}: ${supportsSSL ? "supported" : "not supported"}`,
        metadata,
      );
      return supportsSSL ? { rejectUnauthorized: false } : false;
    } catch {
      debug("SSL probe failed, defaulting to SSL", metadata);
      return { rejectUnauthorized: false };
    }
  }

  async function getPool(
    cs: string,
    options: RequestOptions,
    metadata: ServiceMetadata,
  ): Promise<NpmPool> {
    const cacheKey = getNodePoolCacheKey(cs, options);
    const existing = pools.get(cacheKey);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.pool;
    }
    const pool = new Pool({
      connectionString: cs,
      statement_timeout: options?.timeout || DENO_DEFAULTS.POSTGRES.DEFAULT_TIMEOUT,
      ssl: await resolveSsl(cs, metadata),
      max: 10,
      idleTimeoutMillis: DENO_DEFAULTS.POSTGRES.DEFAULT_TIMEOUT,
      connectionTimeoutMillis: DENO_DEFAULTS.POSTGRES.CONNECTION_TIMEOUT,
    });
    pool.on("error", (err: Error) => {
      console.error("Unexpected pool error:", err);
      pools.delete(cacheKey);
    });
    pools.set(cacheKey, { pool, lastUsed: Date.now(), connectionString: cs });
    return pool;
  }

  return {
    async query(cs, queryText, queryParams, options, metadata) {
      const pool = await getPool(cs, options, metadata);
      debug(`Executing PostgreSQL query: ${queryText?.split(" ")?.[0]}`, metadata);
      const result = queryParams
        ? await pool.query(queryText, queryParams as unknown[])
        : await pool.query(queryText);
      return result.rows;
    },
    async closeAll() {
      const promises = Array.from(pools.values()).map((e) => e.pool.end().catch(console.error));
      await Promise.all(promises);
      pools.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton backend — lazily initialized on first use
// ---------------------------------------------------------------------------

let _backend: PgBackend | null = null;
let _backendPromise: Promise<PgBackend> | null = null;

async function getBackend(): Promise<PgBackend> {
  if (_backend) return _backend;
  if (!_backendPromise) {
    _backendPromise = (IS_LINUX ? createDenoBackend() : createNodeBackend()).then(
      (b) => {
        _backend = b;
        return b;
      },
      (err) => {
        _backendPromise = null;
        throw err;
      },
    );
  }
  return _backendPromise;
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures)
// ---------------------------------------------------------------------------

export async function executePostgresStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
): Promise<StepExecutionResult> {
  try {
    const rows = await callPostgres({ endpoint: config, payload, credentials, options, metadata });
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

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

  const backend = await getBackend();
  let attempts = 0;
  const maxRetries = options?.retries || DENO_DEFAULTS.POSTGRES.DEFAULT_RETRIES;

  do {
    try {
      return await backend.query(connectionString, queryText, queryParams, options, metadata);
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

export async function closeAllPools(): Promise<void> {
  if (_backend) await _backend.closeAll();
}
