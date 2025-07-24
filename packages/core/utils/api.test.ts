import { ApiConfig, AuthType, HttpMethod, PaginationType } from '@superglue/client';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { callEndpoint } from './api.js';
import * as tools from './tools.js';

vi.mock('axios');
vi.mock('openai');
vi.mock('./tools.js', async () => {
  const actual = await vi.importActual('./tools.js');
  return {
    ...(actual as Object),
    callAxios: vi.fn()
  };
});
const mockedTools = tools as Mocked<typeof tools>;

describe('API Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'test-model';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('callEndpoint', () => {
    const testEndpoint: ApiConfig = {
      urlHost: 'https://api.example.com',
      urlPath: 'v1/test',
      method: HttpMethod.GET,
      id: 'test-endpoint-id',
      instruction: 'Test API call'
    };
    const testPayload = { query: 'test' };
    const testCredentials = { api_key: 'secret-key' };
    const testOptions = {};

    it('should make successful API call', async () => {
      const mockResponse = {
        status: 200,
        data: { result: 'success' },
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockedTools.callAxios.mockResolvedValueOnce(mockResponse);

      const result = await callEndpoint(testEndpoint, testPayload, testCredentials, testOptions);

      expect(result).toEqual({ data: { result: 'success' } });
    });

    it('should handle pagination', async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: PaginationType.PAGE_BASED,
          pageSize: "2"
        }
      } as ApiConfig;

      const mockResponses = [
        { status: 200, data: [{ id: 1 }, { id: 2 }], statusText: 'OK', headers: {}, config: {} as any },
        { status: 200, data: [{ id: 3 }], statusText: 'OK', headers: {}, config: {} as any }
      ];

      mockedTools.callAxios
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await callEndpoint(config, {}, {}, {});

      expect(result.data).toHaveLength(3);
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(mockedTools.callAxios).toHaveBeenCalledTimes(2);
    });

    it('should handle offset-based pagination', async () => {
      const config = {
        ...testEndpoint,
        queryParams: {
          offset: "{offset}",
          limit: "{limit}"
        },
        pagination: {
          type: PaginationType.OFFSET_BASED,
          pageSize: "2"
        }
      } as ApiConfig;

      const mockResponses = [
        { status: 200, data: [{ id: 1 }, { id: 2 }], statusText: 'OK', headers: {}, config: {} as any },
        { status: 200, data: [{ id: 3 }], statusText: 'OK', headers: {}, config: {} as any }
      ];

      mockedTools.callAxios
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await callEndpoint(config, {}, {}, {});

      expect(result.data).toHaveLength(3);
      expect(mockedTools.callAxios).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          params: { offset: "0", limit: "2" }
        }),
        expect.any(Object)
      );
      expect(mockedTools.callAxios).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          params: { offset: "2", limit: "2" }
        }),
        expect.any(Object)
      );
    });

    it('should handle cursor-based pagination', async () => {
      const config = {
        ...testEndpoint,
        dataPath: 'data',
        pagination: {
          type: PaginationType.CURSOR_BASED,
          pageSize: "2",
          cursorPath: 'meta.next_cursor'
        }
      } as ApiConfig;

      const mockResponses = [
        {
          status: 200,
          data: {
            data: [{ id: 1 }, { id: 2 }],
            meta: { next_cursor: 'cursor123' }
          },
          statusText: 'OK',
          headers: {},
          config: {} as any
        },
        {
          status: 200,
          data: {
            data: [{ id: 3 }],
            meta: { next_cursor: null }
          },
          statusText: 'OK',
          headers: {},
          config: {} as any
        }
      ];

      mockedTools.callAxios
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await callEndpoint(config, {}, {}, {});

      expect(result.data.results).toHaveLength(3);
      expect(result.data.next_cursor).toBeNull();
    });

    it('should stop pagination when receiving duplicate data', async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: PaginationType.PAGE_BASED,
          pageSize: "2"
        }
      } as ApiConfig;

      const sameResponse = {
        status: 200,
        data: [{ id: 1 }, { id: 2 }],
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      mockedTools.callAxios
        .mockResolvedValueOnce(sameResponse)
        .mockResolvedValueOnce(sameResponse); // Same data returned

      const result = await callEndpoint(config, {}, {}, {});

      expect(result.data).toHaveLength(2); // Should only include unique data
      expect(mockedTools.callAxios).toHaveBeenCalledTimes(2);
    });

    it('should stop after 500 iterations', async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: PaginationType.OFFSET_BASED,
          pageSize: "1"
        }
      } as ApiConfig;

      // Mock 501 responses to test the loop limit
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      for (let i = 0; i < 505; i++) {
        mockedTools.callAxios.mockResolvedValueOnce({ ...mockResponse, data: [{ id: i }] });
      }
      const result = await callEndpoint(config, {}, {}, {});
      // Should stop at 500 iterations (as defined in the code)
      expect(mockedTools.callAxios).toHaveBeenCalledTimes(500);
    });

    it('if 2 responses are the same, stop pagination', async () => {
      const config = {
        ...testEndpoint,
        pagination: {
          type: PaginationType.OFFSET_BASED,
          pageSize: "1"
        }
      } as ApiConfig;

      // Mock 501 responses to test the loop limit
      const mockResponse = {
        status: 200,
        data: [{ id: 1 }],
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      mockedTools.callAxios.mockResolvedValue(mockResponse);

      const result = await callEndpoint(config, {}, {}, {});

      // Should stop at 500 iterations (as defined in the code)
      expect(mockedTools.callAxios).toHaveBeenCalledTimes(2);
    });

    it('should handle error responses', async () => {
      const errorResponse = {
        status: 400,
        data: null,
        error: 'Bad Request',
        statusText: 'Bad Request',
        headers: {},
        config: {} as any
      };
      mockedTools.callAxios.mockResolvedValueOnce(errorResponse);

      await expect(callEndpoint(testEndpoint, {}, {}, {}))
        .rejects.toThrow(/API call failed/);
    });

    it('should handle HTML error responses', async () => {
      const htmlResponse = {
        status: 200,
        data: '<!DOCTYPE html><html><body>Error page</body></html>',
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockedTools.callAxios.mockResolvedValueOnce(htmlResponse);

      await expect(callEndpoint(testEndpoint, {}, {}, {}))
        .rejects.toThrow(/Received HTML response/);
    });

    it('should handle data path extraction', async () => {
      const config = {
        ...testEndpoint,
        dataPath: 'response.items'
      };

      const mockResponse = {
        status: 200,
        data: {
          response: {
            items: [{ id: 1 }, { id: 2 }]
          }
        },
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockedTools.callAxios.mockResolvedValueOnce(mockResponse);

      const result = await callEndpoint(config, {}, {}, {});

      expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should handle GraphQL error responses', async () => {
      const config = {
        ...testEndpoint,
        method: HttpMethod.POST,
        body: 'query { test }',
      } as ApiConfig;

      const graphqlErrorResponse = {
        status: 200,  // GraphQL often returns 200 even with errors
        data: {
          errors: [
            {
              message: 'Field "test" not found',
              locations: [{ line: 1, column: 9 }],
              path: ['test']
            }
          ],
          data: null
        },
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockedTools.callAxios.mockResolvedValueOnce(graphqlErrorResponse);

      await expect(callEndpoint(config, {}, {}, {}))
        .rejects.toThrow(/API call failed*/);
    });
  });
}); 