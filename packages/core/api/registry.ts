import { FastifyInstance } from "fastify";
import { ALL_BASE_ROLES, ApiModule, RoutePermission } from "./types.js";

const modules: ApiModule[] = [];
const routePermissions = new Map<string, RoutePermission>();

const mcpPermission: RoutePermission = {
  type: "execute",
  resource: "tools",
  allowedBaseRoles: ALL_BASE_ROLES,
};
routePermissions.set("GET:/mcp", mcpPermission);
routePermissions.set("POST:/mcp", mcpPermission);
routePermissions.set("DELETE:/mcp", mcpPermission);

export function registerApiModule(module: ApiModule): void {
  modules.push(module);

  for (const route of module.routes) {
    const key = `${route.method}:/v1${route.path}`;
    routePermissions.set(key, route.permissions);
  }
}

// Lookup route permissions by method and path
// Handles query strings and trailing slashes automatically
export function getRoutePermission(method: string, path: string): RoutePermission | undefined {
  if (!path) throw new Error("Path is required");

  // First try exact match
  let permission = routePermissions.get(`${method}:${path}`);
  if (permission) return permission;

  // Strip query string and trailing slash, then retry
  const normalizedPath = path.split("?")[0].replace(/\/$/, "") || "/";
  if (normalizedPath !== path) {
    permission = routePermissions.get(`${method}:${normalizedPath}`);
  }
  return permission;
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
