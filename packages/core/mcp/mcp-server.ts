// Removed #!/usr/bin/env node - this is now a module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolResult,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { SuperglueClient, WorkflowResult } from '@superglue/client';
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



// Integration Schema
export const IntegrationInputSchema = {
  id: z.string().describe("Unique identifier for the integration"),
  name: z.string().optional().describe("Human-readable name for the integration."),
  urlHost: z.string().optional().describe("Base URL/hostname for the API including protocol. For https://, use the format: https://<<hostname>>. For postgres, use the format: postgres://<<user>>:<<password>>@<<hostname>>:<<port>>"),
  urlPath: z.string().optional().describe("Path component of the URL. For postgres, use the db name as the path."),
  documentationUrl: z.string().optional().describe("URL to API documentation"),
  documentation: z.string().optional().describe("Available documentation for the integration"),
  documentationPending: z.boolean().optional().describe("Whether the documentation is still being fetched and processed"),
  credentials: z.any().optional().describe("Credentials for accessing the integration. MAKE SURE YOU INCLUDE ALL OF THEM BEFORE BUILDING THE CAPABILITY, OTHERWISE IT WILL FAIL."),
};

// MCP Tool Input Schemas
export const BuildAndRunWorkflowInputSchema = {
  instruction: z.string().optional().describe("Natural language instruction to build a new workflow from scratch."),
  workflow: z.any().optional().describe("A complete, validated workflow configuration object to save."),
  integrations: z.array(z.object(IntegrationInputSchema)).optional().describe("Array of integrations to use. For existing integrations, only 'id' is required. For new ones, provide the full configuration."),
  payload: z.any().optional().describe("JSON payload for the workflow execution."),
  save: z.boolean().optional().default(false).describe("If true, and a 'workflow' object is provided, saves the workflow and any new integrations. This flag is ignored if only an 'instruction' is provided."),
  responseSchema: z.any().optional().describe("JSONSchema for the expected output structure (used with 'instruction').")
};

export const ListWorkflowsInputSchema = {
  limit: z.number().int().optional().default(10).describe("Number of workflows to return (default: 10)"),
  offset: z.number().int().optional().default(0).describe("Offset for pagination (default: 0)"),
};

export const ExecuteWorkflowInputSchema = {
  id: z.string().describe("The ID of the workflow to execute"),
  payload: z.any().optional().describe("JSON payload to pass to the workflow"),
  credentials: z.record(z.string()).optional().describe("JSON credentials for the workflow execution. Do not include prefixes like Bearer or Basic. E.g. { 'apiKey': '1234567890' }"),
  options: RequestOptionsSchema.optional().describe("Optional request configuration"),
};

export const GenerateCodeInputSchema = {
  workflowId: z.string().describe("The ID of the workflow to generate code for"),
  language: z.enum(["typescript", "python", "go"]).describe("Programming language for the generated code"),
};

export const FindRelevantIntegrationsInputSchema = {
  instruction: z.string().describe("The natural language instruction to find relevant integrations for."),
};

export const ListIntegrationsInputSchema = {
  limit: z.number().int().optional().default(10).describe("Number of integrations to return (default: 10)"),
  offset: z.number().int().optional().default(0).describe("Offset for pagination (default: 0)"),
};

