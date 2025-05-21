import { ApiConfig, ApiInputRequest, CacheMode, Context, Metadata, RequestOptions } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import * as api from "../../utils/api.js";
import * as tools from "../../utils/tools.js";
import * as transform from "../../utils/transform.js";
import * as webhook from "../../utils/webhook.js";
import * as telemetry from "../../utils/telemetry.js";
import * as logs from "../../utils/logs.js";
import { callResolver, executeApiCall } from "../resolvers/call.js";
import { Documentation } from "../../utils/documentation.js";

// Mock dependencies
vi.mock("../../utils/api.js");
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

  describe('executeApiCall', () => {
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
    const testMetadata: Metadata = { runId: 'test-run', orgId: 'test-org' };

    it('should successfully execute API call', async () => {
      // Mock successful API call
      mockedApi.callEndpoint.mockResolvedValueOnce({
        data: { result: 'success' }
      });

      const result = await executeApiCall(
        testInput.endpoint, 
        testPayload, 
        testCredentials, 
        testOptions,
        testMetadata
      );

      expect(result).toEqual({
        data: { result: 'success' },
        endpoint: testInput.endpoint
      });
      expect(mockedApi.callEndpoint).toHaveBeenCalledWith(
        testInput.endpoint,
        testPayload,
        testCredentials,
        testOptions
      );
    });

    it('should retry on failure and eventually succeed', async () => {
      // Mock failure on first attempt, success on second
      mockedApi.callEndpoint
        .mockRejectedValueOnce(new Error('API call failed'))
        .mockResolvedValueOnce({
          data: { result: 'success after retry' }
        });
      
      // Mock documentation and generateApiConfig
      vi.mocked(Documentation.prototype.fetch).mockResolvedValue('test docs');
      mockedApi.generateApiConfig.mockResolvedValue({
        config: { ...testInput.endpoint },
        messages: []
      });
      mockedApi.evaluateResponse.mockResolvedValueOnce({ success: true, shortReason: '', refactorNeeded: false   });

      const result = await executeApiCall(
        testInput.endpoint, 
        testPayload, 
        testCredentials, 
        testOptions,
        testMetadata
      );

      expect(result).toEqual({
        data: { result: 'success after retry' },
        endpoint: { ...testInput.endpoint }
      });
      expect(mockedApi.callEndpoint).toHaveBeenCalledTimes(2);
      expect(mockedApi.generateApiConfig).toHaveBeenCalledTimes(1);
      expect(mockedLogs.logMessage).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('(1)'),
        testMetadata
      );
    });

    it('should throw after max retries due to evaluateResponse failures', async () => {
      // Mock callEndpoint to succeed (after the first attempt, which will use the unmocked path)
      // The first attempt will fail, triggering retries. Subsequent callEndpoint calls within retries will succeed.
      mockedApi.callEndpoint
        .mockRejectedValueOnce(new Error('Initial API call failed to trigger retry logic')) // Fails first time
        .mockResolvedValue({ data: { result: 'success' } }); // Succeeds on retries

      vi.mocked(Documentation.prototype.fetch).mockResolvedValue('test docs');
      mockedApi.generateApiConfig.mockResolvedValue({
        config: { ...testInput.endpoint },
        messages: []
      });
      // Mock evaluateResponse to consistently fail
      mockedApi.evaluateResponse.mockResolvedValue({ success: false, shortReason: 'Eval failed', refactorNeeded: false });

      await expect(executeApiCall(
        testInput.endpoint, 
        testPayload, 
        testCredentials, 
        testOptions,
        testMetadata
      )).rejects.toThrow(/API call failed after \d+ retries.*Last error: Eval failed/);
      
      // callEndpoint is called once for the initial attempt, then 7 more times for retries where evaluateResponse fails.
      expect(mockedApi.callEndpoint).toHaveBeenCalledTimes(8); 
      // evaluateResponse is called for each of the 7 retries after the first callEndpoint failure.
      expect(mockedApi.evaluateResponse).toHaveBeenCalledTimes(7);  
      expect(mockedTelemetry.telemetryClient?.captureException).toHaveBeenCalled();
    });

    it('should retry on evaluateResponse failure and eventually succeed', async () => {
      // Mock callEndpoint to fail once, then succeed
      mockedApi.callEndpoint
        .mockRejectedValueOnce(new Error('Initial API call failed to trigger retry logic')) // Fails first time to enter retry
        .mockResolvedValue({ data: { result: 'successful data' } }); // Succeeds on subsequent calls

      vi.mocked(Documentation.prototype.fetch).mockResolvedValue('test docs');
      mockedApi.generateApiConfig.mockResolvedValue({
        config: { ...testInput.endpoint, responseSchema: {} }, // ensure responseSchema is present
        messages: []
      });

      // Mock evaluateResponse to fail once, then succeed
      mockedApi.evaluateResponse
        .mockResolvedValueOnce({ success: false, shortReason: 'Eval failed first time', refactorNeeded: false })
        .mockResolvedValueOnce({ success: true, shortReason: '', refactorNeeded: false });

      const result = await executeApiCall(
        testInput.endpoint,
        testPayload,
        testCredentials,
        testOptions,
        testMetadata
      );

      expect(result.data).toEqual({ result: 'successful data' });
      // Initial call + 1st retry (evaluateResponse fails) + 2nd retry (evaluateResponse succeeds)
      expect(mockedApi.callEndpoint).toHaveBeenCalledTimes(3);
      // evaluateResponse called on 1st retry (fails) and 2nd retry (succeeds)
      expect(mockedApi.evaluateResponse).toHaveBeenCalledTimes(2);
      expect(mockedApi.generateApiConfig).toHaveBeenCalledTimes(2); // Called for each retry attempt
      expect(mockedLogs.logMessage).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('(1)'), // For the first retry
        testMetadata
      );
      expect(mockedLogs.logMessage).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('(2)'), // For the second retry
        testMetadata
      );
    });

    it('should handle null response data', async () => {
      // Mock response with no data for all 5 expected calls
      mockedApi.callEndpoint.mockResolvedValue({ data: null });
      
      // Add these missing mocks
      vi.mocked(Documentation.prototype.fetch).mockResolvedValue('test docs');
      mockedApi.generateApiConfig.mockResolvedValue({
        config: { ...testInput.endpoint },
        messages: []
      });

      await expect(executeApiCall(
        testInput.endpoint, 
        testPayload, 
        testCredentials, 
        testOptions,
        testMetadata
      )).rejects.toThrow(/API call failed after \d+ retries/);
      
      expect(mockedApi.callEndpoint).toHaveBeenCalledTimes(8);
    });
  });

  describe('callResolver', () => {
    const getApiConfigMock = vi.fn();
    const testContext: Context = {
      orgId: 'test-org',
      datastore: {
        getApiConfig: getApiConfigMock,
        upsertApiConfig: vi.fn(),
        createRun: vi.fn()
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

      // Mock API call instead of using the broken spy
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });

      // Mock transform
      mockedTransform.prepareTransform.mockResolvedValue({
        responseMapping: null,
        responseSchema: {},
        instruction: 'test-instruction',
        id: 'test-endpoint-id'
      });
      mockedTools.applyJsonataWithValidation.mockResolvedValue({
        success: true,
        data: { result: 'success' }
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
      expect(testContext.datastore.upsertApiConfig).toHaveBeenCalled();
      expect(testContext.datastore.createRun).toHaveBeenCalled();
    });

    it('should use provided endpoint when no ID is given', async () => {
      // Mock API call instead of using the broken spy
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });

      // Mock transform
      mockedTransform.prepareTransform.mockResolvedValue({
        responseMapping: 'data',
        responseSchema: {},
        instruction: 'test-instruction',
        id: 'test-endpoint-id'
      });
      mockedTools.applyJsonataWithValidation.mockResolvedValue({
        success: true,
        data: { transformed: 'data' }
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

    it('should retry transform on failure', async () => {
      // Mock API call response
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });
      
      // Mock transform - fail first, succeed second time
      mockedTransform.prepareTransform
        .mockResolvedValueOnce({ responseMapping: 'invalid', responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' })
        .mockResolvedValueOnce({ responseMapping: 'valid', responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' });
      
      mockedTools.applyJsonataWithValidation
        .mockResolvedValueOnce({ success: false, error: 'Transform error' })
        .mockResolvedValueOnce({ success: true, data: { transformed: 'success' } });

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
        data: { transformed: 'success' }
      });
      expect(mockedTransform.prepareTransform).toHaveBeenCalledTimes(2);
      expect(mockedTools.applyJsonataWithValidation).toHaveBeenCalledTimes(2);
      expect(mockedLogs.logMessage).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Transformation failed'),
        expect.any(Object)
      );
    });

    it('should handle transformation failure after max retries', async () => {
      // Mock API call response instead of using the broken spy
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });
      
      // Mock transform to always fail
      mockedTransform.prepareTransform.mockResolvedValue({ responseMapping: 'invalid', responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' });
      mockedTools.applyJsonataWithValidation.mockResolvedValue({ 
        success: false, 
        error: 'Transform error' 
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
        success: false,
        error: expect.stringContaining('Transformation failed')
      });
      expect(mockedTransform.prepareTransform).toHaveBeenCalledTimes(3);
      expect(mockedTools.applyJsonataWithValidation).toHaveBeenCalledTimes(3);
    });
    
    it('should notify webhook on success when configured', async () => {
      // Mock API call instead of the broken spy
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });

      // Mock transform
      mockedTransform.prepareTransform.mockResolvedValue({ responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' });
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
      // Mock API call to fail instead of using the broken spy
      mockedApi.callEndpoint.mockRejectedValue(new Error('API call failed'));

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
      // Mock API call response instead of using the broken spy
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });
      
      // Mock transform
      mockedTransform.prepareTransform.mockResolvedValue({ responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' });
      mockedTools.applyJsonataWithValidation.mockResolvedValue({
        success: true,
        data: { result: 'success' }
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

      expect(mockedTransform.prepareTransform).toHaveBeenCalledWith(
        testContext.datastore,
        true, // readCache should be true
        expect.any(Object),
        expect.any(Object),
        null,
        expect.any(Object)
      );
      expect(testContext.datastore.upsertApiConfig).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();
      mockedApi.callEndpoint.mockResolvedValue({
        data: { result: 'success' }
      });
      mockedTransform.prepareTransform.mockResolvedValue({ responseMapping: null, responseSchema: {}, instruction: 'test-instruction', id: 'test-endpoint-id' });
      mockedTools.applyJsonataWithValidation.mockResolvedValue({
        success: true,
        data: { result: 'success' }
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

      expect(mockedTransform.prepareTransform).toHaveBeenCalledWith(
        testContext.datastore,
        false, // readCache should be false
        expect.any(Object),
        expect.any(Object),
        null,
        expect.any(Object)
      );
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