import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { resolvers, typeDefs } from './graphql/graphql.js';
import { handleQueryError, sessionId, telemetryClient, telemetryMiddleware } from './utils/telemetry.js';
import { createDataStore } from './utils/datastore.js';

// Constants
const PORT = process.env.GRAPHQL_PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const DEBUG = process.env.DEBUG === 'true';
export const DEFAULT_QUERY = `
query Query {
  listCalls(limit: 10) {
    items {
      id
      status
      createdAt
    }
    total
  }
}`;
const datastore = createDataStore({ type: process.env.DATASTORE_TYPE === "redis" ?  'redis' : 'memory' });

// Apollo Server Configuration
const apolloConfig = {
  typeDefs,
  resolvers,
  introspection: true,
  bodyParserOptions: { limit: "1024mb", type: "application/json" },
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({ 
      footer: false, 
      embed: true, 
      document: DEFAULT_QUERY
    }),
    // Telemetry Plugin
    {
      requestDidStart: async () => ({
        willSendResponse: async (requestContext) => {
          const errors = requestContext.errors;
          if(errors && errors.length > 0) {
            console.error(errors);
          }
          if (errors && telemetryClient) {
            handleQueryError(errors, requestContext.request.query);
          }
        }
      })
    }
  ],
};

// Context Configuration
const contextConfig = {
  context: async ({ req }) => {
    if (req?.body?.query && 
      !req.body.query.includes("IntrospectionQuery") && 
      !req.body.query.includes("__schema") && DEBUG) {
      console.log(`${req.body.query}`);
    }
    return { datastore: datastore };
  }
};

// Authentication Middleware
const authMiddleware = (req, res, next) => {
  if(req.path === '/health') {
    return res.status(200).send('OK');
  }
  const token = req.headers?.authorization?.split(" ")?.[1]?.trim() || req.query.token;
  
  if (!token || token !== AUTH_TOKEN) {
    console.log(`Authentication failed for token: ${token}`);
    return res.status(401).send(getAuthErrorHTML(token));
  }
  next();
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
          </ul>
        </div>
      </body>
    </html>
  `;
}

// Server Setup
async function startServer() {
  // Initialize Apollo Server
  const server = new ApolloServer(apolloConfig);
  await server.start();

  // Express App Setup
  const app = express();
  app.use(express.json({ limit: '1024mb' }));
  app.use(cors());
  app.use(authMiddleware);
  app.use(telemetryMiddleware);
  app.use('/', expressMiddleware(server, contextConfig));

  // Start HTTP Server
  const httpServer = http.createServer(app);
  
  await new Promise<void>((resolve) => {
    httpServer.listen({ port: PORT }, resolve);
  });

  console.log(`🚀 superglue server ready`);
}

// Start the server
startServer().catch(console.error);