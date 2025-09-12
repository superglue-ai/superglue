import { FastifyInstance } from 'fastify';
import { ApiModule } from './types.js';

const modules: ApiModule[] = [];

export function registerApiModule(module: ApiModule): void {
  modules.push(module);
}

// This adds a v1 prefix to all routes
export async function registerAllRoutes(fastify: FastifyInstance): Promise<void> {
  for (const module of modules) {
    for (const route of module.routes) {
      const fullPath = `/v1${route.path}`;
      
      fastify.route({
        method: route.method,
        url: fullPath,
        handler: route.handler,
        schema: route.schema
      });
    }
  }
}
