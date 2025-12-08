import type { AuthenticatedFastifyRequest, RouteHandler } from './types.js';
import { registerApiModule } from './registry.js';

const getExample: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    
    return reply.code(200).send({ 
      success: true, 
      message: 'Example endpoint working!',
      orgId: authReq.authInfo.orgId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const createExample: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const body = request.body as { name: string; data: any };
    
    if (!body.name) {
      return reply.code(400).send({ 
        success: false, 
        error: 'Missing required field: name' 
      });
    }

    return reply.code(201).send({ 
      success: true, 
      message: 'Example created',
      data: {
        name: body.name,
        orgId: authReq.authInfo.orgId,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

registerApiModule({
  name: 'example',
  routes: [
    {
      method: 'GET',
      path: '/example',
      handler: getExample
    },
    {
      method: 'POST',
      path: '/example',
      handler: createExample
    }
  ]
});

