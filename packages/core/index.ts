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
import { LocalKeyManager } from './auth/localKeyManager.js';
import { SupabaseKeyManager } from './auth/supabaseKeyManager.js';
import { createDataStore } from './datastore/datastore.js';
import { resolvers, typeDefs } from './graphql/graphql.js';
import { createTelemetryPlugin, telemetryMiddleware } from './utils/telemetry.js';
import { logMessage } from "./utils/logs.js";


// Constants
const PORT = process.env.GRAPHQL_PORT || 3000;
const authManager = process.env.NEXT_PUBLIC_SUPABASE_URL ? new SupabaseKeyManager() : new LocalKeyManager();

const DEBUG = process.env.DEBUG === 'true';
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

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  // Allow WebSocket connections through without this middleware initially
  // Auth can be handled within the WebSocket context if needed
  if (req.headers.upgrade === 'websocket') {
    return next();
  }

  if (req.path === '/health') {
    return res.status(200).send('OK');
  }

  const token = req.headers?.authorization?.split(" ")?.[1]?.trim() || req.query.token;
  if (!token) {
    logMessage('warn', `Authentication failed for token: ${token}`);
    return res.status(401).send(getAuthErrorHTML(token));
  }

  const authResult = await authManager.authenticate(token);

  if (!authResult.success) {
    logMessage('warn', `Authentication failed for token: ${token}`);
    return res.status(401).send(getAuthErrorHTML(token));
  }
  req.orgId = authResult.orgId;
  req.headers["orgId"] = authResult.orgId; // Pass orgId in headers
  return next();
};

// Helper Functions
function getAuthErrorHTML(token: string | undefined) {
  return `
    <html>
      <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;">
        <div style="text-align: center;">
          <h1>🔐 Authentication ${token ? 'Failed' : 'Required'}</h1>
          <p>Please provide a valid auth token via:</p>
          <ul style="list-style: none; padding: 0;">
            <li>Authorization header: <code>Authorization: Bearer TOKEN</code></li>
            <li>Query parameter: <code>?token=TOKEN</code></li>
            <li>WebSocket connectionParams: <code>{ "Authorization": "Bearer TOKEN" }</code></li>
          </ul>
        </div>
      </body>
    </html>
  `;
}

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
    // You might want to add context/authentication logic here for WebSockets
    context: async (ctx: any, msg, args) => {
      // Example: Authenticate based on connectionParams
      const token = ctx.connectionParams?.Authorization?.split(" ")?.[1]?.trim() || ctx.extra?.request?.url?.split("token=")?.[1]?.split("&")?.[0];
      if (token) {
        const authResult = await authManager.authenticate(token);
        if (authResult.success) {
          return { datastore: datastore, orgId: authResult.orgId };
        } else {
           logMessage('warn', `Subscription authentication failed for token: ${token}`);
           throw new Error('Authentication failed');
        }
      }
       logMessage('warn', `Subscription connection attempt without valid token`);
       throw new Error('Authentication required');
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