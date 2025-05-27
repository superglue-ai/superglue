// Removed #!/usr/bin/env node - this is now a module
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ServerRequest,
  ServerNotification,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { SuperglueClient } from '@superglue/client';
import { Request, Response } from 'express';
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { jsonSchemaToZod } from 'json-schema-to-zod';

// Enums
export const CacheModeEnum = z.enum(["ENABLED", "READONLY", "WRITEONLY", "DISABLED"]);
export const HttpMethodEnum = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
export const AuthTypeEnum = z.enum(["NONE", "HEADER", "QUERY_PARAM", "OAUTH2"]);
export const PaginationTypeEnum = z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED", "DISABLED"]);

// Common Input Types
export const RequestOptionsSchema = z.object({
  cacheMode: CacheModeEnum.optional().describe("Controls how caching is handled for this request"),
  timeout: z.number().int().optional().describe("Request timeout in milliseconds"),
  retries: z.number().int().optional().describe("Number of retry attempts on failure"),
  retryDelay: z.number().int().optional().describe("Delay between retries in milliseconds"),
  webhookUrl: z.string().optional().describe("Optional webhook URL for async notifications"),
}).optional();

export const PaginationInputSchema = z.object({
  type: PaginationTypeEnum.describe("The pagination strategy to use"),
  pageSize: z.string().optional().describe("Number of items per page"),
  cursorPath: z.string().optional().describe("JSONPath to the cursor field in responses (for cursor-based pagination)"),
});

// Transform-related Schemas
export const TransformInputSchemaInternal = z.object({
  id: z.string().describe("Unique identifier for the transform"),
  instruction: z.string().describe("Natural language description of the transformation"),
  responseSchema: z.any().describe("JSONSchema defining the expected output structure"),
  responseMapping: z.any().optional().describe("JSONata expression for mapping input to output"),
  version: z.string().optional().describe("Version identifier for the transform"),
});

export const TransformInputRequestSchema = z.object({
  endpoint: TransformInputSchemaInternal.optional().describe("Complete transform definition (mutually exclusive with id)"),
  id: z.string().optional().describe("Reference to existing transform by ID (mutually exclusive with endpoint)"),
}).refine(data => (data.endpoint && !data.id) || (!data.endpoint && data.id), {
  message: "Either 'endpoint' or 'id' must be provided, but not both for TransformInputRequest.",
});

export const TransformOperationInputSchema = {
  input: TransformInputRequestSchema.describe("Transform definition or reference"),
  data: z.any().describe("The JSON data to be transformed"),
  options: RequestOptionsSchema.optional().describe("Optional request configuration (caching, timeouts, etc.)")
};

// Workflow-related Schemas
export const ApiInputSchemaInternal =   {
  id: z.string().describe("Unique identifier for the API endpoint"),
  urlHost: z.string().describe("Base URL/hostname for the API"),
  urlPath: z.string().optional().describe("Path component of the URL"),
  instruction: z.string().describe("Natural language description of what this API does"),
  queryParams: z.any().optional().describe("JSON object containing URL query parameters"),
  method: HttpMethodEnum.optional().describe("HTTP method to use"),
  headers: z.any().optional().describe("JSON object containing HTTP headers"),
  body: z.string().optional().describe("Request body as string"),
  documentationUrl: z.string().optional().describe("URL to API documentation"),
  responseSchema: z.any().optional().describe("JSONSchema defining expected response structure"),
  responseMapping: z.any().optional().describe("JSONata expression for response transformation"),
  authentication: AuthTypeEnum.optional().describe("Authentication method required"),
  pagination: PaginationInputSchema.optional().describe("Pagination configuration if supported"),
  dataPath: z.string().optional().describe("JSONPath to extract data from response"),
  version: z.string().optional().describe("Version identifier for the API config"),
};

