import { ApiConfig, RequestOptions } from '@superglue/client';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server_defaults } from '../default.js';
import { callPostgres, closeAllPools } from './postgres.js';

// Create mock functions that we can reference
const mockPoolQuery = vi.fn();
const mockPoolEnd = vi.fn();
const mockPoolOn = vi.fn();

// Mock pg Pool
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    end: mockPoolEnd,
    on: mockPoolOn
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
    // Setup default mock implementations
    mockPoolEnd.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Clean up any cached pools after each test
    await closeAllPools();
  });

  describe('callPostgres', () => {
    it('should execute query successfully', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres(mockEndpoint, mockPayload, mockCredentials, options);

      expect(result).toEqual(mockRows);
      
      // Check Pool was created with correct config
      expect(vi.mocked(Pool)).toHaveBeenCalledWith({
        connectionString: 'postgres://testuser:testpass@localhost:5432/testdb',
        statement_timeout: 30000,
        max: 10,
        idleTimeoutMillis: server_defaults.POSTGRES.DEFAULT_TIMEOUT,
        connectionTimeoutMillis: 5000
      });
      
      // Check query was called
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users');
      
      // Pool should NOT be ended (it's cached now)
      expect(mockPoolEnd).not.toHaveBeenCalled();
    });

    it('should handle query errors', async () => {
      const errorMessage = 'Database error';
      mockPoolQuery.mockRejectedValueOnce(new Error(errorMessage));

      const options: RequestOptions = {};
      await expect(callPostgres(mockEndpoint, mockPayload, mockCredentials, options))
        .rejects.toThrow(`PostgreSQL error: ${errorMessage} for query: SELECT * FROM users`);

      // Pool should NOT be ended (it's cached)
      expect(mockPoolEnd).not.toHaveBeenCalled();
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
      mockPoolQuery.mockRejectedValueOnce(new Error(errorMessage));

      const options: RequestOptions = {};
      await expect(callPostgres(paramEndpoint, {}, mockCredentials, options))
        .rejects.toThrow(`PostgreSQL error: ${errorMessage} for query: SELECT * FROM users WHERE id = $1 with params: [999]`);
    });

    it('should respect custom timeout', async () => {
      const options: RequestOptions = {
        timeout: 5000
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
        
      await callPostgres(mockEndpoint, mockPayload, mockCredentials, options);

            expect(vi.mocked(Pool)).toHaveBeenCalledWith({
        connectionString: expect.any(String),
        statement_timeout: 5000,
        max: 10,
        idleTimeoutMillis: server_defaults.POSTGRES.DEFAULT_TIMEOUT,
        connectionTimeoutMillis: 5000
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
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres(paramEndpoint, {}, mockCredentials, options);

      expect(result).toEqual(mockRows);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND status = $2',
        [123, 'active']
      );
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
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres(paramEndpoint, {}, mockCredentials, options);

      expect(result).toEqual(mockRows);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        ['John Doe', 'john@example.com']
      );
    });

    it('should retry on failure when retries configured', async () => {
      const options: RequestOptions = {
        retries: 2,
        retryDelay: 100
      };

      mockPoolQuery
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce({ rows: [{ success: true }] });

      const result = await callPostgres(mockEndpoint, mockPayload, mockCredentials, options);

      expect(result).toEqual([{ success: true }]);
      expect(mockPoolQuery).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const options: RequestOptions = {
        retries: 1,
        retryDelay: 100
      };

      mockPoolQuery
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'));

      await expect(callPostgres(mockEndpoint, mockPayload, mockCredentials, options))
        .rejects.toThrow(`PostgreSQL error: Second failure for query: SELECT * FROM users`);

      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle variable replacement in query', async () => {
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
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });
        
      const result = await callPostgres(customEndpoint, customPayload, mockCredentials, {});

      expect(result).toEqual(mockRows);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = 123');
    });

    it('should reuse cached pools for same connection string', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockPoolQuery.mockResolvedValue({ rows: mockRows });

      // First call
      await callPostgres(mockEndpoint, mockPayload, mockCredentials, {});
      
      // Second call with same connection string
      await callPostgres(mockEndpoint, mockPayload, mockCredentials, {});

      // Pool should only be created once
      expect(vi.mocked(Pool)).toHaveBeenCalledTimes(1);
      // But query should be called twice
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should sanitize database names with invalid characters', async () => {
      const endpointWithDirtyDb: ApiConfig = {
        id: '1',
        instruction: 'test',
        urlHost: 'postgres://{user}:{password}@{host}:{port}/my-test_db$123///',
        urlPath: '',
        body: JSON.stringify({ query: 'SELECT 1' })
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [{ result: 1 }] });

      await callPostgres(endpointWithDirtyDb, {}, mockCredentials, {});

      // The connection string should have the database name sanitized (trailing slashes removed, $ and - are allowed)
      expect(vi.mocked(Pool)).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: expect.stringMatching(/\/my-test_db\$123$/), // Only trailing slashes removed, $ is kept
        })
      );
    });

    it('should handle pool error events', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Create a pool first
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      await callPostgres(mockEndpoint, mockPayload, mockCredentials, {});

      // Get the error handler that was registered
      const errorHandler = mockPoolOn.mock.calls.find(call => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      // Simulate a pool error
      const testError = new Error('Pool connection lost');
      errorHandler(testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unexpected pool error:', testError);
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('closeAllPools', () => {
    it('should close all cached pools', async () => {
      // Create multiple pools
      mockPoolQuery.mockResolvedValue({ rows: [] });
      
      await callPostgres(mockEndpoint, mockPayload, mockCredentials, {});
      
      const endpoint2 = { ...mockEndpoint, urlHost: 'postgres://user2:pass2@host2/db2' };
      await callPostgres(endpoint2, {}, { user: 'user2', password: 'pass2', host: 'host2', database: 'db2' }, {});

      // Should create 2 pools
      expect(vi.mocked(Pool)).toHaveBeenCalledTimes(2);

      // Close all pools
      await closeAllPools();

      // Both pools should be ended
      expect(mockPoolEnd).toHaveBeenCalledTimes(2);
    });
  });
}); 