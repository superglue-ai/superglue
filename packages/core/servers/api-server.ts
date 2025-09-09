import Fastify from 'fastify';
import { registerAllRoutes } from '../api/index.js';
import { extractTokenFromFastifyRequest, validateToken } from '../auth/auth.js';
import { DataStore } from '../datastore/types.js';
import { logMessage } from "../utils/logs.js";


export async function startApiServer(datastore: DataStore) {
  // Get REST API port
  const DEFAULT_API_PORT = 3002;
  let port = process.env.API_PORT ? parseInt(process.env.API_PORT) : DEFAULT_API_PORT;
  const graphqlPort = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT) : undefined;

  if (graphqlPort !== undefined && port === graphqlPort) {
    logMessage('warn', `API_PORT cannot be the same as GRAPHQL_PORT. Switching REST API port to ${port + 1}.`);
    port = port + 1;
  }
  const PORT = port;

  // Configure Fastify logging to match the centralized logging format from utils/logs.ts
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          ignore: 'pid,hostname,reqId',
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o',
          messageFormat: '(REST API) {req.method} {req.url} {res.statusCode} - {responseTime}ms'
        }
      }
    }
  });

  // Register CORS
  await fastify.register(import('@fastify/cors'), {
    origin: true
  });

  fastify.addHook('preHandler', async (request, reply) => {
    // Skip authentication for health check and public endpoints
    if (request.url === '/v1/health') {
      return;
    }

    // Authentication logic
    const token = extractTokenFromFastifyRequest(request);
    const authResult = await validateToken(token);
    logMessage('info', `Fastify authentication result: ${JSON.stringify(authResult)}`);
    
    // If authentication fails, return 401 error
    if (!authResult.success) {
      logMessage('warn', `Fastify authentication failed for token: ${token}`);
      return reply.code(401).send({
        success: false,
        error: 'Authentication failed',
        message: authResult.message
      });
    }

    // Add orgId and auth info to request context
    (request as any).orgId = authResult.orgId;
    (request as any).authInfo = { 
      token: token, 
      clientId: authResult.orgId 
    };

    // Add datastore to request context
    (request as any).datastore = datastore;
  });

  // Register all API routes from modules
  await registerAllRoutes(fastify);

  // Health check endpoint (no authentication required)
  fastify.get('/v1/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Start server
  try {
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port: PORT, host });
    logMessage('info', `🚀 Fastify API server ready at http://${host}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}
