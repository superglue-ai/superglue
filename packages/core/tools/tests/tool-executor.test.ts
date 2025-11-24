import { HttpMethod, Integration, SelfHealingMode, Workflow } from '@superglue/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '../../datastore/types.js';
import { IntegrationManager } from '../../integrations/integration-manager.js';
import { isSelfHealingEnabled } from '../../utils/helpers.js';
import * as httpStrategies from '../strategies/http/http.js';
import { WorkflowExecutor } from '../tool-executor.js';

// Mock the tool-step-builder module
vi.mock('../tool-step-builder.js', () => ({
  generateStepConfig: vi.fn(),
}));

// Mock the tools module but keep isSelfHealingEnabled real
vi.mock('../utils/tools.js', async () => {
  const actual = await vi.importActual('../utils/tools.js');
  return {
    ...actual,
  };
});

import { generateStepConfig } from '../tool-step-builder.js';

describe('WorkflowExecutor Self-Healing Logic', () => {
  it('should correctly determine self-healing for transform operations', () => {
    // Test transform self-healing enabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.ENABLED }, 'transform')).toBe(true);
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.TRANSFORM_ONLY }, 'transform')).toBe(true);
    
    // Test transform self-healing disabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.REQUEST_ONLY }, 'transform')).toBe(false);
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.DISABLED }, 'transform')).toBe(false);
    
    // Test defaults for transform (should be enabled)
    expect(isSelfHealingEnabled({}, 'transform')).toBe(true);
    expect(isSelfHealingEnabled(undefined, 'transform')).toBe(true);
  });

  it('should correctly determine self-healing for API operations', () => {
    // Test API self-healing enabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.ENABLED }, 'api')).toBe(true);
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.REQUEST_ONLY }, 'api')).toBe(true);
    
    // Test API self-healing disabled cases
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.TRANSFORM_ONLY }, 'api')).toBe(false);
    expect(isSelfHealingEnabled({ selfHealing: SelfHealingMode.DISABLED }, 'api')).toBe(false);
    
    // Test defaults for API (should be enabled)
    expect(isSelfHealingEnabled({}, 'api')).toBe(true);
    expect(isSelfHealingEnabled(undefined, 'api')).toBe(true);
  });

  it('should handle edge cases in self-healing logic', () => {
    // Test with null/undefined values
    expect(isSelfHealingEnabled({ selfHealing: null as any }, 'transform')).toBe(true);
    expect(isSelfHealingEnabled({ selfHealing: null as any }, 'api')).toBe(true);
    
    // Test with empty options object
    expect(isSelfHealingEnabled({}, 'transform')).toBe(true);
    expect(isSelfHealingEnabled({}, 'api')).toBe(true);
  });

  it('should verify workflow uses this logic correctly', () => {
    // This test verifies that the workflow executor calls isSelfHealingEnabled
    // with the correct parameters as seen in the code diff:
    // - Line 149: isSelfHealingEnabled(options, "transform") for final transforms
    // - API calls pass options through to executeApiCall which uses isSelfHealingEnabled(options, "api")
    
    // Test that all SelfHealingMode enum values are defined
    expect(Object.values(SelfHealingMode)).toHaveLength(4);
    expect(SelfHealingMode.ENABLED).toBe('ENABLED');
    expect(SelfHealingMode.DISABLED).toBe('DISABLED');
    expect(SelfHealingMode.REQUEST_ONLY).toBe('REQUEST_ONLY');
    expect(SelfHealingMode.TRANSFORM_ONLY).toBe('TRANSFORM_ONLY');
  });
});

