// Removed #!/usr/bin/env node - this is now a module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { RequestSource, SuperglueClient, Tool } from "@superglue/shared";
import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { validateToken } from "../auth/auth.js";
import { logMessage } from "../utils/logs.js";
import { sessionId, telemetryClient } from "../utils/telemetry.js";
import { truncateToolExecutionResult } from "./mcp-server-utils.js";

// MCP Tool Input Schemas
export const AuthenticateInputSchema = z.object({
  systemId: z
    .string()
    .optional()
    .describe("Optional system ID to reauthenticate a specific system"),
});

interface McpAuthContext {
  orgId: string;
  isRestricted?: boolean;
}

/**
 * Converts a JSON Schema to a Zod schema for MCP tool registration.
 * Handles common JSON Schema types and nested objects.
 */
function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return z.any();
  }

  const type = schema.type;
  const description = schema.description;

  let zodSchema: z.ZodTypeAny;

  // Handle union types like ["string", "null"]
  if (Array.isArray(type)) {
    const nonNullTypes = type.filter((t) => t !== "null");
    if (nonNullTypes.length === 1) {
      // Single type + null -> make it nullable
      zodSchema = jsonSchemaToZod({ ...schema, type: nonNullTypes[0] }).nullable();
    } else {
      // Multiple types -> use any
      zodSchema = z.any();
    }
  } else {
    switch (type) {
      case "string":
        zodSchema = z.string();
        if (schema.enum) {
          zodSchema = z.enum(schema.enum as [string, ...string[]]);
        }
        break;
      case "number":
      case "integer":
        zodSchema = z.number();
        break;
      case "boolean":
        zodSchema = z.boolean();
        break;
      case "null":
        zodSchema = z.null();
        break;
      case "array":
        zodSchema = z.array(jsonSchemaToZod(schema.items || {}));
        break;
      case "object":
        if (schema.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          const required = schema.required || [];
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            let propZod = jsonSchemaToZod(propSchema);
            if (!required.includes(key)) {
              propZod = propZod.optional();
            }
            shape[key] = propZod;
          }
          zodSchema = z.object(shape);
        } else {
          // Generic object with unknown properties
          zodSchema = z.record(z.string(), z.any());
        }
        break;
      default:
        zodSchema = z.any();
    }
  }

  if (description && "describe" in zodSchema) {
    zodSchema = (zodSchema as any).describe(description);
  }

  return zodSchema;
}

/**
 * Sanitizes a tool ID to be a valid MCP tool name.
 * MCP tool names should be alphanumeric with underscores.
 * Uses registeredNames set to handle collisions by appending a suffix.
 */
