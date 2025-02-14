import { ApiConfig, ApiInput, AuthType, HttpMethod, PaginationType } from '@superglue/shared';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { callEndpoint, prepareEndpoint } from './api.js';
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

  describe('prepareEndpoint', () => {
    const testInput: ApiInput = {
      urlHost: 'https://api.example.com',
      urlPath: 'v1/test',
      instruction: 'Test API call',
      method: HttpMethod.GET
    };

    beforeEach(() => {
      // Mock OpenAI response with all required fields
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              urlHost: 'https://api.example.com',
              urlPath: 'v1/test',
              method: HttpMethod.GET,
              authentication: AuthType.NONE,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }]
      };

      // Setup OpenAI mock properly
      (OpenAI as any).prototype.chat = {
        completions: {
          create: vi.fn().mockResolvedValue(mockOpenAIResponse)
        }
      };

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

      // Verify OpenAI was called correctly
      expect((OpenAI as any).prototype.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          temperature: 0,
          response_format: expect.any(Object),
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

      expect(result).toEqual({ data: [{ result: 'success' }] });
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
  });
}); 