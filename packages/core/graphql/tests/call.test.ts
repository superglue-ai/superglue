import { ApiInputRequest, CacheMode, RequestOptions } from "@superglue/client";
import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import * as api from "../../utils/api.js";
import * as logs from "../../utils/logs.js";
import * as telemetry from "../../utils/telemetry.js";
import * as tools from "../../utils/tools.js";
import * as transform from "../../utils/transform.js";
import * as webhook from "../../utils/webhook.js";
import { callResolver } from "../resolvers/call.js";

// Mock dependencies
vi.mock("../../utils/api.js", async () => {
  const actual = await vi.importActual("../../utils/api.js");
  return {
    ...actual,
    executeApiCall: vi.fn(),
  };
});
vi.mock("../../utils/tools.js");
vi.mock("../../utils/transform.js");
vi.mock("../../utils/webhook.js");
vi.mock("../../utils/telemetry.js");
vi.mock("../../utils/logs.js");
vi.mock("../../utils/documentation.js");

// Setup mocks
const mockedApi = api as Mocked<typeof api>;
const mockedTools = tools as Mocked<typeof tools>;
const mockedTransform = transform as Mocked<typeof transform>;
const mockedWebhook = webhook as Mocked<typeof webhook>;
const mockedLogs = logs as Mocked<typeof logs>;
const mockedTelemetry = telemetry as Mocked<typeof telemetry>;

