import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStore } from '../../datastore/types.js';
import { Workflow, HttpMethod } from '@superglue/client';
import { 
  setupAuthMocks, 
  createMockDatastore, 
  createTestApp, 
  createMockWorkflow, 
  createMockWorkflowWithPost,
  registerRoutes 
} from './test-utils.js';

// Setup mocks
setupAuthMocks();

// Import the workflows module to register routes
import '../workflows.js';

describe('Workflows API', () => {
  let app: any;
  let mockDatastore: DataStore;

  beforeEach(async () => {
    mockDatastore = createMockDatastore();
    app = createTestApp(mockDatastore);
    await registerRoutes(app);
  });

  describe('GET /v1/workflows', () => {
    it('should return workflows with pagination', async () => {
      const mockWorkflows: Workflow[] = [
        createMockWorkflow('workflow-1'),
        createMockWorkflowWithPost('workflow-2')
      ];

      vi.mocked(mockDatastore.listWorkflows).mockResolvedValue({
        items: mockWorkflows,
        total: 2
      });

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        items: mockWorkflows,
        pagination: {
          total: 2,
          limit: 10,
          offset: 0
        }
      });

      expect(mockDatastore.listWorkflows).toHaveBeenCalledWith({
        orgId: 'test-org-id',
        limit: 10,
        offset: 0
      });
    });

    it('should handle custom pagination parameters', async () => {
      const mockWorkflows: Workflow[] = [createMockWorkflow()];

      vi.mocked(mockDatastore.listWorkflows).mockResolvedValue({
        items: mockWorkflows,
        total: 1
      });

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows?limit=5&offset=10'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().pagination).toEqual({
        total: 1,
        limit: 5,
        offset: 10
      });

      expect(mockDatastore.listWorkflows).toHaveBeenCalledWith({
        orgId: 'test-org-id',
        limit: 5,
        offset: 10
      });
    });

    it('should enforce maximum limit of 100', async () => {
      const mockWorkflows: Workflow[] = [];

      vi.mocked(mockDatastore.listWorkflows).mockResolvedValue({
        items: mockWorkflows,
        total: 0
      });

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows?limit=150'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().pagination.limit).toBe(100);

      expect(mockDatastore.listWorkflows).toHaveBeenCalledWith({
        orgId: 'test-org-id',
        limit: 100,
        offset: 0
      });
    });

    it('should reject negative offset values', async () => {
      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows?offset=-5'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle datastore errors', async () => {
      vi.mocked(mockDatastore.listWorkflows).mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows'
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to list workflows'
      });
    });

  });

  describe('GET /v1/workflows/:id', () => {
    it('should return a specific workflow', async () => {
      const mockWorkflow = createMockWorkflow();

      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(mockWorkflow);

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows/workflow-1'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockWorkflow);

      expect(mockDatastore.getWorkflow).toHaveBeenCalledWith({
        id: 'workflow-1',
        orgId: 'test-org-id'
      });
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(null);

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows/non-existent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'NOT_FOUND',
        message: 'Workflow not found'
      });
    });

    it('should handle datastore errors', async () => {
      vi.mocked(mockDatastore.getWorkflow).mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: HttpMethod.GET,
        url: '/v1/workflows/workflow-1'
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get workflow'
      });
    });
  });

  describe('POST /v1/workflows', () => {
    it('should create a new workflow', async () => {
      const workflowData = createMockWorkflow();

      const requestBody = {
        id: 'workflow-1',
        version: '1.0.0',
        data: workflowData
      };

      vi.mocked(mockDatastore.upsertWorkflow).mockResolvedValue(workflowData);

      const response = await app.inject({
        method: HttpMethod.POST,
        url: '/v1/workflows',
        payload: requestBody
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(workflowData);

      expect(mockDatastore.upsertWorkflow).toHaveBeenCalledWith({
        id: 'workflow-1',
        workflow: workflowData,
        orgId: 'test-org-id'
      });
    });

    it('should handle datastore errors during creation', async () => {
      const requestBody = {
        id: 'workflow-1',
        version: '1.0.0',
        data: createMockWorkflow()
      };

      vi.mocked(mockDatastore.upsertWorkflow).mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: HttpMethod.POST,
        url: '/v1/workflows',
        payload: requestBody
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create workflow'
      });
    });
  });

  describe('PUT /v1/workflows/:id', () => {
    it('should update an existing workflow', async () => {
      const existingWorkflow = createMockWorkflow();

      const updatedWorkflow = createMockWorkflowWithPost('workflow-1');
      updatedWorkflow.integrationIds = ['integration-1', 'integration-2'];

      const requestBody = {
        version: '1.1.0',
        data: updatedWorkflow
      };

      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(existingWorkflow);
      vi.mocked(mockDatastore.upsertWorkflow).mockResolvedValue(updatedWorkflow);

      const response = await app.inject({
        method: HttpMethod.PUT,
        url: '/v1/workflows/workflow-1',
        payload: requestBody
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(updatedWorkflow);

      expect(mockDatastore.getWorkflow).toHaveBeenCalledWith({
        id: 'workflow-1',
        orgId: 'test-org-id'
      });
      expect(mockDatastore.upsertWorkflow).toHaveBeenCalledWith({
        id: 'workflow-1',
        workflow: updatedWorkflow,
        orgId: 'test-org-id'
      });
    });

    it('should return 404 when workflow not found', async () => {
      const requestBody = {
        version: '1.1.0',
        data: createMockWorkflow()
      };

      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(null);

      const response = await app.inject({
        method: HttpMethod.PUT,
        url: '/v1/workflows/non-existent',
        payload: requestBody
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'NOT_FOUND',
        message: 'Workflow not found'
      });
    });

    it('should handle datastore errors during update', async () => {
      const existingWorkflow = createMockWorkflow();

      const requestBody = {
        version: '1.1.0',
        data: existingWorkflow
      };

      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(existingWorkflow);
      vi.mocked(mockDatastore.upsertWorkflow).mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: HttpMethod.PUT,
        url: '/v1/workflows/workflow-1',
        payload: requestBody
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update workflow'
      });
    });
  });

  describe('DELETE /v1/workflows/:id', () => {
    it('should delete an existing workflow', async () => {
      const existingWorkflow = createMockWorkflow();

      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(existingWorkflow);
      vi.mocked(mockDatastore.deleteWorkflow).mockResolvedValue(true);

      const response = await app.inject({
        method: HttpMethod.DELETE,
        url: '/v1/workflows/workflow-1'
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      expect(mockDatastore.getWorkflow).toHaveBeenCalledWith({
        id: 'workflow-1',
        orgId: 'test-org-id'
      });
      expect(mockDatastore.deleteWorkflow).toHaveBeenCalledWith({
        id: 'workflow-1',
        orgId: 'test-org-id'
      });
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(null);

      const response = await app.inject({
        method: HttpMethod.DELETE,
        url: '/v1/workflows/non-existent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'NOT_FOUND',
        message: 'Workflow not found'
      });
    });

    it('should handle datastore errors during deletion', async () => {
      const existingWorkflow = createMockWorkflow();

      vi.mocked(mockDatastore.getWorkflow).mockResolvedValue(existingWorkflow);
      vi.mocked(mockDatastore.deleteWorkflow).mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: HttpMethod.DELETE,
        url: '/v1/workflows/workflow-1'
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete workflow'
      });
    });
  });
});
