import { composeUrl } from "./tools.js";
import { ApiConfig } from "@superglue/shared";
import { replaceVariables } from "./tools.js";
import { RequestOptions } from "@superglue/shared";
import pkg from 'pg';
const { Pool } = pkg;
type PoolConfig = pkg.PoolConfig;

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

export async function callPostgres(endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions): Promise<any> {
  const requestVars = { ...payload, ...credentials };
  const connectionString = replaceVariables(composeUrl(endpoint.urlHost, endpoint.urlPath), requestVars);
  const query = replaceVariables(JSON.parse(endpoint.body).query, requestVars);

  const poolConfig: PoolConfig = {
    connectionString,
    statement_timeout: options.timeout || DEFAULT_TIMEOUT,
  };

  const pool = new Pool(poolConfig);
  let attempts = 0;
  
  while (true) {
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      attempts++;
      const maxRetries = options.retries ?? DEFAULT_RETRIES;
      
      if (attempts > maxRetries) {
        if (error instanceof Error) {
          throw new Error(`PostgreSQL error after ${attempts} attempts: ${error.message}`);
        }
        throw new Error('Unknown PostgreSQL error occurred');
      }

      // Wait before retrying
      const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } finally {
      if (attempts >= (options.retries ?? DEFAULT_RETRIES)) {
        await pool.end();
      }
    }
  }
}
