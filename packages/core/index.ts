import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import cors from 'cors';
import express from 'express';
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import http from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createDataStore } from './datastore/datastore.js';
import { resolvers, typeDefs } from './graphql/graphql.js';
import { createTelemetryPlugin, telemetryMiddleware } from './utils/telemetry.js';
import { logMessage } from "./utils/logs.js";
import { authMiddleware, validateToken, extractToken } from './auth/auth.js';

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
  const requiredEnvVars = [
    'OPENAI_MODEL',
    'GRAPHQL_PORT',
    'OPENAI_API_KEY'
  ];
  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(`Environment variable ${envVar} is not set.`);
    }
  });

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

  // Apply Apollo middleware *after* other middlewares
  // Ensure the path matches your desired GraphQL endpoint for HTTP
  app.use('/', expressMiddleware(server, { context: getHttpContext }));

  // Modified server startup
  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));

  logMessage('info', `🚀 Superglue server ready at http://localhost:${PORT}/ and ws://localhost:${PORT}/`);
}

// Start the server
startServer().catch(error => {
  logMessage('error', 'Failed to start server:', error);
  process.exit(1);
});