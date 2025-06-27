import { ApolloServer } from '@apollo/server';
import type { DataStore } from "@superglue/shared";
import express from "express";
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import http from 'http';
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";
import { FileStore } from "../datastore/filestore.js";
import { MemoryStore } from "../datastore/memory.js";
import { mcpHandler } from '../mcp/mcp-server.js';
import { logMessage } from '../utils/logs.js';
import { createTelemetryPlugin, telemetryMiddleware } from '../utils/telemetry.js';

const DEFAULT_QUERY = `
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

/**
 * Creates and manages a mock HTTP server for integration tests
 */
export class MockServerFactory {
  private server: any;
  private baseUrl = "";
  private app = express();

  constructor() {
    this.app.use(express.json());
  }

  addGetRoute(path: string, handler: express.RequestHandler) {
    this.app.get(path, handler);
    return this;
  }

  addPostRoute(path: string, handler: express.RequestHandler) {
    this.app.post(path, handler);
    return this;
  }

  /**
   * Get the Express app to add custom routes
   */
  getApp() {
    return this.app;
  }

  async start(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.server = this.app.listen(0, () => {
        const address = this.server.address() as AddressInfo;
        this.baseUrl = `http://localhost:${address.port}`;
        console.log(`Mock server running at ${this.baseUrl}`);
        resolve(this.baseUrl);
      });
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }

  /**
   * Setup before/after hooks for the mock server
   */
  setupHooks() {
    beforeAll(async () => {
      await this.start();
    });

    afterAll(() => {
      this.stop();
    });
  }
}

/**
 * Factory for data stores used in tests
 */
export class DataStoreFactory {
  private testDir: string;
  private testPath: string;
  private testLogsPath: string;
  private dataStores: { name: string; instance: DataStore }[] = [];

  constructor(testDir = "./.test-data") {
    this.testDir = testDir;
    this.testPath = path.join(testDir, "superglue_data.json");
    this.testLogsPath = path.join(testDir, "superglue_logs.jsonl");
  }

  init() {
    // Clean up any existing test data
    if (fs.existsSync(this.testPath)) {
      fs.unlinkSync(this.testPath);
    }
    if (fs.existsSync(this.testLogsPath)) {
      fs.unlinkSync(this.testLogsPath);
    }
    if (fs.existsSync(this.testDir)) {
      fs.rmdirSync(this.testDir);
    }

    this.dataStores = [
      { name: "FileStore", instance: new FileStore(this.testDir) },
      { name: "MemoryStore", instance: new MemoryStore() },
    ];

    return this.dataStores;
  }

  getInstance(name: "FileStore" | "MemoryStore"): DataStore {
    const store = this.dataStores.find((ds) => ds.name === name);
    if (!store) {
      throw new Error(`Data store "${name}" not found`);
    }
    return store.instance;
  }

  getAllInstances() {
    return this.dataStores;
  }

  async cleanup() {
    for (const { name, instance } of this.dataStores) {
      // Cast to any since clearAll and disconnect are implementation-specific
      if (name === "FileStore") {
        // For FileStore we need to clear all and disconnect
        await (instance as any).clearAll();
        await (instance as any).disconnect();
      }
    }

    // Clean up test files
    if (fs.existsSync(this.testPath)) {
      fs.unlinkSync(this.testPath);
    }
    if (fs.existsSync(this.testLogsPath)) {
      fs.unlinkSync(this.testLogsPath);
    }
    if (fs.existsSync(this.testDir)) {
      fs.rmdirSync(this.testDir);
    }
  }

  /**
   * Setup before/after hooks for the data stores
   */
  setupHooks() {
    beforeAll(() => {
      this.init();
    });

    afterAll(async () => {
      await this.cleanup();
    });
  }

  static createMemoryStore(): DataStore {
    return new MemoryStore();
  }
}

export class EnvVarManager {
  private originalValues: Record<string, string | undefined> = {};

  set(name: string, value: string) {
    if (!(name in this.originalValues)) {
      this.originalValues[name] = process.env[name];
    }
    process.env[name] = value;
  }

  resetAll() {
    for (const [name, value] of Object.entries(this.originalValues)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    this.originalValues = {};
  }

  setupHooks() {
    afterAll(() => {
      this.resetAll();
    });
  }
}

/**
 * Creates and manages a GraphQL server for integration tests
 * Follows the same pattern as MockServerFactory but starts the real Superglue server
 */
export class GraphQLServerFactory {
  private httpServer: http.Server | null = null;
  private apolloServer: ApolloServer | null = null;
  private serverCleanup: (() => Promise<void>) | null = null;
  private baseUrl = '';

