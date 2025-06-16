import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cluster from 'cluster';
import cors from 'cors';
import express from 'express';
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import { useServer } from 'graphql-ws/use/ws';
import http from 'http';
import { WebSocketServer } from 'ws';
import { authMiddleware, extractToken, validateToken } from './auth/auth.js';
import { createDataStore } from './datastore/datastore.js';
import { resolvers, typeDefs } from './graphql/graphql.js';
import { handleMcpSessionRequest, mcpHandler } from './mcp/mcp-server.js';
import { logMessage } from "./utils/logs.js";
import { createTelemetryPlugin, telemetryMiddleware } from './utils/telemetry.js';
// Constants
const PORT = process.env.GRAPHQL_PORT || 3000;

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
const datastore = createDataStore({ type: process.env.DATASTORE_TYPE as any });

// Create the schema, which will be used separately by ApolloServer and useServer
const schema = makeExecutableSchema({ typeDefs, resolvers });


// Context Configuration (can be shared or adapted for WS context)
const getHttpContext = async ({ req }) => {
  return {
    datastore: datastore,
    orgId: req.orgId || ''
  };
};

function validateEnvironment() {
  if (!process.env.GRAPHQL_PORT) {
    throw new Error('GRAPHQL_PORT is not set.');
  }

  if ((process.env.LLM_PROVIDER !== 'GEMINI') && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  if ((process.env.LLM_PROVIDER === 'GEMINI') && !process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  if (process.env.DATASTORE_TYPE === 'redis' && !process.env.REDIS_HOST) {
    throw new Error('REDIS_HOST is not set.');
  }

  if (!process.env.AUTH_TOKEN && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('AUTH_TOKEN is not set and no other authentication provider is configured.');
  }
}

// Server Setup
async function startServer() {
  validateEnvironment();

  // Express App Setup
  const app = express();
  // Create HTTP server
  const httpServer = http.createServer(app);

  // WebSocket Server Setup
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/', // Specify the path for WebSocket connections
  });

  // Setup graphql-ws server
  const serverCleanup = useServer({
    schema,
    context: async (ctx: any, msg, args) => {
      const token = extractToken(ctx);
      const authResult = await validateToken(token);

      if (!authResult.success) {
        logMessage('warn', `Subscription authentication failed for token: ${token}`);
        return false;
      }

      logMessage('info', `Subscription connected`);
      return { datastore, orgId: authResult.orgId };
    },
    onDisconnect(ctx, code, reason) {
      logMessage('info', `Subscription disconnected. code=${code} reason=${reason}`);
    },
  }, wsServer);


  // Apollo Server Configuration
  const server = new ApolloServer({
    schema, // Use the combined schema
    introspection: true,
    csrfPrevention: false,
    plugins: [
      // Proper shutdown for the HTTP server.
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server.
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

  // Start Apollo Server (needed for HTTP middleware)
  await server.start();


  // Apply Middleware
  app.use(cors<cors.CorsRequest>()); // Use cors() directly
  app.use(express.json({ limit: '1024mb' }));
  app.use(authMiddleware); // Apply auth after CORS and JSON parsing
  app.use(telemetryMiddleware);
  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 })); // Consider if needed before auth

  app.post('/mcp', mcpHandler);
  app.get('/mcp', handleMcpSessionRequest);
  app.delete('/mcp', handleMcpSessionRequest);

  app.use('/', expressMiddleware(server, { context: getHttpContext }));
  // Modified server startup
  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));

  logMessage('info', `🚀 Superglue server ready at http://localhost:${PORT}/ and ws://localhost:${PORT}/`);
}

// cluster mode for CPU-bound work
// we cannot use multiple workers because of the datastore and mcp statefulness
// larger refactor needed to support multiple workers
if (cluster.isPrimary) {
  cluster.fork();
} else {
  startServer();
}