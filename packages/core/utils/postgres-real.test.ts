import { ApiConfig } from "@/packages/shared/types.js";
import { callPostgres } from "./postgres.js";
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';

let shouldSkip = false;

beforeAll(async () => {
  const client = new Client({
    connectionString: 'postgres://user:password@localhost:5432/testdb'
  });
  
  try {
    await client.connect();
    await client.end();
  } catch (error) {
    shouldSkip = true;
  }
});

describe('callPostgres', () => {
    const testConfig: ApiConfig = {
      id: '1',
      instruction: 'test',
      urlHost: 'postgres://user:password@localhost:5432',
      urlPath: '/testdb',
      body: JSON.stringify({
        query: 'SELECT NOW()'
      })
    };
  
    it.skipIf(shouldSkip)('should connect and execute a simple query', async () => {
      const result = await callPostgres(
        testConfig,
        {}, // payload
        {}, // credentials
        { timeout: 5000, retries: 1 } // options
      );
      
      expect(result).toBeDefined();
    });
  });
