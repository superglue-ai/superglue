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
  instruction: z.string().describe("Natural language instruction to build a new workflow from scratch."),
  integrations: z.array(z.object(IntegrationInputSchema)).describe("Array of integrations to use. For existing integrations, only 'id' is required. For new ones, provide the full configuration."),
  payload: z.any().optional().describe("JSON payload for the workflow execution."),
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
  instruction: z.string().optional().describe("The natural language instruction to find relevant integrations for. If not provided, returns all available integrations."),
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

export const SaveWorkflowInputSchema = {
  workflow: z.any().describe("A complete, validated workflow configuration object to save."),
  integrations: z.array(z.object(IntegrationInputSchema)).optional().describe("Array of integrations used by the workflow. For existing integrations, only 'id' is required. For new ones, provide the full configuration."),
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

const validateWorkflowSaving = (args: any) => {
  const errors: string[] = [];

  if (!args.workflow) {
    errors.push("Workflow object is required for saving.");
  }

  if (args.workflow && !args.workflow.id) {
    errors.push("Workflow must have an ID to be saved.");
  }

  if (args.integrations && !Array.isArray(args.integrations)) {
    errors.push("integrations must be an array.");
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
      - If no instruction is provided, returns all available integrations with their IDs.
      - If an instruction is provided but no integrations exist, returns an empty list.
      - If an instruction is provided but no specific matches are found, returns all available integrations as fallback options.
      - This tool returns a list of suggested integration IDs and a reason for each suggestion.
      - Use this list to make a final decision on which integrations to use for building a workflow.
    </important_notes>
    `,
    inputSchema: FindRelevantIntegrationsInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, instruction } = args;
      try {
        const result = await client.findRelevantIntegrations(instruction);

        if (!result || result.length === 0) {
          if (!instruction || instruction.trim() === '') {
            return {
              success: true,
              suggestedIntegrations: [],
              message: "No integrations found in your account.",
              suggestion: "Create a new integration using 'superglue_create_integration' to get started."
            };
          } else {
            return {
              success: true,
              suggestedIntegrations: [],
              message: "No integrations found for your request.",
              suggestion: "Consider creating a new integration or use 'superglue_list_integrations' to see all available integrations."
            };
          }
        }

        const messageText = !instruction || instruction.trim() === ''
          ? `Found ${result.length} available integration(s) in your account.`
          : `Found ${result.length} relevant integration(s) for your request.`;

        return {
          success: true,
          suggestedIntegrations: result,
          message: messageText,
          usage_tip: "Use these integration IDs in the 'integrations' parameter of 'superglue_build_and_run' to build a workflow."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to find relevant integrations. Try creating a new integration using 'superglue_create_integration'."
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
      Builds and executes workflows. This is the primary tool for creating and iteratively testing built workflows. 
    </use_case>

    <important_notes>
      - This tool only builds and tests workflows - it does NOT save them.
      - Note that the building and testing process can take up to 1 minute. Tell the user this.
      - Provide 'instruction' and 'integrations' to build and test a workflow.
      - INTEGRATIONS: Use 'superglue_find_relevant_integrations' first. If a new integration is needed, provide its full configuration in the 'integrations' array. For existing ones, just provide the 'id'.
      - CREDENTIALS: All necessary credentials for new integrations MUST be provided in the integration objects. Can optionally take in additional credentials as a payload.
      - After successful execution, use 'superglue_save_workflow' to persist the workflow if desired.
    </important_notes>
    `,
    inputSchema: BuildAndRunWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, instruction, integrations, payload, responseSchema } = args;

      try {
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
          save: false
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
          return {
            ...result,
            note: "Execution failed. Refine your instruction or integrations and try again."
          };
        }

        // Return successful run result with the workflow ready for saving
        return {
          ...result,
          workflow_ready_to_save: result.config,
          integrations_used: integrations,
          note: "Workflow executed successfully! Use 'superglue_save_workflow' to persist this workflow if desired."
        };

      } catch (error: any) {
        logEmitter.emit('log', { level: 'error', message: `Build and run process failed: ${error.message}` });
        return {
          success: false,
          error: error.message,
          suggestion: "The build and run process failed. Please check your instructions, integration details, and credentials."
        };
      }
    }
  },

  superglue_save_workflow: {
    description: `
    <use_case>
      Saves a previously built and tested workflow. Use this after successful execution of 'superglue_build_and_run'.
    </use_case>

    <important_notes>
      - This tool persists workflows that have been built and tested using 'superglue_build_and_run'.
      - Provide the 'workflow_ready_to_save' object from a successful build_and_run execution.
      - Include the same 'integrations' array that was used to build the workflow.
      - Any new integrations will be created/upserted during the save process.
    </important_notes>
    `,
    inputSchema: SaveWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, workflow, integrations } = args;

      try {
        const validationErrors = validateWorkflowSaving(args);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        logEmitter.emit('log', { level: 'info', message: `Saving workflow ${workflow.id}...` });

        // Upsert any new integrations first (those with credentials but no createdAt)
        if (integrations && Array.isArray(integrations)) {
          for (const integration of integrations) {
            if (integration.credentials && !integration.createdAt) {
              logEmitter.emit('log', { level: 'info', message: `Creating new integration ${integration.id}...` });
              await client.upsertIntegration(integration.id, integration, 'CREATE');
            }
          }
        }

        // Save the workflow
        const savedWorkflow = await client.upsertWorkflow(workflow.id, workflow);

        return {
          success: true,
          saved_workflow: savedWorkflow,
          note: `Workflow ${savedWorkflow.id} has been saved successfully.`
        };

      } catch (error: any) {
        logEmitter.emit('log', { level: 'error', message: `Workflow save failed: ${error.message}` });
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to save workflow. Check that the workflow object is valid and all required integrations exist."
        };
      }
    }
  },
  superglue_create_integration: {
    description: `
    <use_case>
      Creates and immediately saves a new integration. Integrations are building blocks for workflows.
    </use_case>

    <important_notes>
      - Providing a 'documentationUrl' will trigger an asynchronous documentation fetch and processing job on the backend. This takes up to 1 minute, but can run in the background.
      - Providing documentation directly in the chat will override the 'documentationUrl' field and lead to that documentation being used instead.
      - Workflow building will automatically use the documentation and the credentials saved in the integrations passed to the workflow builder.
      - Tell the user that the integration will be created but it will not be available for workflow building until the documentation has finished processing, which can take up to 1 minute.
    </important_notes>
    `,
    inputSchema: CreateIntegrationInputSchema,
    execute: async (args: any & { client: SuperglueClient }, request) => {
      const { client, ...integrationInput } = args;
      try {
        const result = await client.upsertIntegration(integrationInput.id, integrationInput, 'CREATE');
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
          suggestion: "Failed to create integration. Validate all integration inputs and try again."
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
2. BUILD & TEST (Iterative Loop): Call 'superglue_build_and_run' with an 'instruction' and the suggested 'integrations'.
    - For new integrations, provide the full configuration object including credentials. For existing ones, just the ID is needed. Can optionally take in additional credentials as a payload.
    - Analyze the execution result from the response. If it fails, refine the instruction/integrations and repeat.
    - Continue until you get a successful execution with the desired results.
3. SAVE (Optional): Once the workflow runs successfully and meets requirements, ASK THE USER if they want to save the workflow.
    - If yes, call 'superglue_save_workflow' with the 'workflow_ready_to_save' object and 'integrations_used' array from the successful build_and_run response.
    - This will persist the workflow and create any new integrations.
4. EXECUTE SAVED WORKFLOWS: For workflows that are already saved, use 'superglue_execute_workflow' with the workflow ID for simple, direct execution.

BEST PRACTICES:
- ALWAYS start with 'superglue_find_relevant_integrations' for discovery.
- Create new integrations only when existing ones don't meet the requirements or when the user explicitly requests it.
- When creating new integrations, ask users for API documentation URLs for better results. Also ask them to provide required credentials, or to use the superglue user interface to enter them.
- Always ask the user before saving workflows - don't assume they want to save every successful test.
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

