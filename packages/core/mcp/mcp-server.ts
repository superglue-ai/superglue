// Removed #!/usr/bin/env node - this is now a module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolResult,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { SuperglueClient, Workflow, WorkflowResult, Integration } from '@superglue/client';
import { LogEntry } from "@superglue/shared";
import { getSDKCode } from '@superglue/shared/templates';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { validateToken } from '../auth/auth.js';
import { logEmitter } from '../utils/logs.js';

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

// Tool-related Schemas (previously Workflow-related)
export const ApiInputSchemaInternal = {
  id: z.string().describe("Unique identifier for the API endpoint"),
  urlHost: z.string().describe("Base URL/hostname for the API including protocol. For https://, use the format: https://<<hostname>>. For postgres, use the format: postgres://<<user>>:<<password>>@<<hostname>>:<<port>>"),
  urlPath: z.string().optional().describe("Path component of the URL. For postgres, use the db name as the path."),
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
  inputMapping: z.any().optional().describe("JSONata expression to map tool data to step input"),
  responseMapping: z.any().optional().describe("JSONata expression to transform step output"),
};

export const ToolInputSchemaInternal = {
  id: z.string().describe("Unique identifier for the tool"),
  steps: z.array(z.object(ExecutionStepInputSchemaInternal)).describe("Array of execution steps that make up the tool"),
  finalTransform: z.any().optional().describe("JSONata expression to transform final tool output"),
  responseSchema: z.any().optional().describe("JSONSchema defining expected final output structure"),
  version: z.string().optional().describe("Version identifier for the tool"),
  instruction: z.string().optional().describe("Natural language description of what this tool does"),
};

export const ToolInputRequestSchema = z.object({
  tool: z.object(ToolInputSchemaInternal).optional().describe("Complete tool definition (mutually exclusive with id)"),
  id: z.string().optional().describe("Reference to existing tool by ID (mutually exclusive with tool)"),
}).refine(data => (data.tool && !data.id) || (!data.tool && data.id), {
  message: "Either 'tool' or 'id' must be provided, but not both for ToolInputRequest.",
});

export const IntegrationInputSchema = {
  id: z.string().describe("Unique identifier for the integration"),
  urlHost: z.string().optional().describe("Base URL/hostname for the API including protocol. For https://, use the format: https://<<hostname>>. For postgres, use the format: postgres://<<user>>:<<password>>@<<hostname>>:<<port>>"),
  urlPath: z.string().optional().describe("Path component of the URL. For postgres, use the db name as the path."),
  documentationUrl: z.string().optional().describe("URL to API documentation"),
  documentation: z.string().optional().describe("Available documentation for the integration"),
  documentationPending: z.boolean().optional().describe("Whether the documentation is still being fetched and processed"),
  credentials: z.any().optional().describe("Credentials for accessing the integration. MAKE SURE YOU INCLUDE ALL OF THEM BEFORE BUILDING THE CAPABILITY, OTHERWISE IT WILL FAIL."),
};

export const ListToolsInputSchema = {
  limit: z.number().int().optional().default(10).describe("Number of tools to return (default: 10)"),
  offset: z.number().int().optional().default(0).describe("Offset for pagination (default: 0)"),
};

export const GetToolInputSchema = {
  id: z.string().describe("The ID of the tool to retrieve"),
};

export const ExecuteToolInputSchema = {
  id: z.string().describe("The ID of the tool to execute"),
  payload: z.any().optional().describe("JSON payload to pass to the tool"),
  credentials: z.record(z.string()).optional().describe("JSON credentials for the tool execution. Do not include prefixes like Bearer or Basic. E.g. { 'apiKey': '1234567890' }"),
  options: RequestOptionsSchema.optional().describe("Optional request configuration"),
};

