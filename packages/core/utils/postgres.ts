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
  let connectionString = await replaceVariables(composeUrl(endpoint.urlHost, endpoint.urlPath), requestVars);
  connectionString = sanitizeDatabaseName(connectionString);
  
  const bodyParsed = JSON.parse(await replaceVariables(endpoint.body, requestVars));
  const queryText = bodyParsed.query;
  const queryParams = bodyParsed.params || bodyParsed.values; // Support both 'params' and 'values' keys

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
      // Use parameterized query if params are provided, otherwise fall back to simple query
      const result = queryParams 
        ? await pool.query(queryText, queryParams)
        : await pool.query(queryText);
      await pool.end();
      return result.rows;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        await pool.end();
        if (error instanceof Error) {
          const errorContext = queryParams 
            ? ` for query: ${queryText} with params: ${JSON.stringify(queryParams)}`
            : ` for query: ${queryText}`;
          throw new Error(`PostgreSQL error: ${error.message}${errorContext}`);
        }
        throw new Error('Unknown PostgreSQL error occurred');
      }

      const retryDelay = options?.retryDelay || DEFAULT_RETRY_DELAY;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);
}