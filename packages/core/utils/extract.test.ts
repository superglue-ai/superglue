import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prepareExtract, callExtract, processFile, Queue } from './extract.js';
import { callAxios } from './tools.js';
import { getDocumentation } from './documentation.js';
import { decompressData, parseFile } from './file.js';
import { HttpMethod, DecompressionMethod, FileType, AuthType } from '@superglue/shared';
import OpenAI from 'openai';

// Mock dependencies
vi.mock('./documentation.js');
vi.mock('./file.js');
vi.mock('openai');

vi.mock('./tools.js', async () => {
  const actual = await vi.importActual('./tools.js');
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
    it('should prepare extract config with documentation', async () => {
      const mockDocumentation = 'API documentation';
      (getDocumentation as any).mockResolvedValue(mockDocumentation);
      
      // Mock OpenAI response
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              urlHost: 'https://api.example.com',
              method: HttpMethod.GET,
              authentication: AuthType.NONE
            })
          }
        }]
      };
      // Update OpenAI mock to match new client structure
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      }));

      const extractInput = {
        documentationUrl: 'https://docs.example.com',
        instruction: 'Fetch user data',
        urlHost: 'https://api.example.com'
      };

      const result = await prepareExtract(extractInput, {}, {});

      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(result.urlHost).toBe('https://api.example.com');
      expect(getDocumentation).toHaveBeenCalledWith(
        extractInput.documentationUrl,
        undefined,
        undefined
      );
    });
  });

  describe('callExtract', () => {
    it('should successfully call API and process response', async () => {
      const mockResponse = {
        status: 200,
        data: Buffer.from(JSON.stringify({ items: [{ id: 1 }] }))
      };
      (callAxios as any).mockResolvedValue(mockResponse);

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
        status: 200,
        data: mockCompressedData
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
        status: 404,
        data: { error: 'Not found' }
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
        status: 200,
        data: mockExcelData
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
        status: 200,
        data: mockExcelData
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
        status: 200,
        data: mockCompressedData
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

  describe('Queue', () => {
    it('should process jobs in order', async () => {
      const queue = new Queue('test');
      const results: number[] = [];

      const task1 = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(1);
      };
      const task2 = async () => {
        results.push(2);
      };

      queue.enqueue('1', task1);
      queue.enqueue('2', task2);

      // Wait for queue to process
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(results).toEqual([1, 2]);
    });

    it('should not add duplicate jobs', () => {
      const queue = new Queue();
      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 100000));
      };

      queue.enqueue('1', task);
      queue.enqueue('1', task);

      // @ts-ignore - accessing private property for testing
      expect(queue.queue.length).toBe(0);
    });

    it('should handle job errors without stopping the queue', async () => {
      const queue = new Queue();
      const results: string[] = [];
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const failingTask = async () => {
        throw new Error('Task failed');
      };
      const successTask = async () => {
        results.push('success');
      };

      queue.enqueue('1', failingTask);
      queue.enqueue('2', successTask);

      // Wait for queue to process
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(results).toEqual(['success']);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
}); 