// Removed #!/usr/bin/env node - this is now a module
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResultSchema,
  ListToolsResultSchema,
  ServerRequest,
  ServerNotification,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SuperglueClient } from '@superglue/client';
import { request, Request, Response } from 'express';
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";


// Enums
export const CacheModeEnum = z.enum(["ENABLED", "READONLY", "WRITEONLY", "DISABLED"]);
export const HttpMethodEnum = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
export const AuthTypeEnum = z.enum(["NONE", "HEADER", "QUERY_PARAM", "OAUTH2"]);
export const PaginationTypeEnum = z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED", "DISABLED"]);

// Common Input Types
export const RequestOptionsSchema = z.object({
  cacheMode: CacheModeEnum.optional(),
  timeout: z.number().int().optional(),
  retries: z.number().int().optional(),
  retryDelay: z.number().int().optional(),
  webhookUrl: z.string().optional(),
});

export const PaginationInputSchema = z.object({
  type: PaginationTypeEnum,
  pageSize: z.string().optional(),
  cursorPath: z.string().optional(),
});

// Transform-related Schemas
export const TransformInputSchemaInternal = z.object({
  id: z.string(),
  instruction: z.string(),
  responseSchema: z.any(), // JSONSchema
  responseMapping: z.any().optional(), // JSONata
  version: z.string().optional(),
});

export const TransformInputRequestSchema = z.object({
  endpoint: TransformInputSchemaInternal.optional(),
  id: z.string().optional(),
}).refine(data => (data.endpoint && !data.id) || (!data.endpoint && data.id), {
  message: "Either 'endpoint' or 'id' must be provided, but not both for TransformInputRequest.",
});

export const TransformOperationInputSchema = {
  input: TransformInputRequestSchema,
  data: z.any(), // JSON
  options: RequestOptionsSchema.optional(),
  superglueApiKey: z.string(),
};
// Workflow-related Schemas
export const ApiInputSchemaInternal =   {
  id: z.string(),
  urlHost: z.string(),
  urlPath: z.string().optional(),
  instruction: z.string(),
  queryParams: z.any().optional(), // JSON
  method: HttpMethodEnum.optional(),
  headers: z.any().optional(), // JSON
  body: z.string().optional(),
  documentationUrl: z.string().optional(),
  responseSchema: z.any().optional(), // JSONSchema
  responseMapping: z.any().optional(), // JSONata
  authentication: AuthTypeEnum.optional(),
  pagination: PaginationInputSchema.optional(),
  dataPath: z.string().optional(),
  version: z.string().optional(),
};

export const ExecutionStepInputSchemaInternal = {
  id: z.string(),
  apiConfig: z.object(ApiInputSchemaInternal),
  executionMode: z.enum(["DIRECT", "LOOP"]).optional(),
  loopSelector: z.any().optional(), // JSONata
  loopMaxIters: z.number().int().optional(),
  inputMapping: z.any().optional(), // JSONata
  responseMapping: z.any().optional(), // JSONata
};

export const WorkflowInputSchemaInternal = {
  id: z.string(),
  steps: z.array(z.object(ExecutionStepInputSchemaInternal)),
  finalTransform: z.any().optional(), // JSONata
  responseSchema: z.any().optional(), // JSONSchema
  version: z.string().optional(),
  instruction: z.string().optional(),
};

export const WorkflowInputRequestSchema = z.object({
  workflow: z.object(WorkflowInputSchemaInternal).optional(),
  id: z.string().optional(),
}).refine(data => (data.workflow && !data.id) || (!data.workflow && data.id), {
  message: "Either 'workflow' or 'id' must be provided, but not both for WorkflowInputRequest.",
});

export const SystemInputSchema = {
  id: z.string(),
  urlHost: z.string(),
  urlPath: z.string().optional(),
  documentationUrl: z.string().optional(),
  documentation: z.string().optional(),
  credentials: z.any().optional(), // JSON
};

