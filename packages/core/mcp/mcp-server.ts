// Removed #!/usr/bin/env node - this is now a module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolResult,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { Integration, SuperglueClient, WorkflowResult } from '@superglue/client';
import { LogEntry } from "@superglue/shared";
import { getSDKCode } from '@superglue/shared/templates';
import { flattenAndNamespaceWorkflowCredentials } from "@superglue/shared/utils";
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { validateToken } from '../auth/auth.js';
import { logMessage } from "../utils/logs.js";
import { sessionId, telemetryClient } from "../utils/telemetry.js";

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
  responseSchema: z.record(z.unknown()).describe("JSONSchema defining the expected output structure"),
  responseMapping: z.any().describe("JSONata expression for mapping input to output"),
});

export const TransformInputRequestSchema = z.object({
  endpoint: TransformInputSchemaInternal.optional().describe("Complete transform definition (mutually exclusive with id)"),
  id: z.string().optional().describe("Reference to existing transform by ID (mutually exclusive with endpoint)"),
}).refine(data => (data.endpoint && !data.id) || (!data.endpoint && data.id), {
  message: "Either 'endpoint' or 'id' must be provided, but not both for TransformInputRequest.",
});

export const TransformOperationInputSchema = {
  input: TransformInputRequestSchema.describe("Transform definition or reference"),
  data: z.record(z.unknown()).describe("The JSON data to be transformed"),
  options: RequestOptionsSchema.optional().describe("Optional request configuration (caching, timeouts, etc.)")
};

// Workflow component schemas
export const ApiInputSchemaInternal = {
  id: z.string().describe("Unique identifier for the API endpoint"),
  urlHost: z.string().describe("Base URL/hostname for the API including protocol. For https://, use the format: https://<<hostname>>. For postgres, use the format: postgres://<<user>>:<<password>>@<<hostname>>:<<port>>"),
  urlPath: z.string().optional().describe("Path component of the URL. For postgres, use the db name as the path."),
  instruction: z.string().describe("Natural language description of what this API does"),
  queryParams: z.record(z.unknown()).optional().describe("JSON object containing URL query parameters"),
  method: HttpMethodEnum.optional().describe("HTTP method to use"),
  headers: z.record(z.unknown()).optional().describe("JSON object containing HTTP headers"),
  body: z.string().optional().describe("Request body as string"),
  documentationUrl: z.string().optional().describe("URL to API documentation"),
  authentication: AuthTypeEnum.optional().describe("Authentication method required"),
  pagination: PaginationInputSchema.optional().describe("Pagination configuration if supported"),
};

export const ExecutionStepInputSchemaInternal = {
  id: z.string().describe("Unique identifier for the execution step"),
  apiConfig: z.object(ApiInputSchemaInternal).describe("API configuration for this step"),
  integrationId: z.string().optional().describe("ID of the integration used by this step - REQUIRED for workflow execution to access credentials"),
  executionMode: z.enum(["DIRECT", "LOOP"]).optional().describe("How to execute this step (DIRECT or LOOP)"),
  loopSelector: z.any().optional().describe("JavaScript arrow function to select an array from previous step outputs. The step will execute once for each array item. Example: (sourceData) => sourceData.items"),
  loopMaxIters: z.number().int().optional().describe("Maximum number of loop iterations. Default is 1000."),
};


export const CreateIntegrationInputSchema = {
  id: z.string().describe("A unique identifier for the new integration."),
  name: z.string().optional().describe("Human-readable name for the integration."),
  urlHost: z.string().optional().describe("Base URL/hostname for the API including protocol."),
  urlPath: z.string().optional().describe("Path component of the URL. For postgres, use db name as the path."),
  documentationUrl: z.string().optional().describe("URL to the API documentation."),
  specificInstructions: z.string().optional().describe("Specific guidance on how to use this integration (e.g., rate limits, special endpoints, authentication details). Max 2000 characters."),
  documentationKeywords: z.array(z.string()).optional().describe("Keywords to help with documentation search and ranking (e.g., endpoint names, data objects, key concepts)."),
  credentials: z.record(z.string()).describe("Credentials for accessing the integration. Provide an empty object if no credentials are needed / given. Can be referenced by brackets: <<{integration_id}_{credential_name}>>. If the integration is OAuth, make sure this includes the client_id and client_secret. Additional fields can be grant_type, auth_url, token_url, scopes."),
};