export const BuildToolInputSchema = {
  instruction: z.string().describe("Natural language instruction for building the tool"),
  payload: z.any().optional().describe("Example JSON payload for the tool. This should be data needed to fulfill the request (e.g. a list of ids to loop over), not settings or filters. If not strictly needed, leave this empty."),
  integrations: z.array(z.object(IntegrationInputSchema)).describe("Array of integrations the tool can interact with"),
  responseSchema: z.any().optional().describe("JSONSchema for the expected response structure"),
};

export const UpsertToolInputSchema = {
  id: z.string().describe("The ID for the tool (used for creation or update)"),
  input: z.any().describe("The tool definition (JSON, conforming to Superglue's tool structure)"),
};

export const DeleteToolInputSchema = {
  id: z.string().describe("The ID of the tool to delete"),
};

export const GenerateCodeInputSchema = {
  toolId: z.string().describe("The ID of the tool to generate code for"),
  language: z.enum(["typescript", "python", "go"]).describe("Programming language for the generated code"),
};

// Add this schema near the other input schemas around line 150
export const RunInstructionInputSchema = {
  instruction: z.string().describe("Natural language instruction for the one-time execution"),
  payload: z.any().optional().describe("Example JSON payload for the execution. This should be data needed to fulfill the request (e.g. a list of ids to loop over), not settings or filters. If not strictly needed, leave this empty."),
  integrations: z.array(z.object(IntegrationInputSchema)).describe("Array of integrations the execution can interact with"),
  responseSchema: z.any().optional().describe("JSONSchema for the expected response structure"),
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

// Helper function to generate SDK code for a tool
const generateSDKCode = async (client: SuperglueClient, toolId: string) => {
  const endpoint = process.env.GRAPHQL_ENDPOINT || "https://graphql.superglue.ai";

  try {
    const tool = await client.getWorkflow(toolId);

    const generatePlaceholders = (schema: any) => {
      if (!schema || !schema.properties) return { payload: {}, credentials: {} };

      const payload: any = {};
      const credentials: any = {};

      if (schema.properties.payload && schema.properties.payload.properties) {
        Object.entries(schema.properties.payload.properties).forEach(([key, prop]: [string, any]) => {
          payload[key] = prop.type === 'string' ? `"example_${key}"` :
            prop.type === 'number' ? 123 :
              prop.type === 'boolean' ? true :
                prop.type === 'array' ? [] : {};
        });
      }

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

    const inputSchema = tool.inputSchema ?
      (typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema) :
      null;

    const { payload, credentials } = generatePlaceholders(inputSchema);

    return getSDKCode({
      apiKey: process.env.SUPERGLUE_API_KEY || 'YOUR_API_KEY',
      endpoint: endpoint,
      workflowId: toolId,
      payload,
      credentials,
    });

  } catch (error) {
    console.warn(`Failed to generate SDK code for tool ${toolId}:`, error);
    return null;
  }
};

// Add validation helpers
const validateToolExecution = (args: any) => {
  const errors: string[] = [];

  if (!args.id) {
    errors.push("Tool ID is required. Use superglue_list_available_tools to find valid IDs.");
  }

  if (args.credentials && typeof args.credentials !== 'object') {
    errors.push("Credentials must be an object. E.g. { 'apiKey': '1234567890' }");
  }

  return errors;
};

const validateToolBuilding = (args: any) => {
  const errors: string[] = [];

  if (!args.instruction || args.instruction.length < 10) {
    errors.push("Instruction must be detailed (minimum 10 characters). Describe what the tool should do, what integrations it connects to, and expected inputs/outputs.");
  }

  if (!args.integrations || !Array.isArray(args.integrations) || args.integrations.length === 0) {
    errors.push("integrations array is required with at least one integration configuration including credentials.");
  }

  if (args.integrations.some(integration => integration.credentials && typeof integration.credentials !== 'object')) {
    errors.push("Credentials must be an object. E.g. { 'apiKey': '1234567890' }");
  }

  return errors;
};

// Update execute functions with validation
export const toolDefinitions: Record<string, any> = {
  superglue_list_available_tools: {
    description: `
    <use_case>
      List all available Superglue tools for the current organization. Use this to discover what tools are available for execution.
    </use_case>

    <important_notes>
      - Returns paginated list of tools with their IDs, names, and descriptions
      - Use the tool IDs with superglue_execute_tool to run specific tools
      - Default returns 10 tools, use limit/offset for pagination
    </important_notes>
    `,
    inputSchema: ListToolsInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, limit = 10, offset = 0 } = args;
      try {
        const result = await client.listWorkflows(limit, offset);
        return {
          success: true,
          tools: result.items.map(tool => ({
            id: tool.id,
            name: tool.name || tool.id,
            instruction: tool.instruction,
            created_at: tool.createdAt,
            updated_at: tool.updatedAt
          })),
          total: result.total,
          limit,
          offset,
          usage_tip: "Use tool IDs with superglue_execute_tool to run specific tools"
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check your API credentials and permissions"
        };
      }
    },
  },

  superglue_execute_tool: {
    description: `
    <use_case>
      Execute a specific Superglue tool by ID. Use this when you know the exact tool needed for a task.
    </use_case>

    <important_notes>
      - Tool ID must exist (use superglue_list_available_tools to find valid IDs)
      - CRITICAL: Include ALL required credentials in the credentials object
      - Payload structure must match the tool's expected input schema
      - Returns execution results + SDK code for integration
    </important_notes>
    `,
    inputSchema: ExecuteToolInputSchema,
    execute: async (args, request) => {
      const validationErrors = validateToolExecution(args);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
      }

      const { client }: { client: SuperglueClient } = args;
      try {
        const result: WorkflowResult = await client.executeWorkflow(args);
        if (!result.success) {
          return {
            success: false,
            error: result.error || "Unknown error",
            suggestion: "Check that the tool ID exists and all required credentials are provided"
          };
        }
        await client.upsertWorkflow(result.config.id, result.config);
        return {
          ...result,
          usage_tip: "Use the superglue_get_integration_code tool to integrate this tool into your applications"
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the tool ID exists and all required credentials are provided"
        };
      }
    },
  },

  superglue_build_new_tool: {
    description: `
    <use_case>
      Build a new integration tool from natural language instructions. Use when existing tools don't meet requirements.
    </use_case>

    <important_notes>
      - Gather ALL integration credentials BEFORE building (API keys, tokens, documentation url if the integration is less known)
      - Provide detailed, specific instructions
      - superglue handles pagination for you, so you don't need to worry about it
      - Tool building may take 30-60 seconds
    </important_notes>
    `,
    inputSchema: BuildToolInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const validationErrors = validateToolBuilding(args);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
      }

      const { client }: { client: SuperglueClient } = args;
      try {
        let tool = await client.buildWorkflow({
          instruction: args.instruction,
          payload: args.payload || {},
          integrations: args.integrations,
          responseSchema: args.responseSchema || {}
        });

        return {
          success: true,
          ...tool,
          next_steps: `Tool saved successfully. Use with execute_${tool.id} to run it or generate code with superglue_get_integration_code.`
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Ensure all integration credentials are provided and instruction is detailed"
        };
      }
    },
  },

  superglue_get_integration_code: {
    description: `
    <use_case>
      Generate integration code for a specific tool. Use this to show users how to implement a tool in their applications.
    </use_case>

    <important_notes>
      - Generates code in TypeScript, Python, or Go
      - Includes example payload and credentials based on the tool's input schema
      - Returns ready-to-use SDK code for integration
    </important_notes>
    `,
    inputSchema: GenerateCodeInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, toolId, language } = args;

      try {
        const sdkCode = await generateSDKCode(client, toolId);

        if (!sdkCode) {
          return {
            success: false,
            error: `Failed to generate code for tool ${toolId}`,
            suggestion: "Verify the tool ID exists and is accessible"
          };
        }

        if (!['typescript', 'python', 'go'].includes(language)) {
          return {
            success: false,
            error: `Language '${language}' is not supported. Supported languages are: typescript, python, go.`,
            suggestion: "Choose a supported language."
          };
        }

        return {
          success: true,
          toolId,
          language,
          code: sdkCode[language],
          usage_tip: `Copy this ${language} code to integrate the tool into your application`
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the tool ID exists and you have access to it"
        };
      }
    },
  },

  superglue_run_instruction: {
    description: `
    <use_case>
      Execute an instruction once without saving it as a persistent tool. Use for ad-hoc tasks that don't need to be reused.
    </use_case>

    <important_notes>
      - Builds and executes immediately without persistence
      - Requires ALL integration credentials upfront  
      - Faster than build + execute workflow for one-time tasks
      - Results are returned but tool definition is discarded
    </important_notes>
    `,
    inputSchema: RunInstructionInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const validationErrors = validateToolBuilding(args);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
      }

      const { client }: { client: SuperglueClient } = args;
      try {
        // Build the tool temporarily
        const workflow = await client.buildWorkflow({
          instruction: args.instruction,
          payload: args.payload || {},
          integrations: args.integrations,
          responseSchema: args.responseSchema || {},
          save: false
        });
        const credentials = Object.values(args.integrations as Integration[]).reduce((acc, sys) => {
          return { ...acc, ...Object.entries(sys.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }), {}) };
        }, {});

        // Execute it immediately
        const result = await client.executeWorkflow({
          workflow: workflow,
          payload: args.payload,
          credentials: credentials
        });

        // Note: We don't call upsertWorkflow here, so it's not persisted

        return {
          success: result?.success || false,
          data: result?.data,
          error: result?.error,
          workflow_executed: result?.config || workflow,
          note: "Tool was executed once and not saved. Use superglue_build_new_tool if you want to save it for reuse."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Ensure all integration credentials are provided and instruction is detailed"
        };
      }
    },
  },
};

