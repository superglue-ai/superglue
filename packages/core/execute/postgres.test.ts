import { RequestOptions } from '@superglue/client';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server_defaults } from '../default.js';
import { callPostgres, closeAllPools } from './postgres.js';

const mockPoolQuery = vi.fn();
const mockPoolEnd = vi.fn();
const mockPoolOn = vi.fn();

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    end: mockPoolEnd,
    on: mockPoolOn
  }))
}));

describe('PostgreSQL Utilities', () => {
  const connectionString = 'postgres://{user}:{password}@{host}:{port}/{database}';
  const query = 'SELECT * FROM {table}';

  const mockCredentials = {
    user: 'testuser',
    password: 'testpass',
    host: 'localhost',
    port: '5432',
    database: 'testdb',
    table: 'users'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolEnd.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await closeAllPools();
  });

  describe('callPostgres', () => {
    it('should execute query successfully', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: options });

      expect(result).toEqual(mockRows);
      
      expect(vi.mocked(Pool)).toHaveBeenCalledWith({
        connectionString: 'postgres://testuser:testpass@localhost:5432/testdb',
        statement_timeout: 30000,
        max: 10,
        idleTimeoutMillis: server_defaults.POSTGRES.DEFAULT_TIMEOUT,
        connectionTimeoutMillis: 5000,
        ssl: false
      });

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users');
    });

    it('should handle query errors', async () => {
      const errorMessage = 'Connection failed';
      mockPoolQuery.mockRejectedValue(new Error(errorMessage));

      const options: RequestOptions = {};
      await expect(callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: options }))
        .rejects.toThrow(`PostgreSQL error: ${errorMessage} for query: SELECT * FROM users`);

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users');
    });

    it('should handle parameterized queries', async () => {
      const paramQuery = 'SELECT * FROM users WHERE id = $1';
      const params = [999];
      const errorMessage = 'Record not found';
      mockPoolQuery.mockRejectedValue(new Error(errorMessage));

      const options: RequestOptions = {};
      await expect(callPostgres({ connectionString, query: paramQuery, params, credentials: mockCredentials, options: options }))
        .rejects.toThrow(`PostgreSQL error: ${errorMessage} for query: SELECT * FROM users WHERE id = $1 with params: [999]`);
    });

    it('should use SSL for non-localhost connections', async () => {
      const options: RequestOptions = {};
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
        
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: options });

      expect(vi.mocked(Pool)).toHaveBeenCalledWith({
        connectionString: 'postgres://testuser:testpass@localhost:5432/testdb',
        statement_timeout: 30000,
        max: 10,
        idleTimeoutMillis: server_defaults.POSTGRES.DEFAULT_TIMEOUT,
        connectionTimeoutMillis: 5000,
        ssl: false
      });
    });

    it('should execute parameterized queries with values', async () => {
      const paramQuery = 'SELECT * FROM users WHERE id = $1';
      const params = [999];
      const mockRows = [{ id: 999, name: 'test' }];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres({ connectionString, query: paramQuery, params, credentials: mockCredentials, options: options });

      expect(result).toEqual(mockRows);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [999]);
    });

    it('should execute parameterized queries with params', async () => {
      const paramQuery = 'SELECT * FROM users WHERE id = $1';
      const params = [999];
      const mockRows = [{ id: 999, name: 'test' }];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockRows });

      const options: RequestOptions = {};
      const result = await callPostgres({ connectionString, query: paramQuery, params, credentials: mockCredentials, options: options });

      expect(result).toEqual(mockRows);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [999]);
    });

    it('should retry on transient failures', async () => {
      const options: RequestOptions = { retries: 2, retryDelay: 1 };
      mockPoolQuery
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({ rows: [{ success: true }] });

      const result = await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: options });

      expect(result).toEqual([{ success: true }]);
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const options: RequestOptions = { retries: 1, retryDelay: 1 };
      mockPoolQuery
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'));

      await expect(callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: options }))
        .rejects.toThrow(`PostgreSQL error: Second failure for query: SELECT * FROM users`);

      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle custom timeout', async () => {
      const customTimeout = 60000;
      const options: RequestOptions = { timeout: customTimeout };
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
        
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: options });

      expect(vi.mocked(Pool)).toHaveBeenCalledWith(
        expect.objectContaining({
          statement_timeout: customTimeout
        })
      );
    });

    it('should cache connection pools', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });
      
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });

      expect(vi.mocked(Pool)).toHaveBeenCalledTimes(1);
    });

    it('should sanitize database name', async () => {
      const dirtyConnectionString = 'postgres://{user}:{password}@{host}:{port}/{database}///';
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ result: 1 }] });

      await callPostgres({ connectionString: dirtyConnectionString, query, params: undefined, credentials: mockCredentials, options: {} });

      expect(vi.mocked(Pool)).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgres://testuser:testpass@localhost:5432/testdb'
        })
      );
    });

    it('should remove pool from cache on error', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });

      const errorHandler = mockPoolOn.mock.calls.find(call => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();
      
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      errorHandler(new Error('Pool error'));
      consoleErrorSpy.mockRestore();

      vi.clearAllMocks();
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });

      expect(vi.mocked(Pool)).toHaveBeenCalledTimes(1);
    });

    it('should create separate pools for different connection strings', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });
      
      const connectionString2 = 'postgres://user2:pass2@host2/db2';
      const credentials2 = { user: 'user2', password: 'pass2', host: 'host2', database: 'db2', table: 'users' };
      await callPostgres({ connectionString: connectionString2, query, params: undefined, credentials: credentials2, options: {} });

      expect(vi.mocked(Pool)).toHaveBeenCalledTimes(2);
    });
  });

  describe('closeAllPools', () => {
    it('should close all pools and clear cache', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });
      
      const connectionString2 = 'postgres://user2:pass2@host2/db2';
      const credentials2 = { user: 'user2', password: 'pass2', host: 'host2', database: 'db2', table: 'users' };
      await callPostgres({ connectionString: connectionString2, query, params: undefined, credentials: credentials2, options: {} });

      await closeAllPools();

      expect(mockPoolEnd).toHaveBeenCalledTimes(2);
    });

    it('should handle pool close errors gracefully', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      mockPoolEnd.mockRejectedValue(new Error('Close error'));
      
      await callPostgres({ connectionString, query, params: undefined, credentials: mockCredentials, options: {} });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await closeAllPools();
      consoleErrorSpy.mockRestore();

      expect(mockPoolEnd).toHaveBeenCalled();
    });
  });
});
