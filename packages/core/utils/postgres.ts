import { ApiConfig, RequestOptions } from "@superglue/client";
import { Pool, PoolConfig } from 'pg';
import { composeUrl, replaceVariables } from "./tools.js";

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

function sanitizeDatabaseName(connectionString: string): string {
  // First remove any trailing slashes
  let cleanUrl = connectionString.replace(/\/+$/, '');

  // Now find the last '/' to get the database name
  const lastSlashIndex = cleanUrl.lastIndexOf('/');
  if (lastSlashIndex === -1) return cleanUrl;

  const baseUrl = cleanUrl.substring(0, lastSlashIndex + 1);
  const dbName = cleanUrl.substring(lastSlashIndex + 1);

  // Clean the database name of invalid characters
  const cleanDbName = dbName
    .replace(/[^a-zA-Z0-9_$-]/g, '') // Keep only valid chars
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  return baseUrl + cleanDbName;
}

export async function callPostgres(endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions): Promise<any> {
  const requestVars = { ...payload, ...credentials };
  const urlHost = await replaceVariables(endpoint.urlHost, requestVars);
  const urlPath = await replaceVariables(endpoint.urlPath, requestVars);
  const body = await replaceVariables(endpoint.body, requestVars);

  // Compose and sanitize connection string
  let connectionString = composeUrl(urlHost, urlPath);
  connectionString = sanitizeDatabaseName(connectionString);

  // Parse query from body
  const query = JSON.parse(body).query;

  const poolConfig: PoolConfig = {
    connectionString,
    statement_timeout: options?.timeout || DEFAULT_TIMEOUT,
    ssl: {
      rejectUnauthorized: false, // Set to true for production with valid certs
      // ca: fs.readFileSync('path/to/ca-cert.pem'), // Optional: CA certificate
      // cert: fs.readFileSync('path/to/client-cert.pem'), // Optional: client certificate
      // key: fs.readFileSync('path/to/client-key.pem'), // Optional: client key
    }
  };

  const pool = new Pool(poolConfig);
  let attempts = 0;
  const maxRetries = options?.retries || DEFAULT_RETRIES;

  do {
    try {
      const result = await pool.query(query);
      await pool.end();
      return result.rows;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        await pool.end();
        if (error instanceof Error) {
          throw new Error(`PostgreSQL error after ${attempts} attempts: ${error.message}`);
        }
        throw new Error('Unknown PostgreSQL error occurred');
      }

      const retryDelay = options?.retryDelay || DEFAULT_RETRY_DELAY;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);
}