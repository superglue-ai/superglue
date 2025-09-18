import { FastifyReply } from 'fastify';
import { logMessage } from '../utils/logs.js';
import { registerApiModule } from './registry.js';
import { AuthenticatedFastifyRequest } from './types.js';
import { workflowSchemas } from './schemas/workflow.js';
import { Workflow, Integration } from '@superglue/client';
import { generateUniqueId, waitForIntegrationProcessing } from '@superglue/shared/utils';
import { WorkflowBuilder } from '../workflow/workflow-builder.js';
import { JSONSchema } from 'openai/lib/jsonschema.mjs';

interface GetWorkflowsRequest extends AuthenticatedFastifyRequest {
  query: {
    limit?: string;
    offset?: string;
    integrationIds?: string;
    updatedAfter?: string;
    updatedBefore?: string;
  };
}

interface GetWorkflowRequest extends AuthenticatedFastifyRequest {
  params: { id: string };
}
interface CreateWorkflowRequest extends AuthenticatedFastifyRequest {
  body: {
    id: string;
    version: string;
    data: Workflow;
  };
}

interface UpdateWorkflowRequest extends AuthenticatedFastifyRequest {
  params: { id: string };
  body: {
    version: string;
    data: Workflow;
  };
}

interface DeleteWorkflowRequest extends AuthenticatedFastifyRequest {
  params: { id: string };
}

interface BuildWorkflowRequest extends AuthenticatedFastifyRequest {
  body: {
    instruction: string;
    payload?: Record<string, unknown>;
    integrationIds: string[];
    responseSchema?: JSONSchema;
  };
}

const getWorkflows = async (request: GetWorkflowsRequest, reply: FastifyReply) => {
  try {
    const { datastore, orgId, query } = request;
    
    // Parse and validate pagination parameters
    const limit = Math.min(parseInt(query.limit || '10', 10), 100);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);
    
    // Parse filter parameters (for future implementation)
    const filters = {
      integrationIds: query.integrationIds ? query.integrationIds.split(',') : undefined,
      updatedAfter: query.updatedAfter ? new Date(query.updatedAfter) : undefined,
      updatedBefore: query.updatedBefore ? new Date(query.updatedBefore) : undefined,
    };
    
    // Call datastore with pagination
    const result = await datastore.listWorkflows({ 
      orgId, 
      limit, 
      offset 
      // Note: filters are not yet implemented in datastore layer
    });
    
    return {
      items: result.items,
      pagination: {
        total: result.total,
        limit,
        offset
      }
    };
  } catch (error) {
    logMessage('error', `Failed to list workflows: ${error}`, { orgId: request.orgId });
    reply.code(500);
    return { error: 'INTERNAL_ERROR', message: 'Failed to list workflows' };
  }
};

const getWorkflow = async (request: GetWorkflowRequest, reply: FastifyReply) => {
  try {
    const { datastore, orgId, params } = request;
    const workflow = await datastore.getWorkflow({ id: params.id, orgId });
    
    if (!workflow) {
      reply.code(404);
      return { error: 'NOT_FOUND', message: 'Workflow not found' };
    }
    
    return workflow;
  } catch (error) {
    logMessage('error', `Failed to get workflow ${request.params.id}: ${error}`, { orgId: request.orgId });
    reply.code(500);
    return { error: 'INTERNAL_ERROR', message: 'Failed to get workflow' };
  }
};

const createWorkflow = async (request: CreateWorkflowRequest, reply: FastifyReply) => {
  try {
    const { datastore, orgId, body } = request;
    
    const workflow = await datastore.upsertWorkflow({ id: body.id, workflow: body.data, orgId });
    
    // Log important business events (not routine operations)
    logMessage('info', `Workflow created: ${body.id}`, { 
      orgId, 
      workflowId: body.id
    });
    
    reply.code(201);
    return workflow;
  } catch (error) {
    logMessage('error', `Failed to create workflow: ${error}`, { orgId: request.orgId });
    reply.code(500);
    return { error: 'INTERNAL_ERROR', message: 'Failed to create workflow' };
  }
};