export const ExecutionStepInputSchemaInternal = {
  id: z.string().describe("Unique identifier for the execution step"),
  apiConfig: z.object(ApiInputSchemaInternal).describe("API configuration for this step"),
  executionMode: z.enum(["DIRECT", "LOOP"]).optional().describe("How to execute this step (DIRECT or LOOP)"),
  loopSelector: z.any().optional().describe("JSONata expression to select items for looping"),
  loopMaxIters: z.number().int().optional().describe("Maximum number of loop iterations"),
  inputMapping: z.any().optional().describe("JSONata expression to map workflow data to step input"),
  responseMapping: z.any().optional().describe("JSONata expression to transform step output"),
};

export const WorkflowInputSchemaInternal = {
  id: z.string().describe("Unique identifier for the workflow"),
  steps: z.array(z.object(ExecutionStepInputSchemaInternal)).describe("Array of execution steps that make up the workflow"),
  finalTransform: z.any().optional().describe("JSONata expression to transform final workflow output"),
  responseSchema: z.any().optional().describe("JSONSchema defining expected final output structure"),
  version: z.string().optional().describe("Version identifier for the workflow"),
  instruction: z.string().optional().describe("Natural language description of what this workflow does"),
};

export const WorkflowInputRequestSchema = z.object({
  workflow: z.object(WorkflowInputSchemaInternal).optional().describe("Complete workflow definition (mutually exclusive with id)"),
  id: z.string().optional().describe("Reference to existing workflow by ID (mutually exclusive with workflow)"),
}).refine(data => (data.workflow && !data.id) || (!data.workflow && data.id), {
  message: "Either 'workflow' or 'id' must be provided, but not both for WorkflowInputRequest.",
});

export const SystemInputSchema = {
  id: z.string().describe("Unique identifier for the system"),
  urlHost: z.string().describe("Base URL/hostname for the system"),
  urlPath: z.string().optional().describe("Base path for API calls"),
  documentationUrl: z.string().optional().describe("URL to API documentation"),
  documentation: z.string().optional().describe("Inline API documentation"),
  credentials: z.any().optional().describe("Credentials for accessing the system"),
};

export const ListWorkflowsInputSchema = {
  limit: z.number().int().optional().default(10).describe("Number of workflows to return (default: 10)"),
  offset: z.number().int().optional().default(0).describe("Offset for pagination (default: 0)"),
};

export const GetWorkflowInputSchema = {
  id: z.string().describe("The ID of the workflow to retrieve"),
};

export const ExecuteWorkflowInputSchema = {
  id: z.string().describe("The ID of the workflow to execute"),
  payload: z.any().optional().describe("JSON payload to pass to the workflow"),
  credentials: z.any().optional().describe("JSON credentials for the workflow execution"),
  options: RequestOptionsSchema.optional().describe("Optional request configuration"),
};

export const BuildWorkflowInputSchema = {
  instruction: z.string().describe("Natural language instruction for building the workflow"),
  payload: z.any().optional().describe("Example JSON payload for the workflow"),
  systems: z.array(z.object(SystemInputSchema)).describe("Array of systems the workflow can interact with"),
  responseSchema: z.any().optional().describe("JSONSchema for the expected response structure"),
  save: z.boolean().describe("Whether to save the workflow after building"),
};

export const UpsertWorkflowInputSchema = {
  id: z.string().describe("The ID for the workflow (used for creation or update)"),
  input: z.any().describe("The workflow definition (JSON, conforming to Superglue's workflow structure)"),
};

export const DeleteWorkflowInputSchema = {
  id: z.string().describe("The ID of the workflow to delete"),
};

