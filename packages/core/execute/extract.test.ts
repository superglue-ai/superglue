import { AuthType, DecompressionMethod, FileType, HttpMethod } from '@superglue/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decompressData, parseFile } from '../files/index.js';
import { callAxios } from './api/api.js';
import { callExtract, generateExtractConfig, processFile } from './extract.js';

vi.mock('../utils/documentation.js');
vi.mock('../files/index.js');
vi.mock('../llm/language-model.js', () => {
  return {
    LanguageModel: {
      generateObject: vi.fn().mockResolvedValue({
        response: {
          urlHost: 'https://api.example.com',
          method: 'GET',
          authentication: 'NONE'
        },
        messages: []
      })
    }
  };
});

vi.mock('./api/api.js', async () => {
  const actual = await vi.importActual('./api/api.js');
  return {
    ...actual,
    callAxios: vi.fn()
  };
});

describe('Extract Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('prepareExtract', () => {
    it('should prepare extract config', async () => {
      const mockDocumentation = 'API documentation';

      const extractInput = {
        documentationUrl: 'https://docs.example.com',
        instruction: 'Fetch user data',
        urlHost: 'https://api.example.com'
      };
      const result = await generateExtractConfig(extractInput, mockDocumentation, {}, {});

      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(result.urlHost).toBe('https://api.example.com');
    });
  });

  describe('callExtract', () => {
    it('should successfully call API and process response', async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ items: [{ id: 1 }] }))
      };
      (callAxios as any).mockResolvedValue({
        response: mockResponse,
        retriesAttempted: 0,
        lastFailureStatus: undefined
      });

      const extract = {
        id: 'test-id',
        instruction: 'Fetch data',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        headers: {
          'Authorization': 'Bearer {token}'
        },
        authentication: AuthType.HEADER,
        fileType: FileType.JSON
      };

      const credentials = {
        token: '12345'
      };

      console.log('Headers before:', extract.headers);
      console.log('Variables:', credentials);

      const result = await callExtract(extract, {}, credentials, {});
      const resultObj = await processFile(result, extract);
      expect(callAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer 12345'
          }
        }),
        expect.any(Object)
      );
    });

    it('should handle compressed response', async () => {
      const mockCompressedData = Buffer.from('compressed');
      const mockDecompressedData = Buffer.from(JSON.stringify({ data: [1, 2, 3] }));

      (callAxios as any).mockResolvedValue({
        response: { status: 200, data: mockCompressedData },
        retriesAttempted: 0,
        lastFailureStatus: undefined
      });
      (decompressData as any).mockResolvedValue(mockDecompressedData);
      (parseFile as any).mockResolvedValue({ data: [1, 2, 3] });

      const extract = {
        id: 'test-id',
        instruction: 'Fetch data',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        headers: { 'Authorization': 'Bearer {token}' },
        queryParams: { 'filter': '{filter}' },
        dataPath: 'items',
        authentication: AuthType.HEADER,
        decompressionMethod: DecompressionMethod.GZIP,
        fileType: FileType.JSON
      };

      const result = await callExtract(extract, {}, {}, {});
      const resultObj = await processFile(result, extract);

      expect(decompressData).toHaveBeenCalledWith(
        mockCompressedData,
        DecompressionMethod.GZIP
      );
      expect(resultObj).toEqual({ data: [1, 2, 3] });
    });

    it('should throw error for non-200 response', async () => {
      (callAxios as any).mockResolvedValue({
        response: { status: 404, data: { error: 'Not found' } },
        retriesAttempted: 0,
        lastFailureStatus: undefined
      });

      const extract = {
        id: 'test-id',
        instruction: 'Fetch data',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        headers: { 'Authorization': 'Bearer {token}' },
        queryParams: { 'filter': '{filter}' },
        dataPath: 'items',
        authentication: AuthType.HEADER,
        fileType: FileType.JSON
      };

      await expect(callExtract(extract, {}, {}, {}))
        .rejects
        .toThrow('API call failed with status 404');
    });

    it('should handle Excel file response', async () => {
      const mockExcelData = Buffer.from('mock excel data');
      const mockParsedData = { sheet1: [{ name: 'John', age: 30 }] };

      (callAxios as any).mockResolvedValue({
        response: { status: 200, data: mockExcelData },
        retriesAttempted: 0,
        lastFailureStatus: undefined
      });
      (parseFile as any).mockResolvedValue(mockParsedData);

      const extract = {
        id: 'test-id',
        instruction: 'Fetch Excel data',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        headers: { 'Authorization': 'Bearer {token}' },
        queryParams: { 'filter': '{filter}' },
        dataPath: 'sheet1',
        authentication: AuthType.HEADER,
        fileType: FileType.EXCEL
      };

      const result = await callExtract(extract, {}, {}, {});
      const resultObj = await processFile(result, extract);

      expect(parseFile).toHaveBeenCalledWith(
        mockExcelData,
        FileType.EXCEL
      );
      expect(resultObj).toEqual([{ name: 'John', age: 30 }]);
    });

    it('should handle Excel file with multiple sheets', async () => {
      const mockExcelData = Buffer.from('mock excel data');
      const mockParsedData = {
        sheet1: [{ name: 'John', age: 30 }],
        sheet2: [{ city: 'New York', country: 'USA' }]
      };

      (callAxios as any).mockResolvedValue({
        response: { status: 200, data: mockExcelData },
        retriesAttempted: 0,
        lastFailureStatus: undefined
      });
      (parseFile as any).mockResolvedValue(mockParsedData);

      const extract = {
        id: 'test-id',
        instruction: 'Fetch Excel data',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        headers: {},
        authentication: AuthType.NONE,
        fileType: FileType.EXCEL
      };

      const result = await callExtract(extract, {}, {}, {});
      const resultObj = await processFile(result, extract);

      expect(parseFile).toHaveBeenCalledWith(
        mockExcelData,
        FileType.EXCEL
      );
      // Without dataPath specified, should return all sheets
      expect(resultObj).toEqual(mockParsedData);
    });

    it('should handle compressed Excel file', async () => {
      const mockCompressedData = Buffer.from('compressed excel data');
      const mockDecompressedData = Buffer.from('decompressed excel data');
      const mockParsedData = { sheet1: [{ name: 'John', age: 30 }] };

      (callAxios as any).mockResolvedValue({
        response: { status: 200, data: mockCompressedData },
        retriesAttempted: 0,
        lastFailureStatus: undefined
      });
      (decompressData as any).mockResolvedValue(mockDecompressedData);
      (parseFile as any).mockResolvedValue(mockParsedData);

      const extract = {
        id: 'test-id',
        instruction: 'Fetch compressed Excel data',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        headers: {},
        authentication: AuthType.NONE,
        decompressionMethod: DecompressionMethod.GZIP,
        fileType: FileType.EXCEL,
        dataPath: 'sheet1'
      };

      const result = await callExtract(extract, {}, {}, {});
      const resultObj = await processFile(result, extract);

      expect(decompressData).toHaveBeenCalledWith(
        mockCompressedData,
        DecompressionMethod.GZIP
      );
      expect(parseFile).toHaveBeenCalledWith(
        mockDecompressedData,
        FileType.EXCEL
      );
      expect(resultObj).toEqual([{ name: 'John', age: 30 }]);
    });
  });
}); 