const updateWorkflow = async (request: UpdateWorkflowRequest, reply: FastifyReply) => {
  try {
    const { datastore, orgId, params, body } = request;
    
    // Check if workflow exists
    const existingWorkflow = await datastore.getWorkflow({ id: params.id, orgId });
    if (!existingWorkflow) {
      reply.code(404);
      return { error: 'NOT_FOUND', message: 'Workflow not found' };
    }
    
    const workflow = await datastore.upsertWorkflow({ 
      id: params.id, 
      workflow: body.data, 
      orgId 
    });
    
    // Log important business events
    logMessage('info', `Workflow updated: ${params.id}`, { 
      orgId, 
      workflowId: params.id,
      version: body.version 
    });
    
    return workflow;
  } catch (error) {
    logMessage('error', `Failed to update workflow ${request.params.id}: ${error}`, { orgId: request.orgId });
    reply.code(500);
    return { error: 'INTERNAL_ERROR', message: 'Failed to update workflow' };
  }
};

const deleteWorkflow = async (request: DeleteWorkflowRequest, reply: FastifyReply) => {
  try {
    const { datastore, orgId, params } = request;
    
    // Check if workflow exists
    const existingWorkflow = await datastore.getWorkflow({ id: params.id, orgId });
    if (!existingWorkflow) {
      reply.code(404);
      return { error: 'NOT_FOUND', message: 'Workflow not found' };
    }
    
    await datastore.deleteWorkflow({ id: params.id, orgId });
    
    // Log important business events
    logMessage('info', `Workflow deleted: ${params.id}`, { 
      orgId, 
      workflowId: params.id
    });
    
    reply.code(204);
    return;
  } catch (error) {
    logMessage('error', `Failed to delete workflow ${request.params.id}: ${error}`, { orgId: request.orgId });
    reply.code(500);
    return { error: 'INTERNAL_ERROR', message: 'Failed to delete workflow' };
  }
};

const buildWorkflow = async (request: BuildWorkflowRequest, reply: FastifyReply) => {
  // This endpoint
  // 1. validates the request
  // 2. fetches the integrations (possibly waiting for the docs to be processed)
  // 3. builds the workflow
  // 4. generates a unique ID for the workflow
  // 5. returns the workflow
  try {
    const { datastore, orgId, body } = request;
    const { instruction, payload = {}, integrationIds, responseSchema } = body;

    if (!instruction || instruction.trim() === "") {
      reply.code(400);
      return { error: 'VALIDATION_ERROR', message: 'Instruction is required' };
    }

    const metadata = { orgId, runId: crypto.randomUUID() };

    let resolvedIntegrations: Integration[] = [];
    if (integrationIds && integrationIds.length > 0) {
      const datastoreAdapter = {
        getManyIntegrations: async (ids: string[]): Promise<Integration[]> => {
          return await datastore.getManyIntegrations({ ids, includeDocs: true, orgId: orgId });
        }
      };
      resolvedIntegrations = await waitForIntegrationProcessing(datastoreAdapter, integrationIds);
    }

    const builder = new WorkflowBuilder(
      instruction,
      resolvedIntegrations,
      payload,
      responseSchema,
      metadata
    );
    
    const workflow = await builder.buildWorkflow();

    // Generate unique ID
    workflow.id = await generateUniqueId({
      baseId: workflow.id,
      exists: async (id) => !!(await datastore.getWorkflow({ id, orgId }))
    });

    logMessage('info', `Workflow built: ${workflow.id}`, { 
      orgId, 
      workflowId: workflow.id,
    });

    return workflow;
  } catch (error) {
    logMessage('error', `Failed to build workflow: ${error}`, { orgId: request.orgId });
    reply.code(500);
    return { error: 'INTERNAL_ERROR', message: 'Failed to build workflow' };
  }
};

// Register the workflow routes
registerApiModule({
  name: 'workflows',
  routes: [
    {
      method: 'GET',
      path: '/workflows',
      handler: getWorkflows,
      schema: workflowSchemas.getWorkflows
    },
    {
      method: 'GET',
      path: '/workflows/:id',
      handler: getWorkflow,
      schema: workflowSchemas.getWorkflow
    },
    {
      method: 'POST',
      path: '/workflows',
      handler: createWorkflow,
      schema: workflowSchemas.createWorkflow
    },
    {
      method: 'PUT',
      path: '/workflows/:id',
      handler: updateWorkflow,
      schema: workflowSchemas.updateWorkflow
    },
    {
      method: 'DELETE',
      path: '/workflows/:id',
      handler: deleteWorkflow,
      schema: workflowSchemas.deleteWorkflow
    },
    {
      method: 'POST',
      path: '/workflows/build',
      handler: buildWorkflow,
      schema: workflowSchemas.buildWorkflow
    }
  ]
});
