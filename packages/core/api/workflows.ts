import { FastifyReply } from 'fastify';
import { logMessage } from '../utils/logs.js';
import { registerApiModule } from './registry.js';
import { AuthenticatedFastifyRequest } from './types.js';

interface WorkflowRequest extends AuthenticatedFastifyRequest {
  params: { id: string };
  body: any;
}

const getWorkflows = async (request: WorkflowRequest, reply: FastifyReply) => {
  const metadata = request.toMetadata();
  
  try {
    const { datastore, authInfo: { orgId } } = request;
    const workflows = await datastore.listWorkflows({ orgId });
    
    logMessage('info', `Listed ${workflows.length} workflows`, metadata);
    
    return {
      success: true,
      data: workflows,
      count: workflows.length
    };
  } catch (error) {
    logMessage('error', `Failed to list workflows: ${error}`, metadata);
    reply.code(500);
    return { success: false, error: 'Failed to list workflows' };
  }
};

const getWorkflow = async (request: WorkflowRequest, reply: FastifyReply) => {
  const metadata = request.toMetadata();
  
  try {
    const { datastore, authInfo: { orgId }, params } = request;
    const workflow = await datastore.getWorkflow({ id: params.id, orgId });
    
    if (!workflow) {
      reply.code(404);
      return { success: false, error: 'Workflow not found' };
    }
    
    logMessage('info', `Retrieved workflow ${params.id}`, metadata);
    
    return {
      success: true,
      data: workflow
    };
  } catch (error) {
    logMessage('error', `Failed to get workflow ${request.params.id}: ${error}`, metadata);
    reply.code(500);
    return { success: false, error: 'Failed to get workflow' };
  }
};

// Register the workflow routes
registerApiModule({
  name: 'workflows',
  routes: [
    {
      method: 'GET',
      path: '/workflows',
      handler: getWorkflows
    },
    {
      method: 'GET',
      path: '/workflows/:id',
      handler: getWorkflow
    },
  ]
});
