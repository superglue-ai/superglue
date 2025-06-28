import { HttpMethod, PaginationType } from '@superglue/client';
import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { callEndpoint } from '../api.js';

// Mock dependencies
vi.mock('axios');
vi.mock('../tools.js', () => ({
  callAxios: vi.fn().mockImplementation(async (config) => {
    // Mock implementation to simulate API responses
    return {
      status: 200,
      data: { 
        results: [{ id: 1 }, { id: 2 }],
        next_page: 2 
      }
    };
  }),
  replaceVariables: vi.fn().mockImplementation(async (template) => template),
  composeUrl: vi.fn().mockImplementation((host, path) => `${host}/${path}`),
}));

vi.mock('../postgres.js', () => ({
  callPostgres: vi.fn(),
}));

describe('API Pagination Handling', () => {
  it('should handle page-based pagination properly', async () => {
    const mockAxios = axios as jest.MockedFunction<typeof axios>;
    const mockResponses = [
      { status: 200, data: { results: [{ id: 1 }, { id: 2 }], next_page: 2 } },
      { status: 200, data: { results: [{ id: 3 }, { id: 4 }], next_page: null } }
    ];
    
    let callCount = 0;
    vi.mocked(axios).mockImplementation(() => {
      const response = mockResponses[callCount];
      callCount++;
      return Promise.resolve(response);
    });

    const endpoint = {
      id: 'test-endpoint',
      urlHost: 'https://api.example.com',
      urlPath: '/data',
      method: HttpMethod.GET,
      pagination: {
        type: PaginationType.PAGE_BASED,
        pageSize: '2'
      }
    };
    
    const result = await callEndpoint(endpoint, {}, {}, {});
    
    // Should get 4 items total (2 pages with 2 items each)
    expect(result.data).toHaveLength(4);
    expect(result.data[0].id).toBe(1);
    expect(result.data[3].id).toBe(4);
  });

  it('should handle invalid pageSize gracefully', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Silence warnings
    
    const mockAxios = axios as jest.MockedFunction<typeof axios>;
    const mockResponses = [
      { status: 200, data: { results: [{ id: 1 }], next_page: 2 } },
      { status: 200, data: { results: [{ id: 2 }], next_page: null } }
    ];
    
    let callCount = 0;
    vi.mocked(axios).mockImplementation(() => {
      const response = mockResponses[callCount];
      callCount++;
      return Promise.resolve(response);
    });

    const endpoint = {
      id: 'test-endpoint',
      urlHost: 'https://api.example.com',
      urlPath: '/data',
      method: HttpMethod.GET,
      pagination: {
        type: PaginationType.OFFSET_BASED,
        pageSize: 'invalid' // Intentionally invalid
      }
    };
    
    // Should use default of 50 and continue without error
    const result = await callEndpoint(endpoint, {}, {}, {});
    expect(result.data).toBeDefined();
  });

  it('should handle cursor-based pagination with missing cursor path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Silence warnings
    
    const mockAxios = axios as jest.MockedFunction<typeof axios>;
    const mockResponses = [
      { status: 200, data: { results: [{ id: 1 }], next_cursor: 'abc123' } },
      { status: 200, data: { results: [{ id: 2 }], next_cursor: null } }
    ];
    
    let callCount = 0;
    vi.mocked(axios).mockImplementation(() => {
      const response = mockResponses[callCount];
      callCount++;
      return Promise.resolve(response);
    });

    const endpoint = {
      id: 'test-endpoint',
      urlHost: 'https://api.example.com',
      urlPath: '/data',
      method: HttpMethod.GET,
      pagination: {
        type: PaginationType.CURSOR_BASED,
        // No cursorPath specified - should default to next_cursor
      }
    };
    
    const result = await callEndpoint(endpoint, {}, {}, {});
    // Should handle it gracefully using default cursor path
    expect(result.data).toBeDefined();
    expect(result.data.next_cursor).toBeNull(); // Last page cursor
  });

  it('should handle pagination errors gracefully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // Silence errors
    
    // First request succeeds, second throws error in the pagination logic
    const mockAxios = axios as jest.MockedFunction<typeof axios>;
    const mockResponses = [
      { status: 200, data: { results: [{ id: 1 }], next_cursor: 'abc123' } }
    ];
    
    let callCount = 0;
    vi.mocked(axios).mockImplementation(() => {
      if (callCount === 0) {
        callCount++;
        return Promise.resolve(mockResponses[0]);
      } else {
        // Simulate a malformed response that will cause pagination logic to fail
        return Promise.resolve({
          status: 200,
          data: null // This will cause error in pagination code
        });
      }
    });

    const endpoint = {
      id: 'test-endpoint',
      urlHost: 'https://api.example.com',
      urlPath: '/data',
      method: HttpMethod.GET,
      pagination: {
        type: PaginationType.CURSOR_BASED,
        cursorPath: 'next_cursor'
      }
    };
    
    const result = await callEndpoint(endpoint, {}, {}, {});
    // Should return what it has so far rather than failing completely
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data.results)).toBeTruthy();
    expect(result.data.results).toHaveLength(1);
  });
});