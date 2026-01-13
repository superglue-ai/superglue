import { FastifyInstance } from "fastify";
import { ApiModule, RoutePermission } from "./types.js";

const modules: ApiModule[] = [];
const routePermissions = new Map<string, RoutePermission>();

export function registerApiModule(module: ApiModule): void {
  modules.push(module);

  // Build permission lookup map
  for (const route of module.routes) {
    if (route.permissions) {
      const key = `${route.method}:/v1${route.path}`;
      routePermissions.set(key, route.permissions);
    }
  }
}

// Lookup route permissions by method and path
export function getRoutePermission(method: string, path: string): RoutePermission | undefined {
  return routePermissions.get(`${method}:${path}`);
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
        schema: route.schema,
      });
    }
  }
}