// Modified server creation function
export const createMcpServer = async (apiKey: string) => {
  const mcpServer = new McpServer({
    name: "superglue",
    version: "0.1.0",
    description: `
Superglue: Universal API Integration Platform

AGENT WORKFLOW:
1. DISCOVER: Use superglue_list_available_tools to see what's available
2. EXECUTE: Use superglue_execute_tool for existing tools OR superglue_run_instruction for one-time tasks
3. INTEGRATE: Use superglue_get_integration_code to show users how to implement

CAPABILITIES:
- Execute existing tools by ID
- Run one-time instructions without persistence
- Generate production-ready code in TypeScript, Python, Go
- Transform data between different formats and schemas

BEST PRACTICES:
- Always gather ALL credentials before executing tools
- If the request fails or the system is less known, suggest the user to provide a documentation url
- Use superglue_list_available_tools to discover available tools
- Validate tool IDs exist before execution
- Provide integration code when users ask "how do I use this?"
    `,
  },
    {
      capabilities: {
        logging: {},
        tools: {}
      }
    });

  const client = createClient(apiKey);

  // Get org ID from the API key
  const authResult = await validateToken(apiKey);
  const orgId = authResult.orgId;

  // Subscribe to server logs and forward to MCP client
  const logHandler = (logEntry: LogEntry) => {
    // Only send logs that match this user's org ID
    if (logEntry.orgId === orgId || (!logEntry.orgId && !orgId)) {
      mcpServer.server.sendLoggingMessage({
        level: String(logEntry.level).toLowerCase() as any,
        data: logEntry.message,
        logger: "superglue-server"
      });
    }
  };

  // Start listening to log events
  logEmitter.on('log', logHandler);

  // Clean up log subscription when server closes
  mcpServer.server.onerror = (error) => {
    logEmitter.removeListener('log', logHandler);
  };
  mcpServer.server.onclose = () => {
    logEmitter.removeListener('log', logHandler);
  };

  // Register static tools only
  for (const toolName of Object.keys(toolDefinitions)) {
    const tool = toolDefinitions[toolName];
    mcpServer.tool(
      toolName,
      tool.description,
      tool.inputSchema,
      async (args, extra) => {
        const result = await tool.execute({ ...args, client }, extra);

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

