import { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  orgId: string;
  authInfo: {
    token: string;
    clientId: string;
  };
  datastore: any;
}

export interface RouteHandler {
  (request: AuthenticatedFastifyRequest, reply: FastifyReply): Promise<any>;
}

export interface RouteConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: RouteHandler;
  schema?: any;
}

export interface ApiModule {
  name: string;
  routes: RouteConfig[];
}