describe('Call Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock crypto.randomUUID globally
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => 'test-uuid-1234-5678-9012-345678901234');

    // Add mock for maskCredentials
    mockedTools.maskCredentials = vi.fn().mockImplementation((error, credentials) => error);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('callResolver', () => {
    const getApiConfigMock = vi.fn();
    const testContext: Context = {
      orgId: 'test-org',
      datastore: {
        getApiConfig: getApiConfigMock,
        upsertApiConfig: vi.fn(),
        createRun: vi.fn(),
        getIntegration: vi.fn().mockResolvedValue({ id: 'test-integration', documentation: 'test docs', urlHost: 'https://api.example.com', urlPath: 'v1/test' })
      } as any
    };
    const testInfo = {} as GraphQLResolveInfo;
    const testInput: ApiInputRequest = {
      endpoint: {
        urlHost: 'https://api.example.com',
        urlPath: 'v1/test',
        id: 'test-endpoint-id',
        instruction: 'test-instruction'
      }
    };
    const testPayload = { query: 'test' };
    const testCredentials = { api_key: 'secret-key' };
    const testOptions: RequestOptions = {};

    it('should successfully resolve call with existing endpoint', async () => {
      // Mock datastore
      getApiConfigMock.mockResolvedValue({
        urlHost: 'https://api.example.com',
        urlPath: 'v1/test',
        id: 'test-endpoint-id'
      });

      // Mock executeApiCall
      mockedApi.executeApiCall.mockResolvedValue({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });

      // Mock transform
      mockedTransform.executeTransform.mockResolvedValue({
        data: { result: 'success' },
        config: { responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' }
      });
      
      const result = await callResolver(
        null,
        {
          input: { id: 'test-endpoint-id' },
          payload: testPayload,
          credentials: testCredentials,
          options: testOptions
        },
        testContext,
        testInfo
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1234-5678-9012-345678901234',
        success: true,
        data: { result: 'success' }
      });
      expect(testContext.datastore.upsertApiConfig).not.toHaveBeenCalled();
      expect(testContext.datastore.createRun).toHaveBeenCalled();
    });

    it('should use provided endpoint when no ID is given', async () => {
      // Mock executeApiCall
      mockedApi.executeApiCall.mockResolvedValue({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });

      // Mock transform
      mockedTransform.executeTransform.mockResolvedValue({
        data: { transformed: 'data' },
        config: { responseMapping: 'data', responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' }
      });

      const result = await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: testOptions
        },
        testContext,
        testInfo
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1234-5678-9012-345678901234',
        success: true,
        data: { transformed: 'data' }
      });
      expect(testContext.datastore.getApiConfig).not.toHaveBeenCalled();
    });

    it('should handle executeApiCall failure', async () => {
      // Mock executeApiCall to fail
      mockedApi.executeApiCall.mockRejectedValue(new Error('API call failed'));

      const result = await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: testOptions
        },
        testContext,
        testInfo
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1234-5678-9012-345678901234',
        success: false,
        error: expect.stringContaining('API call failed')
      });
    });

    it('should handle transformation failure', async () => {
      // Mock executeApiCall
      mockedApi.executeApiCall.mockResolvedValue({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });

      // Mock transform to always fail
      mockedTransform.executeTransform.mockRejectedValue(new Error('Transform error'));
      
      const result = await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: testOptions
        },
        testContext,
        testInfo
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1234-5678-9012-345678901234',
        success: false,
        error: expect.stringContaining('Transform error')
      });
      expect(mockedTransform.executeTransform).toHaveBeenCalledTimes(1);
    });

    it('should notify webhook on success when configured', async () => {
      // Mock executeApiCall
      mockedApi.executeApiCall.mockResolvedValue({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });

      // Mock transform
      mockedTransform.executeTransform.mockResolvedValue({ 
        data: { result: 'success' }, 
        config: { responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' } 
      });
      mockedTools.applyJsonataWithValidation.mockResolvedValue({
        success: true,
        data: { result: 'success' }
      });

      await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: { webhookUrl: 'https://webhook.example.com' }
        },
        testContext,
        testInfo
      );

      expect(mockedWebhook.notifyWebhook).toHaveBeenCalledWith(
        'https://webhook.example.com',
        'test-uuid-1234-5678-9012-345678901234',
        true,
        expect.any(Object)
      );
    });

    it('should notify webhook on failure', async () => {
      // Mock executeApiCall to fail
      mockedApi.executeApiCall.mockRejectedValue(new Error('API call failed'));

      const result = await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: { webhookUrl: 'https://webhook.example.com' }
        },
        testContext,
        testInfo
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1234-5678-9012-345678901234',
        success: false,
        error: expect.stringContaining('API call failed')
      });
      expect(mockedWebhook.notifyWebhook).toHaveBeenCalledWith(
        'https://webhook.example.com',
        'test-uuid-1234-5678-9012-345678901234',
        false,
        undefined,
        expect.any(String)
      );
    });

    it('should respect cache modes', async () => {
      // Mock executeApiCall
      mockedApi.executeApiCall.mockResolvedValue({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });

      // Mock transform
      mockedTransform.executeTransform.mockResolvedValue({ 
        data: { result: 'success' }, 
        config: { responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' } 
      });
      
      // Test with READONLY cache
      await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: { cacheMode: CacheMode.READONLY }
        },
        testContext,
        testInfo
      );

      expect(mockedTransform.executeTransform).toHaveBeenCalled();
      expect(testContext.datastore.upsertApiConfig).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();
      mockedApi.executeApiCall.mockResolvedValue({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });
      mockedTransform.executeTransform.mockResolvedValue({ 
        data: { result: 'success' }, 
        config: { responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' } 
      });

      // Test with WRITEONLY cache
      await callResolver(
        null,
        {
          input: testInput,
          payload: testPayload,
          credentials: testCredentials,
          options: { cacheMode: CacheMode.WRITEONLY }
        },
        testContext,
        testInfo
      );

      expect(mockedTransform.executeTransform).toHaveBeenCalled();
      expect(testContext.datastore.upsertApiConfig).toHaveBeenCalled();
    });

    it('should throw error if response schema is zod', async () => {
      // Mock datastore
      getApiConfigMock.mockResolvedValue({
        instruction: 'test-instruction',
        urlHost: 'https://api.example.com',
        urlPath: 'v1/test',
        id: 'test-endpoint-id',
        responseSchema: { _def: { typeName: 'ZodObject' } }
      });

      const result = await callResolver(
        null,
        {
          input: { id: 'test-endpoint-id' },
          payload: testPayload,
          credentials: testCredentials,
          options: testOptions
        },
        testContext,
        testInfo
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1234-5678-9012-345678901234',
        success: false,
        error: expect.stringContaining('zod is not supported')
      });
    });
  });
});