import { describe, expect, it } from 'vitest';
import { callPostgres } from "./postgres.js";

let shouldSkip = true;

describe('callPostgres', () => {
  const connectionString = 'postgres://user:password@localhost:5432/testdb';
  const query = 'SELECT NOW()';

  it.skipIf(shouldSkip)('should connect and execute a simple query', async () => {
    const result = await callPostgres({
      connectionString,
      query,
      params: undefined,
      credentials: {},
      options: { timeout: 5000, retries: 1 }
    });

    expect(result).toBeDefined();
  });
});
