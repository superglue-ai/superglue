import { FastifyReply } from 'fastify';
import { logMessage } from '../utils/logs.js';
import { registerApiModule } from './registry.js';
import { AuthenticatedFastifyRequest } from './types.js';
import { workflowSchemas } from './schemas/workflow.js';
import { Workflow } from '@superglue/client';

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
      workflowId: body.id,
      version: body.version 
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
    }
  ]
});