export const ListWorkflowsInputSchema = {
  limit: z.number().int().optional().default(10),
  offset: z.number().int().optional().default(0),
};

export const GetWorkflowInputSchema = {
  id: z.string(),
};

export const ExecuteWorkflowInputSchema = {
  id: z.string(),
  payload: z.any().optional(), // JSON
  credentials: z.any().optional(), // JSON
  options: RequestOptionsSchema.optional(),
};

export const BuildWorkflowInputSchema = {
  instruction: z.string(),
  payload: z.any().optional(), // JSON
  systems: z.array(z.object(SystemInputSchema)),
  responseSchema: z.any().optional(), // JSONSchema
};

export const UpsertWorkflowInputSchema = {
  id: z.string(),
  input: z.any(), // JSON
};

export const DeleteWorkflowInputSchema = {
  id: z.string(),
};

// --- Tool Definitions ---
// Map tool names to their Zod schemas and GraphQL details
// This remains largely the same, but SuperglueClient will be created with the passed graphqlEndpoint

const createClient = (apiKey: string) => {
  const endpoint = process.env.GRAPHQL_ENDPOINT;

  return new SuperglueClient({
    endpoint,
    apiKey,
  });
}

export const toolDefinitions: Record<string, {
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: any, request: RequestHandlerExtra<ServerRequest, ServerNotification>, extra?: any) => Promise<any>;
}> = {
  transformData: {
    description: "Execute a transformation.",
    inputSchema: TransformOperationInputSchema,
    execute: async (args, request) => {
      const { client } = args;
      return client.transform(args);
    },
  },
  listPipelines: {
    description: "List pipelines with pagination.",
    inputSchema: ListWorkflowsInputSchema,
    execute: async (args, request) => {
      const { limit, offset, client } = args;
      const workflows = await client.listWorkflows(limit, offset);
      return workflows;
    },
  },
  getPipeline: {
    description: "Get a specific pipeline by ID.",
    inputSchema: GetWorkflowInputSchema,
    execute: async (args, request) => {
      const { id, client } = args;
      return client.getWorkflow(id);
    },
  },
  runPipeline: {
    description: "Execute a pipeline by ID.",
    inputSchema: ExecuteWorkflowInputSchema,
    execute: async (args, request) => {
      const { client } = args;
      return client.executeWorkflow(args);
    },
  },
  buildPipeline: {
    description: "Build a pipeline from an instruction.",
    inputSchema: BuildWorkflowInputSchema,
    execute: async (args, request) => {
      const { client } = args;
      return client.buildWorkflow(args.instruction, args.payload, args.systems);
    },
  },
  upsertPipeline: {
    description: "Create or update a pipeline.",
    inputSchema: UpsertWorkflowInputSchema,
    execute: async (args, request) => {
      const { id, input, client } = args;
      return client.upsertWorkflow(id, input);
    },
  },
  deletePipeline: {
    description: "Delete a pipeline by ID.",
    inputSchema: DeleteWorkflowInputSchema,
    execute: async (args, request) => {
      const { id, client } = args;
      return client.deleteWorkflow(id);
    },
  },
  // Add more tool definitions here
};

// --- MCP Server Creation Function ---
export const createMcpServer = (apiKey: string) => {
  const mcpServer = new McpServer(
    {
      name: "superglue",
      version: "0.1.0",
    }
  );
  for (const toolName of Object.keys(toolDefinitions)) {
    const tool = toolDefinitions[toolName];
    const client = createClient(apiKey);
    mcpServer.tool(
      toolName, 
      toolName,
      tool.inputSchema, 
      async (args, extra) => {
        const result = await tool.execute({...args, client}, extra);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
              mimeType: "text/plain",
            },
          ],
        } as CallToolResult;
      }
    );
  }
  return mcpServer;
}; 
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export const mcpHandler = async (req: Request, res: Response) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      }
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const token = (req as any).authInfo.token;
    const server = createMcpServer(token);

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
};

// Reusable handler for GET and DELETE requests
export const handleMcpSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

