// Removed #!/usr/bin/env node - this is now a module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SelfHealingMode, SuperglueClient, ToolResult } from "@superglue/shared";
import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { validateToken } from "../auth/auth.js";
import { logMessage } from "../utils/logs.js";
import { sessionId, telemetryClient } from "../utils/telemetry.js";
import { validateWorkflowExecutionArgs } from "./mcp-server-utils.js";

// MCP Tool Input Schemas (tool-centric)
export const FindRelevantToolsInputSchema = z.object({
  searchTerms: z.string().describe("The natural language search query to find relevant tools"),
});

export const ExecuteToolInputSchema = z.object({
  id: z.string().describe("The ID of the tool to execute"),
  payload: z.record(z.unknown()).optional().describe("JSON payload to pass to the tool"),
});

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

// Update execute functions with validation
export const toolDefinitions: Record<string, any> = {
  superglue_execute_tool: {
    description: `
    <use_case>
      Executes an existing superglue tool by its ID.
    </use_case>

    <important_notes>
      - This tool is for running existing, saved superglue tools.
      - The superglue tool ID must exist, otherwise the tool will fail to execute.
      - The tool will return the result of the execution.
    </important_notes>
    `,
    inputSchema: ExecuteToolInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string }, request) => {
      const validationErrors = validateWorkflowExecutionArgs(args);

      if (validationErrors.length > 0) {
        return {
          success: false,
          error: validationErrors.join("\n"),
        };
      }

      try {
        const result: ToolResult & { data?: any } = await args.client.executeWorkflow({
          id: args.id,
          payload: args.payload,
          options: { selfHealing: SelfHealingMode.DISABLED },
          verbose: false,
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Unknown error",
          };
        }

        const dataStr = JSON.stringify(result.data);
        const limit = 20000;

        if (dataStr.length <= limit) {
          return {
            success: true,
            data: result.data,
          };
        }

        return {
          success: true,
          data: `[TRUNCATED: Result exceeded ${limit} characters (original size: ${dataStr.length} chars). Showing first ${limit} characters]\n\n${dataStr.slice(0, limit)}`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the tool ID exists and all required credentials are provided",
        };
      }
    },
  },
  superglue_find_relevant_tools: {
    description: `
    <use_case>
      Finds relevant superglue tools based on natural language search terms.
    </use_case>

    <important_notes>
      - This tool is for finding relevant superglue tools based on natural language search terms.
      - The tool will return a list of superglue tool IDs that match the search terms.
      - The tool will return a list of all superglue tool IDs if no search terms are provided, or if there are no matches for the search terms.
      - Use '*' as a wildcard to find all tools.
    </important_notes>
    `,
    inputSchema: FindRelevantToolsInputSchema,
    execute: async (args: any & { client: SuperglueClient; orgId: string }, request) => {
      try {
        const result = await args.client.findRelevantTools(args.searchTerms);
        return {
          success: true,
          tools: result,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          suggestion: "Check that the query is valid",
        };
      }
    },
  },
};

export const createMcpServer = async (apiKey: string) => {
  const mcpServer = new McpServer(
    {
      name: "superglue",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
        tools: {},
      },
    },
  );

  const client = createClient(apiKey);

  // Get org ID from the API key
  const authResult = await validateToken(apiKey);
  const orgId = authResult.orgId;

  // Register tools individually for proper type inference
  mcpServer.registerTool(
    "execute_tool",
    {
      description: toolDefinitions.superglue_execute_tool.description,
      inputSchema: ExecuteToolInputSchema,
    },
    async (args, extra) => {
      const result = await toolDefinitions.superglue_execute_tool.execute(
        { ...args, client, orgId },
        extra,
      );
      logMessage("debug", "superglue_execute_tool executed via MCP", { orgId: orgId });
      telemetryClient?.capture({
        distinctId: orgId || sessionId,
        event: "mcp_superglue_execute_tool",
        properties: {
          toolName: "superglue_execute_tool",
          orgId: orgId,
        },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "find_relevant_tools",
    {
      description: toolDefinitions.superglue_find_relevant_tools.description,
      inputSchema: FindRelevantToolsInputSchema,
    },
    async (args, extra) => {
      const result = await toolDefinitions.superglue_find_relevant_tools.execute(
        { ...args, client, orgId },
        extra,
      );
      logMessage("debug", "superglue_find_relevant_tools executed via MCP", { orgId: orgId });
      telemetryClient?.capture({
        distinctId: orgId || sessionId,
        event: "mcp_superglue_find_relevant_tools",
        properties: {
          toolName: "superglue_find_relevant_tools",
          orgId: orgId,
        },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  return mcpServer;
};

export const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export const mcpHandler = async (req: Request, res: Response) => {
  // Check for existing session ID
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
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
      },
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
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
};