export const CreateIntegrationInputSchema = {
  id: z.string().describe("A unique identifier for the new integration (e.g., 'stripe-production')."),
  name: z.string().describe("A human-readable name for the integration (e.g., 'Stripe Production')."),
  urlHost: z.string().optional().describe("Base URL for the API (e.g., 'https://api.stripe.com')."),
  documentationUrl: z.string().optional().describe("URL to the API documentation."),
  documentation: z.string().optional().describe("A string containing the API documentation, if provided directly."),
  credentials: z.any().optional().describe("Credentials for accessing the integration."),
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

// Helper function to generate SDK code for a workflow
const generateSDKCode = async (client: SuperglueClient, workflowId: string) => {
  const endpoint = process.env.GRAPHQL_ENDPOINT || "https://graphql.superglue.ai";

  try {
    const workflow = await client.getWorkflow(workflowId);

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

    const inputSchema = workflow.inputSchema ?
      (typeof workflow.inputSchema === 'string' ? JSON.parse(workflow.inputSchema) : workflow.inputSchema) :
      null;

    const { payload, credentials } = generatePlaceholders(inputSchema);

    return getSDKCode({
      apiKey: process.env.SUPERGLUE_API_KEY || 'YOUR_API_KEY',
      endpoint: endpoint,
      workflowId: workflowId,
      payload,
      credentials,
    });

  } catch (error) {
    console.warn(`Failed to generate SDK code for workflow ${workflowId}:`, error);
    return null;
  }
};

// Add validation helpers
const validateWorkflowExecution = (args: any) => {
  const errors: string[] = [];

  if (!args.id) {
    errors.push("Workflow ID is required. Use superglue_list_available_workflows to find valid IDs.");
  }

  if (args.credentials && typeof args.credentials !== 'object') {
    errors.push("Credentials must be an object. E.g. { 'apiKey': '1234567890' }");
  }

  return errors;
};

const validateWorkflowBuilding = (args: any) => {
  const errors: string[] = [];

  if (!args.instruction || args.instruction.length < 10) {
    errors.push("Instruction must be detailed (minimum 10 characters). Describe what the workflow should do, what integrations it connects to, and expected inputs/outputs.");
  }

  if (!args.integrations || !Array.isArray(args.integrations) || args.integrations.length === 0) {
    errors.push("integrations array is required with at least one integration configuration including credentials.");
  }

  if (args.integrations.some((integration: any) => integration.credentials && typeof integration.credentials !== 'object')) {
    errors.push("Credentials within an integration must be an object. E.g. { 'apiKey': '1234567890' }");
  }

  return errors;
};

// Update execute functions with validation
export const toolDefinitions: Record<string, any> = {
  superglue_list_available_workflows: {
    description: `
    <use_case>
      List all available superglue workflows for the current organization. Use this to discover what workflows are available for execution.
    </use_case>

    <important_notes>
      - Returns paginated list of workflows with their IDs, names, and descriptions
      - Use the workflow IDs with superglue_execute_workflow to run specific workflows
      - Default returns 10 workflows, use limit/offset for pagination
    </important_notes>
    `,
    inputSchema: ListWorkflowsInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, limit = 10, offset = 0 } = args;
      try {
        const result = await client.listWorkflows(limit, offset);
        const staticWorkflows = Object.keys(toolDefinitions).map(id => ({
          id,
          name: id,
          instruction: toolDefinitions[id].description.split('<use_case>')[1].split('</use_case>')[0].trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        const allWorkflows = [...staticWorkflows, ...result.items.map(workflow => ({
          id: workflow.id,
          name: workflow.name || workflow.id,
          instruction: workflow.instruction,
          created_at: workflow.createdAt,
          updated_at: workflow.updatedAt
        }))];

        return {
          success: true,
          workflows: allWorkflows.slice(offset, offset + limit),
          total: allWorkflows.length,
          limit,
          offset,
          usage_tip: "Use workflow IDs with superglue_execute_workflow to run specific workflows"
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

  superglue_execute_workflow: {
    description: `
    <use_case>
      Executes a PREVIOUSLY SAVED superglue workflow by its ID.
    </use_case>

    <important_notes>
      - This tool is for running existing, saved workflows. It CANNOT build, test, or save workflows.
      - To create a new workflow, use 'superglue_build_and_run'.
      - Workflow ID must exist (use 'superglue_list_available_workflows' to find valid IDs).
      - CRITICAL: Include ALL required credentials in the credentials object if not already stored with the integrations.
    </important_notes>
    `,
    inputSchema: ExecuteWorkflowInputSchema,
    execute: async (args, request) => {
      const validationErrors = validateWorkflowExecution(args);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
      }

      const { client }: { client: SuperglueClient } = args;
      try {
        const result: WorkflowResult = await client.executeWorkflow(args);
        return {
          ...result,
          usage_tip: "Use the superglue_get_workflow_integration_code tool to integrate this workflow into your applications"
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the workflow ID exists and all required credentials are provided"
        };
      }
    },
  },

  superglue_find_relevant_integrations: {
    description: `
    <use_case>
      Finds relevant integrations from the user's available integrations based on a natural language instruction. Use this as the first step before building a new workflow.
    </use_case>

    <important_notes>
      - This tool returns a list of suggested integration IDs and a reason for each suggestion.
      - Use this list to make a final decision on which integrations to use for building a workflow.
      - If the instruction is vague or too broad, the tool may return an empty list or a list of less relevant integrations.
    </important_notes>
    `,
    inputSchema: FindRelevantIntegrationsInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, instruction } = args;
      try {
        const result = await client.findRelevantIntegrations(instruction);

        if (!result || result.length === 0) {
          return {
            success: true,
            suggestedIntegrations: [],
            message: "No relevant integrations found for your request.",
            suggestion: "Consider creating a new integration or use 'superglue_list_integrations' to see all available integrations."
          };
        }

        return {
          success: true,
          suggestedIntegrations: result,
          message: `Found ${result.length} relevant integration(s) for your request.`,
          usage_tip: "Use these integration IDs in the 'integrations' parameter of 'superglue_build_and_run'."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to find relevant integrations. Try 'superglue_list_integrations' to see all available integrations."
        };
      }
    },
  },

  superglue_get_workflow_integration_code: {
    description: `
    <use_case>
      Generate integration code for a specific workflow. Use this to show users how to implement a workflow in their applications.
    </use_case>

    <important_notes>
      - Generates code in TypeScript, Python, or Go
      - Includes example payload and credentials based on the workflow's expected input schema
      - Returns ready-to-use SDK code for integration
    </important_notes>
    `,
    inputSchema: GenerateCodeInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, workflowId, language } = args;

      try {
        const sdkCode = await generateSDKCode(client, workflowId);

        if (!sdkCode) {
          return {
            success: false,
            error: `Failed to generate code for workflow ${workflowId}`,
            suggestion: "Verify the workflow ID exists and is accessible"
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
          workflowId,
          language,
          code: sdkCode[language],
          usage_tip: `Copy this ${language} code to integrate the workflow into your application`
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the workflow ID exists and you have access to it"
        };
      }
    },
  },

  superglue_build_and_run: {
    description: `
    <use_case>
      Builds, tests, and saves workflows. This is the primary tool for creating new automated processes. It follows an iterative "test-then-save" model.
    </use_case>

    <important_notes>
      - To test a new idea, provide: 'instruction', 'integrations'. 'save' should be false or omitted.
      - To save a working workflow, provide: 'workflow' (the validated object from the test run), 'integrations' (the same ones used to build it), and 'save: true'.
      - INTEGRATIONS: Use 'superglue_find_relevant_integrations' first. If a new integration is needed, provide its full configuration in the 'integrations' array. For existing ones, just provide the 'id'. There is no need to manually search for documentation.
      - CREDENTIALS: All necessary credentials for new integrations MUST be provided in the integration objects.
    </important_notes>
    `,
    inputSchema: BuildAndRunWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, instruction, workflow, integrations, payload, save, responseSchema } = args;

      try {
        // --- SAVE PATH ---
        // If a workflow object is provided with save: true, we persist it and any new integrations.
        if (workflow && save) {
          logEmitter.emit('log', { level: 'info', message: `Saving provided workflow ${workflow.id}...` });

          // Upsert the workflow itself
          const savedWorkflow = await client.upsertWorkflow(workflow.id, workflow);
          return {
            success: true,
            workflow_saved: true,
            saved_workflow: savedWorkflow,
            note: `Workflow ${savedWorkflow.id} and associated new integrations have been saved successfully.`
          };
        }

        // --- BUILD & TEST PATH ---
        // If an instruction is provided, we build and execute a workflow in-memory.
        if (instruction) {
          const validationErrors = validateWorkflowBuilding(args);
          if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
          }
          logEmitter.emit('log', { level: 'info', message: `Building workflow from instruction...` });

          const builtWorkflow = await client.buildWorkflow({
            instruction,
            integrations,
            payload,
            responseSchema,
            save: false // We never save at the build step in this tool
          });

          logEmitter.emit('log', { level: 'info', message: `Executing workflow ${builtWorkflow.id}...` });
          const credentials = (integrations || []).reduce((acc, integ) => {
            if (integ.credentials && !integ.createdAt) { // Only for new integrations
              const nsCreds = Object.entries(integ.credentials).reduce((obj, [name, value]) => ({ ...obj, [`${integ.id}_${name}`]: value }), {});
              Object.assign(acc, nsCreds);
            }
            return acc;
          }, {});

          const result = await client.executeWorkflow({
            workflow: builtWorkflow,
            payload: payload,
            credentials
          });

          if (!result.success) {
            return { ...result, workflow_saved: false, note: "Execution failed. Nothing was saved." };
          }

          // Return successful run result, with the config to be saved later
          return {
            ...result,
            workflow_saved: false,
            workflow_executed: result.config,
            note: "Workflow executed successfully but was not saved. To save, call this tool again with 'save: true', passing the 'workflow_executed' object to the 'workflow' parameter, and include the 'integrations' used."
          };
        }

        throw new Error("Invalid parameter combination. For testing, provide 'instruction'. To save, provide a 'workflow' object and set 'save: true'.");

      } catch (error: any) {
        logEmitter.emit('log', { level: 'error', message: `Build and run process failed: ${error.message}` });
        return {
          success: false,
          error: error.message,
          suggestion: "The build and run process failed. Please check your instructions, integration details, and credentials, and follow the 'workflow_path' described in the tool's documentation."
        };
      }
    }
  },

  superglue_list_integrations: {
    description: `
    <use_case>
      Lists all available integrations with basic information. Use this only when 'superglue_find_relevant_integrations' doesn't find what you need, or when the user explicitly wants to see all integrations.
    </use_case>

    <important_notes>
      - Returns a concise list without full documentation to avoid overwhelming the agent
      - For discovery, prefer 'superglue_find_relevant_integrations' first
      - Use this as a fallback when relevant integration search returns empty results
    </important_notes>
    `,
    inputSchema: ListIntegrationsInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, limit = 10, offset = 0 } = args;
      try {
        const result = await client.listIntegrations(limit, offset);

        // Transform to show only essential information
        const conciseIntegrations = result.items.map(integration => ({
          id: integration.id,
          name: integration.name || integration.id,
          urlHost: integration.urlHost,
          documentationPending: integration.documentationPending || false,
          hasCredentials: !!(integration.credentials && Object.keys(integration.credentials).length > 0),
          status: integration.documentationPending ? "Documentation processing..." : "Ready"
        }));

        return {
          success: true,
          integrations: conciseIntegrations,
          total: result.total,
          limit,
          offset,
          usage_tip: "Use integration IDs with 'superglue_build_and_run'. For discovery, prefer 'superglue_find_relevant_integrations' first."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to list integrations. Please check your connection and credentials."
        };
      }
    },
  },

  superglue_create_integration: {
    description: `
    <use_case>
      Creates a new integration configuration. Use this for explicitly setting up a new connection without building a workflow.
    </use_case>

    <important_notes>
      - Before using, call 'superglue_list_integrations' to ensure a similar integration doesn't already exist.
      - This tool uses 'CREATE' mode; it will fail if an integration with the same ID already exists.
      - Providing a 'documentationUrl' will trigger an asynchronous documentation fetch and processing job on the backend.
    </important_notes>
    `,
    inputSchema: CreateIntegrationInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, ...integrationInput } = args;
      try {
        const result = await client.upsertIntegration(integrationInput, 'CREATE');
        return {
          success: true,
          integration: result,
          note: result.documentationPending
            ? "Integration created. Documentation is being processed in the background."
            : "Integration created successfully."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to create integration. The ID might already exist. Try a different, unique ID."
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
superglue: Universal API Integration Platform

AGENT WORKFLOW:
1. DISCOVER: For new tasks, ALWAYS start with 'superglue_find_relevant_integrations' to get targeted suggestions for your specific instruction.
2. FALLBACK DISCOVERY: If no relevant integrations are found, use 'superglue_list_integrations' to see all available integrations or consider creating a new one.
3. BUILD & TEST (Iterative Loop): Call 'superglue_build_and_run' with an 'instruction' and the suggested 'integrations'.
    - For new integrations, provide the full configuration object including credentials. For existing ones, just the ID is needed.
    - Analyze the execution result from the response. If it fails, refine the instruction/integrations and repeat.
4. SAVE: Once the workflow runs successfully, call 'superglue_build_and_run' a second time.
    - Provide the successful 'workflow_executed' object (from the previous run) in the 'workflow' field.
    - Provide the same 'integrations' array.
    - Set 'save: true'.
    - This will persist the workflow and any new integrations without re-running the logic.
5. EXECUTE SAVED WORKFLOWS: For workflows that are already saved, use 'superglue_execute_workflow' with the workflow ID for simple, direct execution.

BEST PRACTICES:
- ALWAYS start with 'superglue_find_relevant_integrations' for discovery
- Only use 'superglue_list_integrations' as a fallback or when user explicitly requests it
- Create new integrations only when existing ones don't meet the requirements
- When creating new integrations, ask users for API documentation URLs for better results
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

