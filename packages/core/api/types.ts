import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, ServiceMetadata } from '@superglue/shared';

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  traceId?: string;
  authInfo: {
    orgId: string;
    userId?: string;
    orgName?: string;
    orgRole?: UserRole;
  };
  datastore: any;
  
  toMetadata: () => ServiceMetadata;
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
