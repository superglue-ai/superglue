import type { AuthenticatedFastifyRequest, RouteHandler } from './types.js';
import { registerApiModule } from './registry.js';
import { DiscoveryRun } from '@superglue/shared';

const createDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const body = request.body as { run: DiscoveryRun };
    
    if (!body.run) {
      return reply.code(400).send({ success: false, error: 'Missing run data' });
    }

    const created = await authReq.datastore.createDiscoveryRun({ 
      run: body.run,
      orgId: authReq.authInfo.orgId
    });
    
    return reply.code(201).send({ success: true, data: created });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const getDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };

    const run = await authReq.datastore.getDiscoveryRun({ id, orgId: authReq.authInfo.orgId });
    
    if (!run) {
      return reply.code(404).send({ success: false, error: 'Discovery run not found' });
    }

    return reply.code(200).send({ success: true, data: run });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const updateDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { updates: Partial<DiscoveryRun> };

    if (!body.updates) {
      return reply.code(400).send({ success: false, error: 'Missing updates data' });
    }

    const updated = await authReq.datastore.updateDiscoveryRun({
      id,
      updates: body.updates,
      orgId: authReq.authInfo.orgId
    });

    return reply.code(200).send({ success: true, data: updated });
  } catch (error) {
    if (String(error).includes('not found')) {
      return reply.code(404).send({ success: false, error: String(error) });
    }
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const listDiscoveryRuns: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const query = request.query as {
      limit?: string;
      offset?: string;
    };

    const limit = query.limit ? parseInt(query.limit) : 10;
    const offset = query.offset ? parseInt(query.offset) : 0;

    const result = await authReq.datastore.listDiscoveryRuns({
      limit,
      offset,
      orgId: authReq.authInfo.orgId
    });

    return reply.code(200).send({ 
      success: true, 
      items: result.items,
      total: result.total 
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const deleteDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };

    const deleted = await authReq.datastore.deleteDiscoveryRun({ id, orgId: authReq.authInfo.orgId });
    
    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'Discovery run not found' });
    }

    return reply.code(200).send({ success: true });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

registerApiModule({
  name: 'discovery-runs',
  routes: [
    {
      method: 'POST',
      path: '/discovery-runs',
      handler: createDiscoveryRun
    },
    {
      method: 'GET',
      path: '/discovery-runs/:id',
      handler: getDiscoveryRun
    },
    {
      method: 'PATCH',
      path: '/discovery-runs/:id',
      handler: updateDiscoveryRun
    },
    {
      method: 'GET',
      path: '/discovery-runs',
      handler: listDiscoveryRuns
    },
    {
      method: 'DELETE',
      path: '/discovery-runs/:id',
      handler: deleteDiscoveryRun
    }
  ]
});

