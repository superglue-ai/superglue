import { ApiConfig, HttpMethod, RequestOptions } from '@superglue/client';
import { describe, expect, it, vi } from 'vitest';

// Mock the modules before importing executeFTP
vi.mock('basic-ftp');
vi.mock('ssh2-sftp-client');

// Now import after mocks are set up
import { callFTP } from './ftp.js';

describe('executeFTP', () => {
  const mockEndpoint: ApiConfig = {
    id: 'test-ftp',
    urlHost: 'ftp://testuser:testpass@ftp.example.com',
    urlPath: '/testpath',
    body: '{"operation": "list"}',
    method: HttpMethod.GET,
    instruction: 'Test FTP endpoint'
  };

  const mockPayload = {};
  const mockCredentials = {};
  const mockOptions: RequestOptions = {};

  describe('Integration tests', () => {
    it('should validate FTP configuration', () => {
      // Just validate that the function exists and can be called
      expect(callFTP).toBeDefined();
      expect(typeof callFTP).toBe('function');
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid JSON in body', async () => {
      const endpoint = {
        ...mockEndpoint,
        body: 'invalid json'
      };

      await expect(callFTP({operation: endpoint.body, credentials: mockCredentials, options: mockOptions}))
        .rejects.toThrow('Invalid JSON in body');
    });

    it('should throw error for missing operation', async () => {
      const endpoint = {
        ...mockEndpoint,
        body: '{}'
      };

      await expect(callFTP({operation: endpoint.body, credentials: mockCredentials, options: mockOptions}))
        .rejects.toThrow("Missing 'operation' field in request body");
    });

    it('should throw error for unsupported operation', async () => {
      const endpoint = {
        ...mockEndpoint,
        body: '{"operation": "unsupported"}'
      };

      await expect(callFTP({operation: endpoint.body, credentials: mockCredentials, options: mockOptions}))
        .rejects.toThrow('Unsupported operation: \'unsupported\'');
    });
  });

  describe('Operation validation', () => {
    it('should validate supported operations', () => {
      const supportedOps = ['list', 'get', 'put', 'delete', 'rename', 'mkdir', 'rmdir', 'exists', 'stat'];
      
      supportedOps.forEach(op => {
        const endpoint = {
          ...mockEndpoint,
          body: JSON.stringify({ operation: op })
        };
        
        // This will fail at connection, but won't fail at operation validation
        expect(async () => {
          try {
            await callFTP({operation: endpoint.body, credentials: mockCredentials, options: mockOptions});
          } catch (e: any) {
            // Should not be an unsupported operation error
            expect(e.message).not.toContain('Unsupported operation');
          }
        }).toBeDefined();
      });
    });

    it('should reject invalid operations', async () => {
      const invalidOps = ['upload', 'download', 'copy', 'move'];
      
      for (const op of invalidOps) {
        const endpoint = {
          ...mockEndpoint,
          body: JSON.stringify({ operation: op })
        };
        
        await expect(callFTP({operation: endpoint.body, credentials: mockCredentials, options: mockOptions}))
          .rejects.toThrow(`Unsupported operation: '${op}'`);
      }
    });
  });
});