function sanitizeToolName(toolId: string, registeredNames: Set<string>): string {
  // Replace non-alphanumeric characters with underscores, collapse multiple underscores
  let name = toolId
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Handle empty name after sanitization
  if (!name) {
    name = "tool";
  }

  // Handle collisions by appending a numeric suffix
  const baseName = name;
  let suffix = 1;
  while (registeredNames.has(name)) {
    name = `${baseName}_${suffix}`;
    suffix++;
  }

  registeredNames.add(name);
  return name;
}

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

  const apiPort = process.env.API_PORT || "3002";
  const apiEndpoint = process.env.API_ENDPOINT || `http://localhost:${apiPort}`;

  const client = new SuperglueClient({
    apiKey,
    apiEndpoint,
  });

  const getAuthContext = async (): Promise<McpAuthContext> => {
    const authResult = await validateToken(apiKey);
    return {
      orgId: authResult.orgId,
      isRestricted: authResult.isRestricted,
    };
  };

  // Fetch all tools the user has access to and register them as native MCP tools
  const authContext = await getAuthContext();

  let allTools: Tool[] = [];
  try {
    const result = await client.listWorkflows(1000, 0);
    allTools = result.items;
  } catch (error: any) {
    logMessage("error", `MCP: Failed to fetch tools: ${error.message}`, {
      orgId: authContext.orgId,
    });
    // Continue with empty tools list - authenticate tool will still be available
  }

  const activeTools = allTools.filter((t) => !t.archived);

  logMessage("info", `MCP: Registering ${activeTools.length} tools for org`, {
    orgId: authContext.orgId,
  });

  // Track registered tool names to handle collisions
  const registeredNames = new Set<string>(["authenticate"]);

  // Register each superglue tool as a native MCP tool
  for (const tool of activeTools) {
    const toolName = sanitizeToolName(tool.id, registeredNames);
    const description = tool.instruction || `Execute the ${tool.id} tool`;

    // Extract the payload schema from the tool's inputSchema
    // Tool inputSchema is { type: "object", properties: { payload: {...}, credentials: {...} } }
    // We prefer the payload part, but fall back to the full schema if payload doesn't exist
    const payloadSchema = tool.inputSchema?.properties?.payload || tool.inputSchema;
    let inputZodSchema = payloadSchema ? jsonSchemaToZod(payloadSchema) : z.looseObject({});

    // MCP requires inputSchema to be an object type. If the schema resolved to a non-object
    // (e.g., primitive type or z.any()), wrap it in an object or fall back to looseObject.
    // Using looseObject() preserves unknown keys so tools with dynamic/any payloads still work.
    if (!(inputZodSchema instanceof z.ZodObject)) {
      inputZodSchema = z.looseObject({});
    }

    mcpServer.registerTool(
      toolName,
      {
        description,
        inputSchema: inputZodSchema,
      },
      async (args, extra) => {
        try {
          const result = await client.runTool({
            toolId: tool.id,
            payload: args as Record<string, unknown>,
            options: { requestSource: RequestSource.MCP },
          });

          if (!result.success) {
            logMessage("error", `MCP: Tool ${tool.id} execution failed`, {
              orgId: authContext.orgId,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    success: false,
                    error: result.error || "Unknown error",
                  }),
                },
              ],
            };
          }

          const truncatedResult = truncateToolExecutionResult({
            success: true,
            data: result.data,
          });
          logMessage("debug", `MCP: Tool ${tool.id} executed successfully`, {
            orgId: authContext.orgId,
          });

          telemetryClient?.capture({
            distinctId: authContext.orgId || sessionId,
            event: "mcp_tool_executed",
            properties: {
              toolId: tool.id,
              toolName,
              orgId: authContext.orgId,
            },
          });

          return {
            content: [
              {
                type: "text" as const,
                text: truncatedResult,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  suggestion: "Check that all required credentials are provided",
                }),
              },
            ],
          };
        }
      },
    );
  }

  // Register authenticate tool for multi-tenancy (always available)
  mcpServer.registerTool(
    "authenticate",
    {
      description: `Generates an authentication portal link for an end user to connect their accounts.
Use this when a tool execution fails because the end user hasn't authenticated with required systems.
The portal allows users to authenticate with all available systems that require credentials.`,
      inputSchema: AuthenticateInputSchema,
    },
    async (args, extra) => {
      const currentAuthContext = await getAuthContext();

      try {
        const result = await client.generatePortalLink();

        // For non-end-user API keys, provide a link to the agent chat instead
        if (!result.success) {
          const baseUrl = process.env.SUPERGLUE_APP_URL || "https://app.superglue.cloud";
          const systemPrompt = args.systemId
            ? `Please help me reauthenticate the system "${args.systemId}".`
            : "Please help me reauthenticate my systems.";
          const agentUrl = `${baseUrl}/?prompt=${encodeURIComponent(systemPrompt)}`;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  agentUrl,
                  message: `Open this link to reauthenticate via the agent: ${agentUrl}`,
                }),
              },
            ],
          };
        }

        logMessage("debug", "MCP: authenticate executed", { orgId: currentAuthContext.orgId });

        telemetryClient?.capture({
          distinctId: currentAuthContext.orgId || sessionId,
          event: "mcp_authenticate",
          properties: {
            orgId: currentAuthContext.orgId,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                portalUrl: result.portalUrl,
                message: `Please share this link with the user to authenticate: ${result.portalUrl}`,
              }),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: error.message,
                suggestion:
                  "This API key is not linked to an end user. For dashboard users, use the agent chat to reauthenticate.",
              }),
            },
          ],
        };
      }
    },
  );

  logMessage("info", `MCP: Server ready with ${activeTools.length} tools + authenticate`, {
    orgId: authContext.orgId,
  });

  return mcpServer;
};

export const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export const mcpHandler = async (
  req: IncomingMessage & { body?: any; authInfo?: any },
  res: ServerResponse,
) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport;
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const token = (req as any).authInfo.token;
    const server = await createMcpServer(token);

    await server.connect(transport);
  } else {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      }),
    );
    return;
  }

  await transport.handleRequest(req, res, req.body);
};
