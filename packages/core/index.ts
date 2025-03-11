import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import cors from 'cors';
import express from 'express';
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import http from 'http';
import { LocalKeyManager } from './auth/localKeyManager.js';
import { SupabaseKeyManager } from './auth/supabaseKeyManager.js';
import { createDataStore } from './datastore/datastore.js';
import { resolvers, typeDefs } from './graphql/graphql.js';
import { createTelemetryPlugin, telemetryMiddleware } from './utils/telemetry.js';

// Constants
const PORT = process.env.GRAPHQL_PORT || 3000;
const authManager = process.env.AUTH_TOKEN ? new LocalKeyManager() : new SupabaseKeyManager();

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

// Apollo Server Configuration
const apolloConfig = {
  typeDefs,
  resolvers,
  introspection: true,
  csrfPrevention: false,
  bodyParserOptions: { limit: "1024mb", type: "application/json" },
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({ 
      footer: false, 
      embed: true, 
      document: DEFAULT_QUERY
    }),
    createTelemetryPlugin()
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
    return { 
      datastore: datastore,
      orgId: req.orgId || ''
    };
  }
};

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  if(req.path === '/health') {
    return res.status(200).send('OK');
  }

  const token = req.headers?.authorization?.split(" ")?.[1]?.trim() || req.query.token;
  if(!token) {
    console.log(`Authentication failed for token: ${token}`);
    return res.status(401).send(getAuthErrorHTML(token));
  }

  const authResult = await authManager.authenticate(token);

  if (!authResult.success) {
    console.log(`Authentication failed for token: ${token}`);
    return res.status(401).send(getAuthErrorHTML(token));
  }
  req.orgId = authResult.orgId;
  req.headers["orgId"] = authResult.orgId;
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
          </ul>
        </div>
      </body>
    </html>
  `;
}

function validateEnvironment() {
  const requiredEnvVars = [
    'LLM_PROVIDER',
    'LLM_MODEL',
    'GRAPHQL_PORT',
  ];
  // backwards compatibility
  process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
  process.env.LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL;

  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(`Environment variable ${envVar} is not set.`);
    }
  });
}

// Server Setup
async function startServer() {
  validateEnvironment();
  // Initialize Apollo Server
  const server = new ApolloServer(apolloConfig);
  await server.start();

  // Express App Setup
  const app = express();
  app.use(express.json({ limit: '1024mb' }));
  app.use(cors());
  app.use(authMiddleware);
  app.use(telemetryMiddleware);
  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 }));
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