export const ModifyIntegrationInputSchema = {
  id: z.string().describe("The unique identifier of the integration."),
  name: z.string().optional().describe("Human-readable name for the integration."),
  urlHost: z.string().optional().describe("Base URL/hostname for the API including protocol."),
  urlPath: z.string().optional().describe("Path component of the URL. For postgres, use db name as the path."),
  documentationUrl: z.string().optional().describe("URL to the API documentation."),
  specificInstructions: z.string().optional().describe("Specific guidance on how to use this integration (e.g., rate limits, special endpoints, authentication details). Max 2000 characters."),
  documentationKeywords: z.array(z.string()).optional().describe("Keywords to help with documentation search and ranking (e.g., endpoint names, data objects, key concepts)."),
  credentials: z.record(z.string()).optional().describe("Credentials for accessing the integration. Provide an empty object if no credentials are needed / given. Can be referenced by brackets: <<{integration_id}_{credential_name}>>. "),
};

// Workflow structure schemas (for validation)
export const WorkflowInputSchema = z.object({
  steps: z.array(z.object(ExecutionStepInputSchemaInternal)).describe("Array of execution steps that make up the workflow"),
  integrationIds: z.array(z.string()).optional().describe("Array of integration IDs used by this workflow"),
  inputSchema: z.record(z.unknown()).optional().describe("JSONSchema defining the expected input structure"),
  responseSchema: z.record(z.unknown()).optional().describe("JSONSchema defining the expected output structure"),
  finalTransform: z.any().optional().describe("JSONata expression to transform final workflow output"),
  instruction: z.string().optional().describe("Natural language description of what this workflow does"),
});

export const SaveWorkflowInputSchema = {
  id: z.string().describe("Unique identifier for the workflow to save"),
  workflow: WorkflowInputSchema.describe("Workflow configuration object without the id field. This should be a workflow object populated from the build_and_run result."),
};

// MCP Tool Input Schemas (workflow-centric)
export const BuildAndRunWorkflowInputSchema = {
  instruction: z.string().describe("Natural language instruction to build a new workflow from scratch."),
  integrationIds: z.array(z.string()).describe("Array of integration IDs to use in the workflow."),
  payload: z.record(z.unknown()).optional().describe("JSON payload for the workflow execution."),
  credentials: z.record(z.string()).optional().describe("Additional credentials that will be merged with integration credentials."),
  responseSchema: z.record(z.unknown()).optional().describe("JSONSchema for the expected output structure.")
};

export const ListWorkflowsInputSchema = {
  limit: z.number().int().optional().default(100).describe("Number of workflows to return (default: 100)"),
  offset: z.number().int().optional().default(0).describe("Offset for pagination (default: 0)"),
};

export const GetWorkflowInputSchema = {
  id: z.string().describe("The ID of the workflow to retrieve"),
};

export const ExecuteWorkflowInputSchema = {
  id: z.string().describe("The ID of the workflow to execute"),
  payload: z.record(z.unknown()).optional().describe("JSON payload to pass to the workflow"),
  credentials: z.record(z.string()).optional().describe("Additional credentials that will be merged with integration credentials."),
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
  limit: z.number().int().optional().default(100).describe("Number of integrations to return (default: 100)"),
  offset: z.number().int().optional().default(0).describe("Offset for pagination (default: 0)"),
};

// Workflow Schedule Input Schemas
export const ListWorkflowSchedulesInputSchema = {
  workflowId: z.string().describe("The ID of the workflow to get schedules for"),
};

export const CreateWorkflowScheduleInputSchema = {
  workflowId: z.string().describe("The ID of the workflow to create a schedule for"),
  cronExpression: z.string().describe("Cron expression for the schedule (e.g., '0 9 * * 1-5' for weekdays at 9 AM)"),
  timezone: z.string().describe("Timezone for the schedule (e.g., 'Europe/Berlin', 'America/New_York')"),
  enabled: z.boolean().optional().default(true).describe("Whether the schedule is enabled"),
  payload: z.record(z.unknown()).optional().describe("Optional JSON payload to pass to the workflow when executed"),
};