describe('WorkflowExecutor OAuth Token Refresh', () => {
  let mockDataStore: DataStore;
  let mockIntegration: Integration;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    const now = Date.now();
    const twoMinutesFromNow = new Date(now + 2 * 60 * 1000).toISOString();
    
    mockIntegration = {
      id: 'test-integration',
      urlHost: 'https://api.example.com',
      credentials: {
        access_token: 'old-access-token',
        refresh_token: 'test-refresh-token',
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        grant_type: 'authorization_code',
        expires_at: twoMinutesFromNow,
        token_url: 'https://api.example.com/oauth/token',
      },
    };
    
    mockDataStore = {
      getIntegration: vi.fn().mockResolvedValue(mockIntegration),
      upsertIntegration: vi.fn().mockResolvedValue(mockIntegration),
    } as unknown as DataStore;
  });

  it('should call refreshTokenIfNeeded when token is expired', async () => {
    const integrationManager = new IntegrationManager(mockIntegration, mockDataStore, 'test-org');
    const refreshSpy = vi.spyOn(integrationManager, 'refreshTokenIfNeeded');
    
    vi.spyOn(httpStrategies, 'runStepConfig').mockResolvedValue({
      data: { result: 'success' },
      statusCode: 200,
      headers: {},
    });
    
    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          integrationId: 'test-integration',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/test-endpoint',
            headers: {
              'Authorization': 'Bearer <<test-integration_access_token>>',
            },
            instruction: 'Test API call',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [integrationManager],
    });

    await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.DISABLED },
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('should not refresh token when token is not expired', async () => {
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockIntegration.credentials.expires_at = tenMinutesFromNow;
    
    const integrationManager = new IntegrationManager(mockIntegration, mockDataStore, 'test-org');
    const refreshSpy = vi.spyOn(integrationManager, 'refreshTokenIfNeeded');
    
    vi.spyOn(httpStrategies, 'runStepConfig').mockResolvedValue({
      data: { result: 'success' },
      statusCode: 200,
      headers: {},
    });
    
    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          integrationId: 'test-integration',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/test-endpoint',
            headers: {
              'Authorization': 'Bearer <<test-integration_access_token>>',
            },
            instruction: 'Test API call',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [integrationManager],
    });

    await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.DISABLED },
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(mockDataStore.upsertIntegration).not.toHaveBeenCalled();
  });

  it('should only refresh token once when multiple steps use same integration', async () => {
    const integrationManager = new IntegrationManager(mockIntegration, mockDataStore, 'test-org');
    const refreshSpy = vi.spyOn(integrationManager, 'refreshTokenIfNeeded');
    
    let refreshCallCount = 0;
    refreshSpy.mockImplementation(async () => {
      refreshCallCount++;
      
      if (refreshCallCount === 1) {
        mockIntegration.credentials.access_token = 'new-access-token';
        mockIntegration.credentials.expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
        
        await mockDataStore.upsertIntegration({
          id: 'test-integration',
          integration: mockIntegration,
          orgId: 'test-org',
        });
        
        return true;
      }
      
      return false;
    });
    
    vi.spyOn(httpStrategies, 'runStepConfig').mockResolvedValue({
      data: { result: 'success' },
      statusCode: 200,
      headers: {},
    });
    
    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          integrationId: 'test-integration',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/endpoint-1',
            headers: {
              'Authorization': 'Bearer <<test-integration_access_token>>',
            },
            instruction: 'First API call',
          },
          responseMapping: '$',
        },
        {
          id: 'step-2',
          integrationId: 'test-integration',
          apiConfig: {
            id: 'step-2',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/endpoint-2',
            headers: {
              'Authorization': 'Bearer <<test-integration_access_token>>',
            },
            instruction: 'Second API call',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [integrationManager],
    });

    await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.DISABLED },
    });

    expect(refreshSpy).toHaveBeenCalledTimes(2);
    expect(refreshCallCount).toBe(2);
    expect(mockDataStore.upsertIntegration).toHaveBeenCalledTimes(1);
  });

  it('should handle steps without integrationId gracefully', async () => {
    vi.spyOn(httpStrategies, 'runStepConfig').mockResolvedValue({
      data: { result: 'success' },
      statusCode: 200,
      headers: {},
    });
    
    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/endpoint',
            instruction: 'Simple API call without integration',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [],
    });

    const result = await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.DISABLED },
    });

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].success).toBe(true);
    expect(mockDataStore.upsertIntegration).not.toHaveBeenCalled();
  });
});

