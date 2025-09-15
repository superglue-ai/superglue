import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cors from 'cors';
import express from 'express';
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import { useServer } from 'graphql-ws/use/ws';
import http from 'http';
import { WebSocketServer } from 'ws';
import { authMiddleware, extractTokenFromExpressRequest, validateToken } from '../auth/auth.js';
import { DataStore } from '../datastore/types.js';
import { resolvers, typeDefs } from './graphql.js';
import { mcpHandler } from '../mcp/mcp-server.js';
import { logMessage } from "../utils/logs.js";
import { createTelemetryPlugin, telemetryMiddleware } from '../utils/telemetry.js';

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

export async function startGraphqlServer(datastore: DataStore) {
  const PORT = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT) : 3000;

  // Create the schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Context Configuration
  const getHttpContext = async ({ req }) => {
    return {
      datastore: datastore,
      orgId: req.orgId || ''
    };
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
    context: async (ctx: any, msg, args) => {
      const token = extractTokenFromExpressRequest(ctx);
      const authResult = await validateToken(token);

      if (!authResult.success) {
        logMessage('warn', `Websocket Subscription authentication failed for token: ${token}`);
        return false;
      }

      logMessage('debug', `Websocket Subscription connected`);
      return { datastore, orgId: authResult.orgId };
    },
    onDisconnect(ctx, code, reason) {
      logMessage('debug', `Websocket Subscription disconnected. code=${code} reason=${reason}`);
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
  app.use(authMiddleware);
  app.use(telemetryMiddleware);
  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 }));

  app.post('/mcp', mcpHandler);
  app.get('/mcp', mcpHandler);
  app.delete('/mcp', mcpHandler);

  app.use('/', expressMiddleware(server, { context: getHttpContext }));

  try {
    await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));
    logMessage('info', `🚀 Express GraphQL server ready at http://localhost:${PORT}/ and ws://localhost:${PORT}/`);
  } catch (error) {
    logMessage('error', `Failed to start GraphQL server: ${error}`);
    throw error;
  }
  
  return { server, httpServer, app };
}