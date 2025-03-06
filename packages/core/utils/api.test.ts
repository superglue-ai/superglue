import { ApiConfig, ApiInput, AuthType, HttpMethod, PaginationType } from '@superglue/shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { callEndpoint, prepareEndpoint } from './api.js';
import * as tools from './tools.js';
import LLMClient from './llm.js';

vi.mock('axios');
vi.mock('./llm.js');
vi.mock('./tools.js', async () => {
    const actual = await vi.importActual('./tools.js');
    return {
        ...(actual as Object),
        callAxios: vi.fn()
    };
});

// Create mock implementation
const mockGetText = vi.fn();
const mockGetObject = vi.fn();

// Set up the mock implementation
vi.mocked(LLMClient).getInstance = vi.fn(() => ({
  getText: mockGetText,
  getObject: mockGetObject
}));

const mockedTools = tools as Mocked<typeof tools>;

describe('API Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('prepareEndpoint', () => {
    const testInput: ApiInput = {
      urlHost: 'https://api.example.com',
      urlPath: 'v1/test',
      instruction: 'Test API call',
      method: HttpMethod.GET
    };

    beforeEach(() => {
      // Mock LLMClient response
      mockGetObject.mockResolvedValueOnce({
        urlHost: 'https://api.example.com',
        urlPath: 'v1/test',
        method: HttpMethod.GET,
        authentication: AuthType.NONE,
        headers: { 'Content-Type': 'application/json' }
      });

      // Mock the documentation fetch
      vi.spyOn(global.crypto, 'randomUUID').mockReturnValue('test-uuid-1232-2532-3233');
    });

    it('should prepare endpoint configuration', async () => {
      const result = await prepareEndpoint(testInput, {}, {});

      expect(result.config).toMatchObject({
        urlHost: 'https://api.example.com',
        urlPath: 'v1/test',
        method: HttpMethod.GET,
        authentication: AuthType.NONE,
        id: 'test-uuid-1232-2532-3233',
        headers: { 'Content-Type': 'application/json' },
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });

      expect(result.messages).toBeInstanceOf(Array);
      expect(result.messages).toHaveLength(3); // system, user, and assistant messages

      // Verify LLMClient was called correctly
      expect(mockGetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' })
          ])
        })
      );
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(tools, 'composeUrl').mockImplementation(() => {
        throw new Error('URL composition failed');
      });

      await expect(prepareEndpoint(testInput, {}, {}))
        .rejects.toThrow('URL composition failed');
    });
  });

  describe('callEndpoint', () => {
    const testConfig = {
      id: 'test-uuid-1232-2532-3233',
      urlHost: 'https://api.example.com',
      urlPath: 'v1/test',
      method: HttpMethod.GET,
      headers: { 'Content-Type': 'application/json' },
      instruction: 'Test API call',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should make successful API call', async () => {
      const mockResponse = { 
        status: 200, 
        data: { result: 'success' },
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockedTools.callAxios.mockResolvedValueOnce(mockResponse);

      const result = await callEndpoint(testConfig, {}, {}, {});

      expect(result).toEqual({ data: { result: 'success' } });
    });

    it('should handle pagination', async () => {
      const config = {
        ...testConfig,
        pagination: {
          type: PaginationType.PAGE_BASED,
          pageSize: 2
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
        ...testConfig,
        queryParams: {
            offset: "{offset}",
            limit: "{limit}"
        },
        pagination: {
          type: PaginationType.OFFSET_BASED,
          pageSize: 2
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
        ...testConfig,
        dataPath: 'data',
        pagination: {
          type: PaginationType.CURSOR_BASED,
          pageSize: 2,
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
        ...testConfig,
        pagination: {
          type: PaginationType.PAGE_BASED,
          pageSize: 2
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
        ...testConfig,
        pagination: {
          type: PaginationType.OFFSET_BASED,
          pageSize: 1
        }
      } as ApiConfig;

      // Mock 501 responses to test the loop limit
      const mockResponse = { 
        status: 200, 
        statusText: 'OK',
        headers: {},
        config: {} as any 
      };
      for(let i = 0; i < 505; i++) {
        mockedTools.callAxios.mockResolvedValueOnce({...mockResponse, data: [{ id: i }]});
      }
      const result = await callEndpoint(config, {}, {}, {});
      // Should stop at 500 iterations (as defined in the code)
      expect(mockedTools.callAxios).toHaveBeenCalledTimes(500);
    });

    it('if 2 responses are the same, stop pagination', async () => {
      const config = {
        ...testConfig,
        pagination: {
          type: PaginationType.OFFSET_BASED,
          pageSize: 1
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

      await expect(callEndpoint(testConfig, {}, {}, {}))
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

      await expect(callEndpoint(testConfig, {}, {}, {}))
        .rejects.toThrow(/Received HTML response/);
    });

    it('should handle data path extraction', async () => {
      const config = {
        ...testConfig,
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
        ...testConfig,
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