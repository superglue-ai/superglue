import { ApiConfig, RequestOptions } from "@superglue/client";
import { Pool, PoolConfig } from 'pg';
import { composeUrl } from "./tools.js";

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

export async function callPostgres(
  endpointWithProcessedValues: ApiConfig,
  payload: Record<string, any>,
  credentials: Record<string, any>,
  options: RequestOptions
): Promise<any> {
  // IMPORTANT: This function expects urlHost, urlPath, and body to have variables already replaced
  // Variable replacement should be done by the caller (callEndpoint) before calling this function

  let connectionString = composeUrl(endpointWithProcessedValues.urlHost, endpointWithProcessedValues.urlPath);
  connectionString = sanitizeDatabaseName(connectionString);

  // Parse query from pre-processed body
  if (!endpointWithProcessedValues.body) {
    throw new Error("PostgreSQL query body is required");
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(endpointWithProcessedValues.body);
  } catch (e) {
    throw new Error(`Invalid PostgreSQL query body: ${e.message}`);
  }

  if (!parsedBody.query) {
    throw new Error("PostgreSQL query body must contain a 'query' field");
  }

  const query = parsedBody.query;

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