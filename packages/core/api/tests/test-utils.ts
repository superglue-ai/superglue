import { vi } from 'vitest';
import Fastify from 'fastify';
import { DataStore } from '../../datastore/types.js';
import { Workflow, HttpMethod } from '@superglue/client';

// Mock authentication setup
export const setupAuthMocks = () => {
  vi.mock('../../auth/auth.js', () => ({
    extractTokenFromFastifyRequest: vi.fn(() => 'mock-token'),
    validateToken: vi.fn(() => Promise.resolve({ 
      success: true, 
      orgId: 'test-org-id',
      message: 'Authentication successful'
    }))
  }));

  vi.mock('../../utils/logs.js', () => ({
    logMessage: vi.fn()
  }));
};

// Create a mock datastore with all methods
export const createMockDatastore = (): DataStore => ({
  getApiConfig: vi.fn(),
  listApiConfigs: vi.fn(),
  upsertApiConfig: vi.fn(),
  deleteApiConfig: vi.fn(),
  getExtractConfig: vi.fn(),
  listExtractConfigs: vi.fn(),
  upsertExtractConfig: vi.fn(),
  deleteExtractConfig: vi.fn(),
  getTransformConfig: vi.fn(),
  listTransformConfigs: vi.fn(),
  upsertTransformConfig: vi.fn(),
  deleteTransformConfig: vi.fn(),
  getRun: vi.fn(),
  listRuns: vi.fn(),
  createRun: vi.fn(),
  deleteRun: vi.fn(),
  deleteAllRuns: vi.fn(),
  getWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  upsertWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  getManyWorkflows: vi.fn(),
  getTenantInfo: vi.fn(),
  setTenantInfo: vi.fn(),
  getIntegration: vi.fn(),
  listIntegrations: vi.fn(),
  upsertIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
  getManyIntegrations: vi.fn()
});

// Create a test Fastify app with authentication
export const createTestApp = (datastore: DataStore) => {
  const app = Fastify({
    logger: false
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/v1/health') {
      return;
    }
    
    (request as any).orgId = 'test-org-id';
    (request as any).authInfo = { 
      token: 'mock-token', 
      clientId: 'test-org-id' 
    };
    (request as any).datastore = datastore;
  });

  return app;
};

// Common test data
export const createMockWorkflow = (id: string = 'workflow-1'): Workflow => ({
  id,
  steps: [
    {
      id: 'step-1',
      apiConfig: {
        id: 'api-config-1',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        method: HttpMethod.GET,
        instruction: 'Get data from example API'
      }
    }
  ],
  integrationIds: ['integration-1']
});

export const createMockWorkflowWithPost = (id: string = 'workflow-2'): Workflow => ({
  id,
  steps: [
    {
      id: 'step-2',
      apiConfig: {
        id: 'api-config-2',
        urlHost: 'https://api.example.com',
        urlPath: '/create',
        method: HttpMethod.POST,
        instruction: 'Create data via example API'
      }
    }
  ],
  integrationIds: ['integration-2']
});

// Helper to register routes
export const registerRoutes = async (app: any) => {
  const { registerAllRoutes } = await import('../registry.js');
  await registerAllRoutes(app);
};