  private validateTestEnvironment() {
    // Validate required environment variables for tests
    if (!process.env.OPENAI_API_KEY && process.env.LLM_PROVIDER !== 'GEMINI') {
      throw new Error('OPENAI_API_KEY is not set for integration tests. Please add it to your .env file.');
    }

    if (!process.env.GEMINI_API_KEY && process.env.LLM_PROVIDER === 'GEMINI') {
      throw new Error('GEMINI_API_KEY is not set for integration tests. Please add it to your .env file.');
    }

    if (!process.env.AUTH_TOKEN) {
      throw new Error('AUTH_TOKEN is not set for integration tests. Please add it to your .env file.');
    }

    // Set defaults for test environment
    if (!process.env.LLM_PROVIDER) {
      process.env.LLM_PROVIDER = 'OPENAI';
    }
  }

  async start(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      try {
        // Validate environment
        this.validateTestEnvironment();

        // Import required modules
        const { createDataStore } = await import('../datastore/datastore.js');
        const { ApolloServer } = await import('@apollo/server');
        const express = (await import('express')).default;
        const http = (await import('http')).default;
        const cors = (await import('cors')).default;
        const { makeExecutableSchema } = await import('@graphql-tools/schema');
        const { expressMiddleware } = await import('@apollo/server/express4');
        const { ApolloServerPluginDrainHttpServer } = await import('@apollo/server/plugin/drainHttpServer');
        const { typeDefs, resolvers } = await import('../graphql/graphql.js');
        const { ApolloServerPluginLandingPageLocalDefault } = await import('@apollo/server/plugin/landingPage/default');
        const { WebSocketServer } = await import('ws');
        const { useServer } = await import('graphql-ws/use/ws');
        const { extractToken, validateToken, authMiddleware } = await import('../auth/auth.js');

        // Create datastore for tests
        const datastore = createDataStore({ type: process.env.DATASTORE_TYPE as any });

        // Create the schema
        const schema = makeExecutableSchema({ typeDefs, resolvers });

        // Context Configuration
        const getHttpContext = async ({ req }: any) => {
          return {
            datastore: datastore,
            orgId: req.orgId || ''
          };
        };

        // Express App Setup
        const app = express();

        // Create HTTP server with port 0 (auto-assign available port)
        this.httpServer = http.createServer(app);

        // WebSocket Server Setup
        const wsServer = new WebSocketServer({
          server: this.httpServer,
          path: '/',
        });

        // Setup graphql-ws server
        const serverCleanupResult = useServer({
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
        this.serverCleanup = () => Promise.resolve(serverCleanupResult.dispose());

        // Apollo Server Configuration
        this.apolloServer = new ApolloServer({
          schema,
          introspection: true,
          csrfPrevention: false,
          plugins: [
            ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
            {
              async serverWillStart() {
                return {
                  async drainServer() {
                    // Capture the cleanup function in the plugin scope
                    if (serverCleanupResult) {
                      await Promise.resolve(serverCleanupResult.dispose());
                    }
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

        // Start Apollo Server
        await this.apolloServer.start();

        // Apply Middleware
        app.use(cors());
        app.use(express.json({ limit: '1024mb' }));
        app.use(authMiddleware);
        app.use(telemetryMiddleware);
        app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 }));

        app.post('/mcp', mcpHandler);
        app.get('/mcp', mcpHandler);
        app.delete('/mcp', mcpHandler);

        app.use('/', expressMiddleware(this.apolloServer, { context: getHttpContext }));

        // Start server on available port
        this.httpServer.listen(0, () => {
          const address = this.httpServer!.address() as AddressInfo;
          this.baseUrl = `http://localhost:${address.port}/graphql`;

          console.log(`🚀 Test GraphQL server ready at ${this.baseUrl}`);

          resolve(this.baseUrl);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    try {
      // Stop Apollo server
      if (this.apolloServer) {
        await this.apolloServer.stop();
        this.apolloServer = null;
      }

      // Stop HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => resolve());
        });
        this.httpServer = null;
      }

      // Cleanup WebSocket server
      if (this.serverCleanup) {
        await this.serverCleanup();
        this.serverCleanup = null;
      }

      console.log('🔄 Test GraphQL server stopped');
    } catch (error) {
      console.error('Error stopping GraphQL server:', error);
    }
  }

  /**
   * Setup before/after hooks for the GraphQL server
   */
  setupHooks() {
    beforeAll(async () => {
      await this.start();
    });

    afterAll(async () => {
      await this.stop();
    });
  }
}