export const UpdateWorkflowScheduleInputSchema = {
  id: z.string().describe("The ID of the schedule to update"),
  workflowId: z.string().optional().describe("The ID of the workflow (optional, for validation)"),
  cronExpression: z.string().optional().describe("Cron expression for the schedule"),
  timezone: z.string().optional().describe("Timezone for the schedule"),
  enabled: z.boolean().optional().describe("Whether the schedule is enabled"),
  payload: z.record(z.unknown()).optional().describe("Optional JSON payload to pass to the workflow when executed"),
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
};

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

  if (!args.integrationIds || !Array.isArray(args.integrationIds) || args.integrationIds.length === 0) {
    errors.push("integrationIds array is required with at least one integration ID.");
  }

  // Validate each integration is a string
  if (args.integrationIds) {
    for (const integration of args.integrationIds) {
      if (typeof integration !== 'string') {
        errors.push("Each integration must be a string ID. Use 'superglue_find_relevant_integrations' to discover available integration IDs.");
      }
    }
  }

  if (args.credentials && typeof args.credentials !== 'object') {
    errors.push("Credentials must be an object. E.g. { 'apiKey': '1234567890' }");
  }

  return errors;
};

const validateWorkflowSaving = (args: any): { cleanedWorkflow: any; errors: string[]; } => {
  const errors: string[] = [];

  if (!args.id || typeof args.id !== 'string') {
    errors.push("Workflow ID is required for saving.");
  }

  if (!args.workflow) {
    errors.push("Workflow object is required for saving.");
    return { cleanedWorkflow: null, errors };
  }

  // Clean and prepare workflow data
  const cleaned: any = {
    ...args.workflow,
    steps: args.workflow.steps || [],
    integrationIds: args.workflow.integrationIds || [],
    finalTransform: args.workflow.finalTransform || "$",
    instruction: args.workflow.instruction || "",
    createdAt: args.workflow.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Remove null values
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === null) {
      delete cleaned[key];
    }
  });

  // Validate cleaned workflow structure
  if (!Array.isArray(cleaned.steps)) {
    errors.push("Workflow must have a steps array.");
  }

  // Collect all integration IDs from steps for validation
  const stepIntegrationIds = new Set<string>();

  // Validate each step structure
  if (cleaned.steps) {
    cleaned.steps.forEach((step: any, index: number) => {
      if (!step || typeof step !== 'object') {
        errors.push(`Step ${index} must be a valid object.`);
        return;
      }
      if (!step.id) {
        errors.push(`Step ${index} must have an id field.`);
      }
      if (!step.apiConfig || typeof step.apiConfig !== 'object') {
        errors.push(`Step ${index} must have an apiConfig object.`);
      } else {
        if (!step.apiConfig.id) {
          errors.push(`Step ${index} apiConfig must have an id field.`);
        }
        if (!step.apiConfig.instruction) {
          errors.push(`Step ${index} apiConfig must have an instruction field.`);
        }
      }

      // CRITICAL: Validate integration ID on step
      if (!step.integrationId || typeof step.integrationId !== 'string') {
        errors.push(`Step ${index} (${step.id || 'unnamed'}) must have an integrationId field - this is REQUIRED for credential access during execution.`);
      } else {
        stepIntegrationIds.add(step.integrationId);
      }
    });
  }

  // Ensure workflow integrationIds includes all step integration IDs
  const workflowIntegrationIds = new Set(cleaned.integrationIds || []);
  stepIntegrationIds.forEach(stepIntegrationId => {
    if (!workflowIntegrationIds.has(stepIntegrationId)) {
      workflowIntegrationIds.add(stepIntegrationId);
    }
  });
  cleaned.integrationIds = Array.from(workflowIntegrationIds);

  // Validate that workflow has integration IDs
  if (!cleaned.integrationIds || cleaned.integrationIds.length === 0) {
    errors.push("Workflow must have integrationIds - this is REQUIRED for credential access during execution.");
  }

  return { cleanedWorkflow: cleaned, errors };
};

const validateIntegrationCreation = (args: any) => {
  const errors: string[] = [];

  if (!args.id || typeof args.id !== 'string' || args.id.trim() === '') {
    errors.push("Integration ID is required and must be a non-empty string.");
  }

  if (args.urlHost && typeof args.urlHost !== 'string') {
    errors.push("URL host must be a string if provided.");
  }

  if (args.credentials && typeof args.credentials !== 'object') {
    errors.push("Credentials must be an object if provided.");
  }

  if (args.documentationUrl && typeof args.documentationUrl !== 'string') {
    errors.push("Documentation URL must be a string if provided.");
  }

  return errors;
};

