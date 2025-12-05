import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cors from 'cors';
import express from 'express';
import { graphqlUploadExpress } from 'graphql-upload-ts';
import { useServer } from 'graphql-ws/use/ws';
import http from 'http';
import { WebSocketServer } from 'ws';
import { authMiddleware, extractTokenFromExpressRequest, validateToken } from '../auth/auth.js';
import { DataStore } from '../datastore/types.js';
import { mcpHandler } from '../mcp/mcp-server.js';
import { logMessage } from "../utils/logs.js";
import { createTelemetryPlugin, telemetryMiddleware } from '../utils/telemetry.js';
import { resolvers, typeDefs } from './graphql.js';
import { GraphQLRequestContext, WorkerPools } from './types.js';
import { generateTraceId, traceIdMiddleware } from '../utils/trace-id.js';

export const DEFAULT_QUERY = `
query Query {
  listRuns(limit: 10) {
    items {
      id
      status
      createdAt
    }
    total
  }
}`;

export async function startGraphqlServer(datastore: DataStore, workerPools: WorkerPools) {
  const PORT = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT) : 3000;

  // Create the schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Context Configuration
  const buildContextFromRequest = async ({ req }: { req: any }): Promise<GraphQLRequestContext> => {
    const context: GraphQLRequestContext = {
      datastore: datastore,
      workerPools: workerPools,
      traceId: req.traceId,
      orgId: req.orgId || '',
      userId: req.authInfo?.userId,
      orgName: req.authInfo?.orgName,
      orgRole: req.authInfo?.orgRole,
      toMetadata: function() {
        return { traceId: this.traceId, orgId: this.orgId };
      }
    };
    return context;
  };

  // Express App Setup
  const app = express();
  const httpServer = http.createServer(app);

  // WebSocket Server Setup
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/',
  });

  // Setup graphql-ws server
  const serverCleanup = useServer({
    schema,
    onConnect: async (ctx: any) => {
      ctx.traceId = generateTraceId();;
    },
    context: async (ctx: any, msg, args): Promise<GraphQLRequestContext | boolean> => {
      const traceId = ctx.traceId;

      const token = extractTokenFromExpressRequest(ctx);
      const authResult = await validateToken(token);

      if (!authResult.success) {
        logMessage('warn', `GraphQL Server: Websocket Subscription authentication failed for token: ${token?.slice(0, 10) ?? 'none'}...`, { traceId });
        return false;
      }
      
      const context: GraphQLRequestContext = { 
        datastore,
        workerPools,
        traceId, 
        orgId: authResult.orgId,
        userId: authResult.userId,
        orgName: authResult.orgName,
        orgRole: authResult.orgRole,
        toMetadata: function() {
          return { traceId: this.traceId, orgId: this.orgId };
        }
      };
      return context;
    },
    onDisconnect(ctx: any, code, reason) {
      logMessage('debug', `GraphQL Server: Websocket Subscription disconnected. code=${code} reason=${reason}`, { traceId: ctx.traceId });
    },
  }, wsServer);

  // Apollo Server Configuration
  const server = new ApolloServer({
    schema,
    introspection: true,
    csrfPrevention: false,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
      ApolloServerPluginLandingPageLocalDefault({
        footer: false,
        embed: true,
        document: DEFAULT_QUERY
      }),
      createTelemetryPlugin()
    ],
  });

  await server.start();

  // Apply Middleware
  app.use(cors<cors.CorsRequest>());
  app.use(express.json({ limit: '1024mb' }));
  app.use(traceIdMiddleware);
  app.use(authMiddleware);
  app.use(telemetryMiddleware);
  app.use(graphqlUploadExpress({ 
    maxFileSize: 1000000000, 
    maxFiles: 1,
  }));
  app.post('/mcp', mcpHandler);
  app.get('/mcp', mcpHandler);
  app.delete('/mcp', mcpHandler);

  app.use('/', expressMiddleware(server, { context: buildContextFromRequest }));

  try {
    await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));
    logMessage('info', `🚀 Express GraphQL server ready at http://localhost:${PORT}/ and ws://localhost:${PORT}/`);
  } catch (error) {
    logMessage('error', `Failed to start GraphQL server: ${error}`);
    throw error;
  }
  
  return { server, httpServer, app };
}