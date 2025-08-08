import { ApiConfig, RequestOptions } from '@superglue/client';
import { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callPostgres } from './postgres.js';

// Create mock functions that we can reference
const mockQuery = vi.fn();
const mockEnd = vi.fn();

// Mock pg Pool
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: mockQuery,
    end: mockEnd
  }))
}));

describe('PostgreSQL Utilities', () => {
  const mockEndpoint: ApiConfig = {
    id: '1',
    instruction: 'test',
    urlHost: 'postgres://{user}:{password}@{host}:{port}/{database}',
    urlPath: '',
    body: JSON.stringify({ query: 'SELECT * FROM {table}' })
  };

  const mockCredentials = {
    user: 'testuser',
    password: 'testpass',
    host: 'localhost',
    port: '5432',
    database: 'testdb'
  };

  const mockPayload = {
    table: 'users'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnd.mockResolvedValue(undefined);
  });

  describe('callPostgres', () => {
    it('should execute query successfully', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres(mockEndpoint, mockPayload, mockCredentials, options);

      expect(result).toEqual(mockRows);
      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgres://testuser:testpass@localhost:5432/testdb',
        statement_timeout: 30000,
        ssl: {
          rejectUnauthorized: false,
        }
      });
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users');
      expect(mockEnd).toHaveBeenCalled();
    });

    it('should handle query errors', async () => {
      const errorMessage = 'Database error';
      mockQuery.mockRejectedValueOnce(new Error(errorMessage));

      const options: RequestOptions = {};
      await expect(callPostgres(mockEndpoint, mockPayload, mockCredentials, options))
        .rejects.toThrow(`PostgreSQL error: ${errorMessage} for query: SELECT * FROM users`);

      expect(mockEnd).toHaveBeenCalled();
    });

    it('should handle parameterized query errors with proper context', async () => {
      const paramEndpoint: ApiConfig = {
        id: '2',
        instruction: 'test with params',
        urlHost: 'postgres://{user}:{password}@{host}:{port}/{database}',
        urlPath: '',
        body: JSON.stringify({ 
          query: 'SELECT * FROM users WHERE id = $1',
          params: [999]
        })
      };

      const errorMessage = 'No rows found';
      mockQuery.mockRejectedValueOnce(new Error(errorMessage));

      const options: RequestOptions = {};
      await expect(callPostgres(paramEndpoint, {}, mockCredentials, options))
        .rejects.toThrow(`PostgreSQL error: ${errorMessage} for query: SELECT * FROM users WHERE id = $1 with params: [999]`);

      expect(mockEnd).toHaveBeenCalled();
    });

    it('should respect custom timeout', async () => {
      const options: RequestOptions = {
        timeout: 5000
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });
      await callPostgres(mockEndpoint, mockPayload, mockCredentials, options);

      expect(Pool).toHaveBeenCalledWith({
        connectionString: expect.any(String),
        statement_timeout: 5000,
        ssl: {
          rejectUnauthorized: false,
        }
      });
    });

    it('should use parameterized queries when params are provided', async () => {
      const paramEndpoint: ApiConfig = {
        id: '2',
        instruction: 'test with params',
        urlHost: 'postgres://{user}:{password}@{host}:{port}/{database}',
        urlPath: '',
        body: JSON.stringify({ 
          query: 'SELECT * FROM users WHERE id = $1 AND status = $2',
          params: [123, 'active']
        })
      };

      const mockRows = [{ id: 123, name: 'test', status: 'active' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres(paramEndpoint, {}, mockCredentials, options);

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND status = $2',
        [123, 'active']
      );
      expect(mockEnd).toHaveBeenCalled();
    });

    it('should support values key as alias for params', async () => {
      const paramEndpoint: ApiConfig = {
        id: '3',
        instruction: 'test with values',
        urlHost: 'postgres://{user}:{password}@{host}:{port}/{database}',
        urlPath: '',
        body: JSON.stringify({ 
          query: 'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
          values: ['John Doe', 'john@example.com']
        })
      };

      const mockRows = [{ id: 1, name: 'John Doe', email: 'john@example.com' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres(paramEndpoint, {}, mockCredentials, options);

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        ['John Doe', 'john@example.com']
      );
    });

    it('should retry on failure when retries configured', async () => {
      // Reset mock state
      mockQuery.mockReset();

      const options: RequestOptions = {
        retries: 2,
        retryDelay: 100
      };

      mockQuery
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce({ rows: [{ success: true }] });

      const result = await callPostgres(mockEndpoint, mockPayload, mockCredentials, options);

      expect(result).toEqual([{ success: true }]);
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      // Reset mock state
      mockQuery.mockReset();

      const options: RequestOptions = {
        retries: 1,
        retryDelay: 100
      };

      // Only mock two failures with no success case
      mockQuery
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        // Ensure no default success case exists
        .mockRejectedValue(new Error('Should not get here'));

      await expect(callPostgres(mockEndpoint, mockPayload, mockCredentials, options))
        .rejects.toThrow(`PostgreSQL error: Second failure for query: SELECT * FROM users`);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle variable replacement in query', async () => {
      // Reset mock state
      mockQuery.mockReset();

      const customEndpoint: ApiConfig = {
        id: '1',
        instruction: 'test',
        urlHost: 'postgres://{user}@{host}/{database}',
        urlPath: '',
        body: JSON.stringify({ query: 'SELECT * FROM {table} WHERE id = {id}' })
      };

      const customPayload = {
        table: 'users',
        id: 123
      };

      const mockRows = [{ id: 123, name: 'test user' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });
      const result = await callPostgres(customEndpoint, customPayload, mockCredentials, {});

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = 123');
    });
  });
}); 