const filterIntegrationFields = (integration: Integration) => {
  const { openApiSchema, documentation, ...filtered } = integration;
  return filtered;
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
      - Default returns 100 workflows, use limit/offset for pagination
    </important_notes>
    `,
    inputSchema: ListWorkflowsInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, limit = 100, offset = 0 }: { client: SuperglueClient; limit: number; offset: number; } = args;
      try {
        const result = await client.listWorkflows(limit, offset);
        const integrations = await client.listIntegrations(100, 0);
        const allWorkflows =
          [...result.items?.map(workflow => {
            const currentIntegrations = Array.from(new Set(
              workflow.steps?.map(step =>
                integrations.items?.find(integration => integration.id === step.integrationId)
              )
            ))?.filter(Boolean);
            const credentials = Object.keys(flattenAndNamespaceWorkflowCredentials(currentIntegrations));
            return {
              id: workflow.id,
              instruction: workflow.instruction,
              created_at: workflow.createdAt,
              updated_at: workflow.updatedAt,
              credentials_saved: credentials
            };
          }
          )];

        return {
          success: true,
          workflows: allWorkflows,
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
    </important_notes>
    `,
    inputSchema: ExecuteWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const validationErrors = validateWorkflowExecution(args);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
      }

      const { client }: { client: SuperglueClient; } = args;
      try {
        const result: WorkflowResult = await client.executeWorkflow(args);
        // TODO: do not return all results, only return some workflow info and data - LLM does not need to know step results
        return {
          ...result,
          usage_tip: "Workflow results may be truncated. Use the superglue_get_workflow_integration_code tool to integrate this workflow into your applications"
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
      - This tool returns a list of suggested integrations (inclusing IDs & credentials), and a reason for each suggestion.
      - If no instruction is provided, returns all available integrations with their IDs and the names of the credentials saved in the integration.
      - If no integrations exist, it returns an empty list. If no specific matches are found, it returns all existing integrations.
      - Use this list to make a final decision on which integrations to use for building a workflow. 
      - If relevant integrations are missing credentials, you can decide based on the user instruction whether workflow building requires new integrations or not.
    </important_notes>
    `,

    inputSchema: FindRelevantIntegrationsInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, instruction } = args;
      try {
        const result = await client.findRelevantIntegrations(instruction);
        // remove credentials so that they are not exposed to the user
        result.forEach(suggestion => {
          if (suggestion.integration) {
            delete suggestion.integration.credentials;
          }
        });

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
              suggestion: "Consider creating a new integration or use 'superglue_find_relevant_integrations' with an empty instruction to see all available integrations."
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
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
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
      - Building and testing can take up to 1 minute.
      - Use 'superglue_find_relevant_integrations' first to discover available integration IDs.
      - After successful execution, use 'superglue_save_workflow' to persist the workflow if desired.
    </important_notes>
    `,
    inputSchema: BuildAndRunWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { instruction, integrationIds, payload, credentials, responseSchema, orgId } = args;
      const client = args.client as SuperglueClient;
      try {
        const validationErrors = validateWorkflowBuilding(args);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        const builtWorkflow = await client.buildWorkflow({
          instruction,
          integrationIds,
          payload,
          responseSchema,
          save: false
        });

        logMessage('info', `MCP_UPDATE:build_and_run:WORKFLOW_BUILD_SUCCESS:${JSON.stringify(builtWorkflow)}`, { orgId: orgId });

        const result = await client.executeWorkflow({
          workflow: builtWorkflow,
          payload: payload,
          credentials: credentials,
          options: {
            testMode: true
          }
        });

        if (!result.success) {
          return {
            note: "Execution failed. Refine your instruction or integrations and try again.",
            ...result
          };
        }

        // Return successful run result with the workflow ready for saving
        return {
          note: "Workflow executed successfully! Use 'superglue_save_workflow' to persist this workflow.",
          success: result.success,
          error: result.error,
          integrationIds: integrationIds,
          config: result.config,
          id: result.config?.id || builtWorkflow.id, // Use workflow ID, not execution ID so that LLM uses this ID for saving the workflow
          data: result.data,
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "The build and run process failed. Please check your instructions and integrations. Have you added credentials and documentation?"
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
      - Take the workflow data from build_and_run result and create a proper save request.
      - DO NOT set any fields to null - omit optional fields entirely if you don't have values.
      - CRITICAL: Each step MUST have an integrationId field and workflow MUST have integrationIds array - these are REQUIRED for credential access during execution.
    </important_notes>
    `,
    inputSchema: SaveWorkflowInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, id, integrations } = args;
      let { workflow, orgId } = args;

      try {
        // Basic validation first
        if (!id || typeof id !== 'string') {
          throw new Error("Workflow ID is required for saving.");
        }

        if (!workflow) {
          throw new Error("Workflow object is required for saving.");
        }

        // Validate and clean the workflow data
        const { cleanedWorkflow, errors } = validateWorkflowSaving({ id, workflow });

        if (errors.length > 0) {
          logMessage('warn', `Validation warnings: ${errors.join(', ')}`, { orgId: orgId });
        }

        if (!cleanedWorkflow || typeof cleanedWorkflow !== 'object') {
          throw new Error("Workflow must be a valid object after cleaning");
        }

        workflow = cleanedWorkflow;

        const savedWorkflow = await client.upsertWorkflow(id, workflow);

        return {
          note: `Workflow ${savedWorkflow.id} has been saved successfully.`,
          success: true,
          saved_workflow: savedWorkflow,
          usage_tip: `Use the ${savedWorkflow.id} in to create a scheduled execution of this workflow using 'superglue_create_workflow_schedule'.`,
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to save workflow. Check that the workflow object is valid and all required integrations exist.",
          debug_info: {
            original_workflow: args.workflow,
            cleaned_workflow: workflow
          }
        };
      }
    }
  },
  superglue_create_integration: {
    description: `
    <use_case>
      Creates and immediately saves a new integration. Integrations are building blocks for workflows and contain the credentials for accessing the API.
      For the integration to be usable, you MUST store the credentials in the credentials field and use placeholder references in the urlHost and urlPath.
    </use_case>

    <important_notes>
      - Most APIs require authentication (API keys, tokens, etc.). Always ask the user for credentials if needed.
      - The credentials object is REQUIRED. Always store any credentials the user gives you as credentials (even dummy ones or ones embedded in a connection string) in the credentials field. Use placeholder references in the format: <<{integration_id}_{credential_name}>> to reference them.
      - if no credentials are given, ask the user for them. If no credentials are needed or the user explicitly says no, provide an empty object.
      - Always split information clearly: urlHost (without secrets), urlPath, credentials (with secrets), etc.
      - For OAuth integrations, the user should provide the client_id and client_secret. Saved credentials should include: client_id, client_secret, auth_url, token_url, scopes. Supported grant types (flows): authorization_code (default, for user-based authentication), client_credentials (for service accounts and non-user-based authentication).
      - Providing a documentationUrl will trigger asynchronous API documentation processing.
      - When users mention API constraints (rate limits, special endpoints, auth requirements, etc.), capture them in 'specificInstructions' to guide workflow building.
      - Include relevant keywords in 'documentationKeywords' to improve documentation search (e.g., endpoint names, data objects, key concepts mentioned in conversation).
    </important_notes>
    `,
    inputSchema: CreateIntegrationInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, orgId, ...integrationInput } = args;

      try {
        const validationErrors = validateIntegrationCreation(integrationInput);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        const result = await client.upsertIntegration(integrationInput.id, integrationInput, 'CREATE');
        return {
          note: result.documentationPending
            ? "Integration created. Documentation is being processed in the background."
            : "Integration created successfully.",
          success: true,
          integration: filterIntegrationFields(result)
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
  superglue_modify_integration: {
    description: `
    <use_case>
      Modifies an existing integration identified by its id. Integrations are building blocks for workflows and contain the credentials for accessing the API.
      Provide only the id and the fields you want to change. Fields not included will remain unchanged.
    </use_case>

    <important_notes>
      - Most APIs require authentication (API keys, tokens, etc.). Always ask the user for credentials if needed.
      - Always split information clearly: urlHost (without secrets), urlPath, credentials (with secrets), etc.
      - When users mention API constraints (rate limits, special endpoints, auth requirements, etc.), capture them in 'specificInstructions' to guide workflow building.
      - Providing a documentationUrl will trigger asynchronous API documentation processing.
      - If you provide documentationUrl, include relevant keywords in 'documentationKeywords' to improve documentation search (e.g., endpoint names, data objects, key concepts mentioned in conversation).
    </important_notes>
    `,
    inputSchema: ModifyIntegrationInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, orgId, ...integrationInput } = args;

      try {
        const validationErrors = validateIntegrationCreation(integrationInput);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        const result = await client.upsertIntegration(integrationInput.id, integrationInput, 'UPDATE');
        const note = result.documentationPending ? "Integration modified. Documentation is being processed in the background." : "Integration modified successfully."
        
        return {
          note: note,
          success: true,
          integration: filterIntegrationFields(result)
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Failed to modify integration. Validate all integration inputs and try again."
        };
      }
    },
  },

  superglue_list_workflow_schedules: {
    description: `
    <use_case>
      Lists all schedules for a specific workflow. Use this to see existing schedules, their cron expressions, and when the next run is scheduled.
    </use_case>

    <important_notes>
      - Returns all schedules configured for the specified workflow
      - Shows schedule details including cron expression, timezone, enabled status, and run times
      - Use schedule IDs with superglue_update_workflow_schedule to modify existing schedules
    </important_notes>
    `,
    inputSchema: ListWorkflowSchedulesInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, workflowId } = args;

      try {
        const schedules = await client.listWorkflowSchedules(workflowId);
        
        return {
          success: true,
          schedules: schedules.map(schedule => ({
            id: schedule.id,
            workflowId: schedule.workflowId,
            cronExpression: schedule.cronExpression,
            timezone: schedule.timezone,
            enabled: schedule.enabled,
            payload: schedule.payload,
            lastRunAt: schedule.lastRunAt,
            nextRunAt: schedule.nextRunAt,
            createdAt: schedule.createdAt,
            updatedAt: schedule.updatedAt
          })),
          total: schedules.length,
          usage_tip: "Use schedule IDs with superglue_update_workflow_schedule to modify existing schedules"
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

  superglue_create_workflow_schedule: {
    description: `
    <use_case>
      Creates a new scheduled execution for a workflow. Schedules allow workflows to run automatically on a server at specified times using cron expressions.
    </use_case>

    <important_notes>
      - Requires a valid workflow ID and cron expression
      - Cron expressions use 5 fields: minute (0-59), hour (0-23), day of month (1-31), month (1-12), day of week (0-6)
      - Use * for any value, / for intervals, and , for lists. Example: '0 9 * * 1-5' runs weekdays at 9 AM
      - Timezone should be a valid IANA timezone (e.g., 'Europe/Berlin', 'America/New_York')
      - Optional payload will be passed to the workflow when it runs
      - If available, use the workflow ID from the save_workflow result to create a schedule
    </important_notes>
    `,
    inputSchema: CreateWorkflowScheduleInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, workflowId, cronExpression, timezone, enabled = true, payload } = args;

      try {
        const schedule = await client.upsertWorkflowSchedule({
          workflowId,
          cronExpression,
          timezone,
          enabled,
          payload
        });

        return {
          success: true,
          schedule: {
            id: schedule.id,
            workflowId: schedule.workflowId,
            cronExpression: schedule.cronExpression,
            timezone: schedule.timezone,
            enabled: schedule.enabled,
            payload: schedule.payload,
            lastRunAt: schedule.lastRunAt,
            nextRunAt: schedule.nextRunAt,
            createdAt: schedule.createdAt,
            updatedAt: schedule.updatedAt
          },
          note: "Schedule created successfully. The workflow will now run according to the specified schedule."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the workflow ID exists, the cron expression is valid, and the timezone is correct"
        };
      }
    },
  },

  superglue_update_workflow_schedule: {
    description: `
    <use_case>
      Updates an existing workflow schedule. Use this to modify cron expressions, timezones, enable/disable schedules, or change payloads.
    </use_case>

    <important_notes>
      - Requires the schedule ID (use superglue_list_workflow_schedules to find schedule IDs)
      - Only provide the fields you want to change - other fields will remain unchanged
      - Cron expressions use 5 fields: minute (0-59), hour (0-23), day of month (1-31), month (1-12), day of week (0-6)
      - Timezone should be a valid IANA timezone (e.g., 'Europe/Berlin', 'America/New_York')
    </important_notes>
    `,
    inputSchema: UpdateWorkflowScheduleInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string; }, request) => {
      const { client, id, workflowId, cronExpression, timezone, enabled, payload } = args;

      try {
        // Build update object with only provided fields
        const updateData: any = { id };
        if (workflowId !== undefined) updateData.workflowId = workflowId;
        if (cronExpression !== undefined) updateData.cronExpression = cronExpression;
        if (timezone !== undefined) updateData.timezone = timezone;
        if (enabled !== undefined) updateData.enabled = enabled;
        if (payload !== undefined) updateData.payload = payload;

        const schedule = await client.upsertWorkflowSchedule(updateData);

        return {
          success: true,
          schedule: {
            id: schedule.id,
            workflowId: schedule.workflowId,
            cronExpression: schedule.cronExpression,
            timezone: schedule.timezone,
            enabled: schedule.enabled,
            payload: schedule.payload,
            lastRunAt: schedule.lastRunAt,
            nextRunAt: schedule.nextRunAt,
            createdAt: schedule.createdAt,
            updatedAt: schedule.updatedAt
          },
          note: "Schedule updated successfully."
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the schedule ID exists and all provided values are valid"
        };
      }
    },
  }
};

// Modified server creation function
export const createMcpServer = async (apiKey: string) => {
  const mcpServer = new McpServer({
    name: "superglue",
    version: "0.1.0",
    description: `
superglue: Universal API Integration Platform

AGENT WORKFLOW:
1. DISCOVER: Use 'superglue_find_relevant_integrations' to find available integrations for your task.
2. [Optional] CREATE: Use 'superglue_create_integration' to create a new integration. ALWAYS ask user permission before creating a new integration.
2. BUILD & TEST: Use 'superglue_build_and_run' with instruction and integrations. Iterate until successful. If no credentials are saved with the integration, add them to the build_and_run request.
3. SAVE (Optional): Ask user if they want to save the workflow, then use 'superglue_save_workflow' with the workflow data.
4. EXECUTE: Use 'superglue_execute_workflow' for saved workflows.
5. SCHEDULE (Optional): Use 'superglue_create_workflow_schedule' to scheduled executions of saved workflows to run automatically.

WORKFLOW SCHEDULING:
- Use 'superglue_list_workflow_schedules' to see existing scheduled executions for a workflow
- Use 'superglue_create_workflow_schedule' to create new scheduled executions of saved workflows using cron expressions
- Use 'superglue_update_workflow_schedule' to modify existing schedules (enable/disable, change timing, change timezone, change payload)

BEST PRACTICES:
- Always start with 'superglue_find_relevant_integrations' for discovery.
- Create integrations and store credentials in integrations using 'superglue_create_integration'. Ask users for credentials before creating a new integration.
- When creating integrations, capture any user-provided guidance about rate limits, special endpoints, or usage requirements in the 'specificInstructions' field.
- Generic integrations (e.g., "postgres", "webhook", "api") can be reused for multiple services. Never create a new integration without asking the user first, and use existing integrations if possible.
- If you get authentication errors during build_and_run despite using integrations with saved credentials, the integrations may have placeholder values instead of actual credentials. Check with the user if they provided the correct credentials.
- Ask user before saving workflows.
- When saving workflows, NEVER set fields to null - omit optional fields if no value available.
- Copy actual values from build_and_run results, don't assume fields are empty.
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

  // Register static tools only
  for (const toolName of Object.keys(toolDefinitions)) {
    const tool = toolDefinitions[toolName];
    mcpServer.tool(
      toolName,
      tool.description,
      tool.inputSchema,
      async (args, extra) => {
        const result = await tool.execute({ ...args, client, orgId }, extra);
        logMessage('info', `${toolName} executed via MCP`, { orgId: orgId });
        telemetryClient?.capture({
          distinctId: orgId || sessionId,
          event: "mcp_" + toolName,
          properties: {
            toolName: toolName,
            orgId: orgId,
            args: {
              instruction: args?.instruction,
              integrationIds: args?.integrationIds
            }
          }
        });
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

export const transports: { [sessionId: string]: StreamableHTTPServerTransport; } = {};

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