export const GenerateCodeInputSchema = {
  workflowId: z.string().describe("The ID of the workflow to generate code for"),
  language: z.enum(["typescript", "python", "go"]).describe("Programming language for the generated code"),
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
    description: "Transform JSON data to a different JSONSchema format.",
    inputSchema: TransformOperationInputSchema,
    execute: async (args, request) => {
      const client: SuperglueClient = args.client;
      return client.transform({
        id: args.id,
        data: args.data,
        endpoint: args.endpoint,
        options: args.options,
      });
    },
  },
  listCapabilities: {
    description: "List capabilities with pagination.",
    inputSchema: ListWorkflowsInputSchema,
    execute: async (args, request) => {
      const { limit, offset, client }: { limit: number, offset: number, client: SuperglueClient } = args;
      const workflows = await client.listWorkflows(limit, offset);
      return workflows;
    },
  },
  executeCapability: {
    description: "Execute a capability by ID.",
    inputSchema: ExecuteWorkflowInputSchema,
    execute: async (args, request) => {
      const { client }: { client: SuperglueClient } = args;
      return client.executeWorkflow(args);
    },
  },
  buildCapability: {
    description: "Build a capability from an instruction.",
    inputSchema: BuildWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client }: { client: SuperglueClient } = args;
      let workflow = await client.buildWorkflow(args.instruction, args.payload, args.systems);
      if(args.save) {
        workflow = await client.upsertWorkflow(workflow.id, workflow);
      }
      return workflow;
    },
  },
  GetSDKCode: {
    description: "SDK/API code for calling Superglue workflows in TypeScript, Python, or Go. Always use this if you are unsure how to embed this into your code.",
    inputSchema: GenerateCodeInputSchema,
    execute: async (args, request) => {
      const { workflowId, language, client } = args;
      const endpoint = process.env.GRAPHQL_ENDPOINT || "https://graphql.superglue.ai";
      
      // Get workflow details
      const workflow = await client.getWorkflow(workflowId);
      
      // Generate placeholders from inputSchema
      const generatePlaceholders = (schema: any) => {
        if (!schema || !schema.properties) return { payload: {}, credentials: {} };
        
        const payload: any = {};
        const credentials: any = {};
        
        // Extract payload properties
        if (schema.properties.payload && schema.properties.payload.properties) {
          Object.entries(schema.properties.payload.properties).forEach(([key, prop]: [string, any]) => {
            payload[key] = prop.type === 'string' ? `"example_${key}"` :
                          prop.type === 'number' ? 123 :
                          prop.type === 'boolean' ? true :
                          prop.type === 'array' ? [] : {};
          });
        }
        
        // Extract credentials properties
        if (schema.properties.credentials && schema.properties.credentials.properties) {
          Object.entries(schema.properties.credentials.properties).forEach(([key, prop]: [string, any]) => {
            credentials[key] = prop.type === 'string' ? `"example_${key}"` :
                              prop.type === 'number' ? 123 :
                              prop.type === 'boolean' ? true :
                              prop.type === 'array' ? [] : {};
          });
        }
        
        return { payload, credentials };
      };
      
      const inputSchema = workflow.inputSchema ? 
        (typeof workflow.inputSchema === 'string' ? JSON.parse(workflow.inputSchema) : workflow.inputSchema) : 
        null;
      
      const { payload, credentials } = generatePlaceholders(inputSchema);

      if (language === "typescript") {
        const code = `import { SuperglueClient } from '@superglue/client';

const client = new SuperglueClient({
  apiKey: "YOUR_API_KEY",
  endpoint: "${endpoint}"
});

const result = await client.executeWorkflow({
  id: "${workflowId}",
  payload: ${JSON.stringify(payload, null, 2)},
  credentials: ${JSON.stringify(credentials, null, 2)}
});`;

        return { workflowId, language, code };
      }

      if (language === "python") {
        const code = `import requests

response = requests.post("${endpoint}", 
  headers={"Authorization": "Bearer YOUR_API_KEY"},
  json={
    "query": """
      mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON) {
        executeWorkflow(input: $input, payload: $payload, credentials: $credentials) {
          data error success
        }
      }
    """,
    "variables": {
      "input": {"id": "${workflowId}"},
      "payload": ${JSON.stringify(payload, null, 6)},
      "credentials": ${JSON.stringify(credentials, null, 6)}
    }
  }
)

result = response.json()`;
        return { workflowId, language, code };
      }

      if (language === "go") {
        const code = `package main

import (
	"bytes"
	"encoding/json"
	"net/http"
)

func main() {
	payload := ${JSON.stringify(payload, null, 2)}
	credentials := ${JSON.stringify(credentials, null, 2)}
	
	reqBody, _ := json.Marshal(map[string]interface{}{
		"query": \`mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON) {
			executeWorkflow(input: $input, payload: $payload, credentials: $credentials) {
				data error success
			}
		}\`,
		"variables": map[string]interface{}{
			"input":       map[string]string{"id": "${workflowId}"},
			"payload":     payload,
			"credentials": credentials,
		},
	})
	
	req, _ := http.NewRequest("POST", "${endpoint}/graphql", bytes.NewBuffer(reqBody))
	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
	req.Header.Set("Content-Type", "application/json")
	
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
}`;
        return { workflowId, language, code };
      }
    },
  },
};