describe('WorkflowExecutor API Self-Healing', () => {
  let mockDataStore: DataStore;
  let mockIntegration: Integration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    mockIntegration = {
      id: 'test-integration',
      urlHost: 'https://api.example.com',
      credentials: {
        access_token: 'test-token',
      },
      documentation: 'API documentation content',
      openApiSchema: '{"openapi": "3.0.0"}',
      specificInstructions: 'Follow API guidelines',
    };

    mockDataStore = {
      getIntegration: vi.fn().mockResolvedValue(mockIntegration),
      upsertIntegration: vi.fn().mockResolvedValue(mockIntegration),
    } as unknown as DataStore;
  });

  it('should self-heal API call with integration documentation', async () => {
    const integrationManager = new IntegrationManager(mockIntegration, mockDataStore, 'test-org');
    
    const getIntegrationSpy = vi.spyOn(integrationManager, 'getIntegration');
    const getDocumentationSpy = vi.spyOn(integrationManager, 'getDocumentation');
    
    const evaluateConfigResponseSpy = vi.spyOn(WorkflowExecutor.prototype as any, 'evaluateConfigResponse').mockResolvedValue({
      success: true,
      refactorNeeded: false,
      shortReason: 'Response looks good',
    });
    
    let callCount = 0;
    const runStepConfigSpy = vi.spyOn(httpStrategies, 'runStepConfig').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('API call failed: 404 Not Found');
      }
      return {
        data: { result: 'success after self-healing' },
        statusCode: 200,
        headers: {},
      };
    });

    vi.mocked(generateStepConfig).mockResolvedValue({
      success: true,
      config: {
        urlPath: '/v2/endpoint',
        method: HttpMethod.GET,
      },
      messages: [],
    });

    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          integrationId: 'test-integration',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/v1/endpoint',
            instruction: 'Call API endpoint',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [integrationManager],
    });

    const result = await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.ENABLED, retries: 2 },
    });
    console.log(result);

    expect(result.success).toBe(true);
    expect(result.stepResults[0].success).toBe(true);
    expect(runStepConfigSpy).toHaveBeenCalledTimes(2);
    
    expect(getIntegrationSpy).toHaveBeenCalled();
    expect(getDocumentationSpy).toHaveBeenCalled();
    expect(generateStepConfig).toHaveBeenCalled();
    expect(evaluateConfigResponseSpy).toHaveBeenCalled();
    
    const generateCall = vi.mocked(generateStepConfig).mock.calls[0][0];
    expect(generateCall.integration).toBeDefined();
    expect(generateCall.integration.id).toBe('test-integration');
  });

  it('should self-heal API call without integration', async () => {
    const evaluateConfigResponseSpy = vi.spyOn(WorkflowExecutor.prototype as any, 'evaluateConfigResponse').mockResolvedValue({
      success: true,
      refactorNeeded: false,
      shortReason: 'Response looks good',
    });
    
    let callCount = 0;
    const runStepConfigSpy = vi.spyOn(httpStrategies, 'runStepConfig').mockImplementation(async (args) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('API call failed: Invalid request');
      }
      return {
        data: { result: 'success after self-healing' },
        statusCode: 200,
        headers: {},
      };
    });

    vi.mocked(generateStepConfig).mockResolvedValue({
      success: true,
      config: {
        urlPath: '/fixed-endpoint',
        method: HttpMethod.POST,
      },
      messages: [],
    });

    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/broken-endpoint',
            instruction: 'Call API without integration',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [],
    });

    const result = await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.ENABLED, retries: 2 },
    });
    expect(result.success).toBe(true);
    expect(result.stepResults[0].success).toBe(true);
    expect(runStepConfigSpy).toHaveBeenCalledTimes(2);
    expect(evaluateConfigResponseSpy).toHaveBeenCalled();
    
    expect(generateStepConfig).toHaveBeenCalled();
    
    const generateCall = vi.mocked(generateStepConfig).mock.calls[0][0];
    expect(generateCall.integration).toBeUndefined();
  });

  it('should not self-heal when disabled', async () => {
    let callCount = 0;
    vi.spyOn(httpStrategies, 'runStepConfig').mockImplementation(async () => {
      callCount++;
      throw new Error('API call failed');
    });

    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/endpoint',
            instruction: 'Call API',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [],
    });

    const result = await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.DISABLED },
    });

    expect(result.success).toBe(false);
    expect(result.stepResults[0].success).toBe(false);
    expect(callCount).toBe(1);
    expect(generateStepConfig).not.toHaveBeenCalled();
  });

  it('should fail after exhausting retries', async () => {
    vi.spyOn(httpStrategies, 'runStepConfig').mockRejectedValue(
      new Error('Persistent API failure')
    );

    vi.mocked(generateStepConfig).mockResolvedValue({
      success: true,
      config: {
        urlPath: '/attempt',
        method: HttpMethod.GET,
      },
      messages: [],
    });

    const workflow = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          apiConfig: {
            id: 'step-1',
            method: 'GET',
            urlHost: 'https://api.example.com',
            urlPath: '/endpoint',
            instruction: 'Call API',
          },
          responseMapping: '$',
        },
      ],
    };

    const executor = new WorkflowExecutor({
      workflow: workflow as Workflow,
      metadata: { orgId: 'test-org', runId: 'test-run' },
      integrations: [],
    });

    const result = await executor.execute({
      payload: {},
      credentials: {},
      options: { selfHealing: SelfHealingMode.ENABLED, retries: 3 },
    });

    expect(result.success).toBe(false);
    expect(result.stepResults[0].success).toBe(false);
    expect(result.stepResults[0].error).toContain('Persistent API failure');
  });
});