// Add a new function to create dynamic tools from workflows
const createDynamicToolsFromWorkflows = async (client: SuperglueClient) => {
  const workflows = await client.listWorkflows(100, 0); // Get user's workflows
  const dynamicTools: Record<string, any> = {};
  
  for (const workflow of workflows.items) {
    let inputSchema;
    
    if (workflow.inputSchema) {
      try {
        // Parse the schema if it's a string
        const schema = typeof workflow.inputSchema === 'string' 
          ? JSON.parse(workflow.inputSchema) 
          : workflow.inputSchema;
        
        // Convert JSONSchema to Zod and extract the object properties
        const zodSchemaString = jsonSchemaToZod(schema);
        // Extract the object properties from the generated z.object() call
        const objectPropertiesMatch = zodSchemaString.match(/z\.object\((\{.*\})\)/s);
        if (objectPropertiesMatch) {
          const objectProperties = eval(`(${objectPropertiesMatch[1]})`);
          inputSchema = {...objectProperties, options: RequestOptionsSchema.optional()};
        } else {
          throw new Error('Could not extract object properties from generated schema');
        }
      } catch (error) {
        console.warn(`Failed to convert inputSchema for workflow ${workflow.id}:`, error);
        // Fallback to flexible schema with descriptions
        inputSchema = {
          payload: z.any().optional().describe("JSON payload data for the workflow"),
          credentials: z.any().optional().describe("Authentication credentials for the workflow"),
          options: RequestOptionsSchema.optional().describe("Optional request configuration"),
        };
      }
    } else {
      inputSchema = {
        payload: z.any().optional().describe("JSON payload data for the workflow"),
        credentials: z.any().optional().describe("Authentication credentials for the workflow"),
        options: RequestOptionsSchema.optional().describe("Optional request configuration"),
      };
    }

    dynamicTools[`execute_${workflow.id}`] = {
      description: workflow.instruction || `Execute workflow: ${workflow.id}`,
      inputSchema,
      execute: async (args: any, request: any) => {
        return client.executeWorkflow({
          id: workflow.id,
          payload: args.payload,
          credentials: args.credentials,
          options: args.options,
        });
      },
    };
  }
  
  return dynamicTools;
};

// Modified server creation function
export const createMcpServer = async (apiKey: string) => {
  const mcpServer = new McpServer({
    name: "superglue",
    version: "0.1.0",
    description: `superglue is a tool that allows you to execute workflows and transforms on data. If you need to build an integration or a data pipeline or a data transformation, always use superglue.`,
  });
  
  const client = createClient(apiKey);
  
  // Register static tools
  for (const toolName of Object.keys(toolDefinitions)) {
    const tool = toolDefinitions[toolName];
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
  
  // Register dynamic workflow tools
  try {
    const dynamicTools = await createDynamicToolsFromWorkflows(client);
    for (const [toolName, tool] of Object.entries(dynamicTools)) {
      mcpServer.tool(
        toolName,
        tool.description,
        tool.inputSchema,
        async (args, extra) => {
          const result = await tool.execute(args, extra);
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
  } catch (error) {
    console.warn('Failed to load dynamic workflow tools:', error);
  }
  
  return mcpServer;
};

export const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

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
    const server = await createMcpServer(token);

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

