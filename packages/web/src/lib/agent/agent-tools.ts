import { setFileUploadDocumentationURL } from "@/src/lib/file-utils";
import {
  CallEndpointArgs,
  CallEndpointResult,
  Message,
  SelfHealingMode,
  SuperglueClient,
  ToolResult,
  UpsertMode,
} from "@superglue/shared";
import { SystemConfig, systems } from "@superglue/shared/templates";
import { DraftLookup, findDraftInMessages, formatDiffSummary } from "./agent-context";
import {
  filterSystemFields,
  resolveFileReferences,
  stripLegacyToolFields,
  validateRequiredFields,
} from "./agent-helpers";

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: any;
}

export const TOOLS_REQUIRING_CONFIRMATION_BEFORE_EXEC = new Set(["call_endpoint"]);
export const TOOLS_REQUIRING_CONFIRMATION_AFTER_EXEC = new Set(["edit_tool", "edit_payload"]);

export const CURL_CONFIRMATION = {
  PENDING: "PENDING_USER_CONFIRMATION",
  CONFIRMED: "USER_CONFIRMED",
  CANCELLED: "USER_CANCELLED",
} as const;

export const EDIT_TOOL_CONFIRMATION = {
  PENDING: "PENDING_DIFF_APPROVAL",
  APPROVED: "DIFFS_APPROVED",
  REJECTED: "DIFFS_REJECTED",
  PARTIAL: "DIFFS_PARTIALLY_APPROVED",
} as const;

export const TOOL_CONTINUATION_MESSAGES = {
  call_endpoint: {
    confirmed:
      "[USER ACTION] The user confirmed an HTTP request. Analyze the results and respond to the user.",
    declined:
      "[USER ACTION] The user declined an HTTP request. Acknowledge this and ask if they want to proceed differently or if there's anything else you can help with.",
  },
  edit_tool: {
    confirmed:
      "[USER ACTION] The user approved the tool edit changes. The changes have been applied to the tool configuration. Briefly confirm the edit was applied.",
    declined:
      "[USER ACTION] The user rejected the tool edit changes. Ask what they would like to change or if they want to try a different approach.",
    partial:
      "[USER ACTION] The user PARTIALLY approved the tool edit. IMPORTANT: Check the tool output for 'appliedChanges' (changes that WERE applied) and 'rejectedChanges' (changes the user rejected). Only report the applied changes as successful. Acknowledge which changes were rejected.",
  },
  edit_payload: {
    confirmed:
      "[USER ACTION] The user approved the payload edit. The payload has been updated in the playground.",
    declined:
      "[USER ACTION] The user rejected the payload edit. Ask what they would like to change or if they want to try a different approach.",
  },
};

export const getAgentToolDefinitions = (): ToolDefinition[] => {
  return [
    buildToolDefinition(),
    runToolDefinition(),
    editToolDefinition(),
    saveToolDefinition(),
    createSystemDefinition(),
    modifySystemDefinition(),
    searchDocumentationDefinition(),
    callEndpointDefinition(),
    authenticateOAuthDefinition(),
    getRunsDefinition(),
    findSystemTemplatesDefinition(),
  ];
};

export const getPlaygroundToolDefinitions = (): ToolDefinition[] => {
  return [
    editToolDefinitionPlayground(),
    editPayloadDefinition(),
    searchDocumentationDefinition(),
    callEndpointDefinition(),
    modifySystemDefinition(),
    authenticateOAuthDefinition(),
  ];
};

export const executeAgentTool = async (
  toolName: string,
  args: any,
  client: SuperglueClient,
  orgId?: string,
  logCallback?: (message: string) => void,
  filePayloads?: Record<string, any>,
  messages?: Message[],
): Promise<any> => {
  switch (toolName) {
    case "build_tool":
      return runBuildTool(args, client, filePayloads);
    case "run_tool":
      return runRunTool(args, client, logCallback, filePayloads, messages);
    case "edit_tool":
      return runEditTool(args, client, messages);
    case "save_tool":
      return runSaveTool(args, client, messages);
    case "create_system":
      return runCreateSystem(args, client, filePayloads);
    case "modify_system":
      return runModifySystem(args, client, filePayloads);
    case "search_documentation":
      return runSearchDocumentation(args, client);
    case "call_endpoint":
      throw new Error("call_endpoint should be handled via confirmation flow");
    case "authenticate_oauth":
      return runAuthenticateOAuth(args, client);
    case "find_system_templates":
      return runFindSystemTemplates(args);
    case "edit_payload":
      return runEditPayload(args);
    case "get_runs":
      return runGetRuns(args, client);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};

export const hasConfirmedTool = (toolOutput: any): boolean => {
  try {
    const output = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
    return (
      output?.confirmationState === CURL_CONFIRMATION.CONFIRMED ||
      output?.confirmationState === EDIT_TOOL_CONFIRMATION.APPROVED
    );
  } catch {
    return false;
  }
};

export const hasDeclinedTool = (toolOutput: any): boolean => {
  try {
    const output = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
    return (
      output?.confirmationState === CURL_CONFIRMATION.CANCELLED ||
      output?.confirmationState === EDIT_TOOL_CONFIRMATION.REJECTED
    );
  } catch {
    return false;
  }
};

export const hasPartiallyApprovedTool = (toolOutput: any): boolean => {
  try {
    const output = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
    return output?.confirmationState === EDIT_TOOL_CONFIRMATION.PARTIAL;
  } catch {
    return false;
  }
};

export const getToolContinuationMessage = (
  toolName: string,
  action: "confirmed" | "declined" | "partial",
): string | null => {
  const messages = TOOL_CONTINUATION_MESSAGES[toolName as keyof typeof TOOL_CONTINUATION_MESSAGES];
  return messages?.[action as keyof typeof messages] ?? null;
};

export const processIntermediateToolResult = async (
  toolName: string,
  toolInput: any,
  toolOutput: any,
  client: SuperglueClient,
): Promise<{ output: string; status: "completed" | "declined" } | null> => {
  switch (toolName) {
    case "call_endpoint":
      return await processCallEndpointConfirmation(toolInput, toolOutput, client);
    case "edit_tool":
      return await processEditToolConfirmation(toolOutput);
    default:
      return null;
  }
};

export const buildToolDefinition = (): ToolDefinition => ({
  name: "build_tool",
  description: `
    <use_case>
      Builds a NEW tool from scratch using natural language instructions. Returns a draftId that can be used with run_tool, edit_tool, or save_tool.
    </use_case>

    <important_notes>
      - ONLY use this for creating NEW tools. To modify an existing tool, use edit_tool instead.
      - Use this only after all systems are set up and verified to be working correctly.
      - This tool only BUILDS the tool - it does NOT execute it. Use run_tool to execute.
      - Building can take up to several minutes.
      - Use file::<key> to reference uploaded files (gets replaced with actual parsed content)
      - Returns a draftId - use this ID with run_tool to test, edit_tool to fix errors, or save_tool to persist.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      instruction: {
        type: "string",
        description: "Natural language instruction to build a new tool from scratch",
      },
      systemIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of system IDs to use in the tool",
      },
      payload: { type: "object", description: "Sample JSON payload for the tool." },
      filePayloadReferences: {
        type: "object",
        description: "Optional file payloads. Use file::filename to reference uploaded files.",
      },
      responseSchema: {
        type: "object",
        description: "JSONSchema for the expected output structure",
      },
    },
    required: ["instruction", "systemIds"],
  },
});

export const runBuildTool = async (
  args: any,
  client: SuperglueClient,
  filePayloads?: Record<string, any>,
) => {
  const { instruction, systemIds, payload, filePayloadReferences, responseSchema } = args;
  let filePayloadContent = {};

  try {
    if (filePayloadReferences && filePayloads && Object.keys(filePayloadReferences).length > 0) {
      filePayloadContent = resolveFileReferences(filePayloadReferences, filePayloads);
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }

  try {
    const fullPayload = { ...payload, ...filePayloadContent };
    const builtTool = await client.buildWorkflow({
      instruction,
      systemIds,
      payload: fullPayload,
      responseSchema,
      save: false,
    });

    // Generate a draftId - the config is stored in message history via tool output
    const draftId = `draft_${crypto.randomUUID()}`;

    return {
      success: true,
      draftId,
      toolId: builtTool.id,
      config: stripLegacyToolFields(builtTool),
      note: "Tool built successfully. Use 'run_tool' with this draftId to test it.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Check that systems are set up correctly and try again",
    };
  }
};

export const runToolDefinition = (): ToolDefinition => ({
  name: "run_tool",
  description: `
    <use_case>
      Executes a tool - either a draft (by draftId) or a saved tool (by toolId).
    </use_case>

    <important_notes>
      - Provide either draftId (for drafts from build_tool) OR toolId (for saved tools), not both.
      - If execution fails, the error is stored in the draft for use with edit_tool.
      - Use file::<key> to reference uploaded files in the payload.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of a draft tool (from build_tool)" },
      toolId: { type: "string", description: "ID of a saved tool" },
      payload: { type: "object", description: "JSON payload to pass to the tool" },
      filePayloadReferences: {
        type: "object",
        description: "Optional file payloads. Use file::filename to reference uploaded files.",
      },
    },
  },
});

export const runRunTool = async (
  args: any,
  client: SuperglueClient,
  logCallback?: (message: string) => void,
  filePayloads?: Record<string, any>,
  messages?: Message[],
) => {
  const { draftId, toolId, payload, filePayloadReferences } = args;

  if (!draftId && !toolId) {
    return {
      success: false,
      error: "Either draftId or toolId is required",
      suggestion: "Provide draftId (from build_tool) or toolId (for saved tools)",
    };
  }

  if (draftId && toolId) {
    return {
      success: false,
      error: "Provide either draftId or toolId, not both",
    };
  }

  let filePayloadContent = {};
  try {
    if (filePayloadReferences && filePayloads && Object.keys(filePayloadReferences).length > 0) {
      filePayloadContent = resolveFileReferences(filePayloadReferences, filePayloads);
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "File payload resolution failed. Use the exact sanitized file key.",
    };
  }

  const fullPayload = { ...payload, ...filePayloadContent };

  // Resolve tool config and context (draft vs saved)
  let toolConfig: any;
  let inputSchema: any;
  let isDraft = false;

  if (toolId) {
    try {
      toolConfig = await client.getWorkflow(toolId);
      inputSchema = toolConfig?.inputSchema?.properties?.payload;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        suggestion: "Check that the tool ID exists and all required credentials are provided",
      };
    }
  } else {
    const draft = findDraftInMessages(messages || [], draftId);
    if (!draft) {
      return {
        success: false,
        error: `Draft not found: ${draftId}`,
        suggestion:
          "Draft not found in conversation history. Use build_tool to create a new draft.",
      };
    }
    toolConfig = draft.config;
    inputSchema = draft.config.inputSchema;
    isDraft = true;
  }

  // Validate required fields
  const validation = validateRequiredFields(inputSchema, fullPayload);
  if (validation.valid === false) {
    const { missingFields, schema } = validation;
    return {
      success: false,
      ...(isDraft ? { draftId } : {}),
      error: `Missing required input fields: ${missingFields.join(", ")}`,
      config: stripLegacyToolFields(toolConfig),
      inputSchema: schema,
      providedPayload: fullPayload,
      suggestion: `This tool requires the following inputs: ${JSON.stringify(schema.properties || {}, null, 2)}. Please provide values for: ${missingFields.join(", ")}`,
    };
  }

  // Execute the tool
  const traceId = isDraft ? crypto.randomUUID() : undefined;
  if (isDraft && logCallback && traceId) {
    logCallback(`TOOL_CALL_UPDATE:run_tool:TRACE_ID:${traceId}`);
  }

  try {
    const result: ToolResult = await client.executeWorkflow(
      isDraft
        ? {
            tool: toolConfig,
            payload: fullPayload,
            options: { selfHealing: SelfHealingMode.DISABLED, testMode: false, retries: 0 },
            traceId,
          }
        : {
            id: toolId,
            payload: fullPayload,
            options: { selfHealing: SelfHealingMode.DISABLED },
          },
    );

    if (!result.success) {
      return {
        success: false,
        ...(isDraft ? { draftId, stepResults: result.stepResults, traceId } : {}),
        config: stripLegacyToolFields(toolConfig),
        data: result.data,
        error: result.error,
        suggestion: isDraft
          ? "Use edit_tool with this draftId to fix the error, or try run_tool again."
          : "Check the error and try again",
      };
    }

    return {
      success: true,
      ...(isDraft
        ? {
            draftId,
            traceId,
            note: "Tool executed successfully! Use 'save_tool' to persist this tool.",
          }
        : {}),
      config: stripLegacyToolFields(toolConfig),
      data: result.data,
    };
  } catch (error: any) {
    return {
      success: false,
      ...(isDraft ? { draftId, traceId } : {}),
      config: stripLegacyToolFields(toolConfig),
      error: error.message,
      suggestion: isDraft
        ? "Use edit_tool with this draftId to fix the error"
        : "Check that the tool ID exists and all required credentials are provided",
    };
  }
};

export const editToolDefinition = (): ToolDefinition => ({
  name: "edit_tool",
  description: `
    <use_case>
      Modifies an existing tool using targeted changes. Use this to fix errors, adjust mappings, change endpoints, update transforms, or make any modifications to a tool that already exists.
    </use_case>

    <important_notes>
      - ALWAYS use this instead of build_tool when modifying an existing tool (draft or saved).
      - Uses diff-based approach - makes minimal targeted changes rather than rebuilding from scratch.
      - Provide either draftId (from build_tool) OR toolId (for saved tools), not both.
      - Provide specific fix instructions (e.g., "change the endpoint to /v2/users", "remove extra fields from finalTransform", "fix the response schema mapping").
      - The fix creates an updated draft - use run_tool to test, then save_tool to persist.
      - After fixing, use run_tool with the returned draftId to test the updated draft.
      - Include the payload parameter with the same test data from build_tool - users need this to test the fixed tool! This param can be an empty object if the tool does not require input data for testing.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of the draft tool to edit (from build_tool)" },
      toolId: { type: "string", description: "ID of a saved tool to edit" },
      fixInstructions: {
        type: "string",
        description: "Specific instructions on how to edit the tool",
      },
      payload: {
        type: "object",
        description: "IMPORTANT: Include a working payload so users can test the fixed tool",
      },
    },
    required: ["fixInstructions", "payload"],
  },
});

// Playground-specific version - no payload field (playground has its own payload state)
export const editToolDefinitionPlayground = (): ToolDefinition => ({
  name: "edit_tool",
  description: `
    <use_case>
      Modifies the current tool in the playground using targeted changes.
    </use_case>

    <important_notes>
      - The tool being edited is "playground-draft" - use this as the draftId.
      - Uses diff-based approach - makes minimal targeted changes.
      - Do NOT provide a payload - the playground has its own test payload. Use edit_payload if the user wants to change the test data.
      - Provide specific fix instructions (e.g., "change the endpoint to /v2/users", "fix the finalTransform mapping").
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of the draft tool to edit" },
      toolId: { type: "string", description: "ID of a saved tool to edit" },
      fixInstructions: {
        type: "string",
        description: "Specific instructions on how to edit the tool",
      },
    },
    required: ["fixInstructions"],
  },
});

export const runEditTool = async (args: any, client: SuperglueClient, messages?: Message[]) => {
  const { draftId, toolId, fixInstructions } = args;

  if (!draftId && !toolId) {
    return {
      success: false,
      error: "Either draftId or toolId is required",
      suggestion: "Provide draftId (from build_tool) or toolId (for saved tools)",
    };
  }

  if (draftId && toolId) {
    return {
      success: false,
      error: "Provide either draftId or toolId, not both",
    };
  }

  let draft: DraftLookup | null = null;
  let workingDraftId = draftId;

  // If toolId provided, fetch the saved tool
  if (toolId) {
    try {
      const savedTool = await client.getWorkflow(toolId);
      if (!savedTool) {
        return {
          success: false,
          error: `Tool not found: ${toolId}`,
          suggestion: "Check that the tool ID exists",
        };
      }
      const stepSystemIds = savedTool.steps
        .map((step: any) => step.systemId)
        .filter((id: string) => id);
      const systemIds = [...savedTool.systemIds, ...new Set(stepSystemIds)];
      // Create a draft-like object from the saved tool
      workingDraftId = `fix-${toolId}-${Date.now()}`;
      draft = {
        config: savedTool,
        systemIds,
        instruction: savedTool.instruction || "",
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to fetch tool: ${error.message}`,
        suggestion: "Check that the tool ID exists and you have access",
      };
    }
  } else {
    draft = findDraftInMessages(messages || [], draftId);
  }

  if (!draft) {
    return {
      success: false,
      error: `Draft not found: ${workingDraftId}`,
      suggestion: "Draft not found in conversation history. Use build_tool to create a new draft.",
    };
  }

  try {
    // Use the dedicated fixWorkflow endpoint with diff-based approach
    const fixResult = await client.fixWorkflow({
      tool: draft.config,
      fixInstructions,
      systemIds: draft.systemIds,
    });

    // Preserve original instruction for display and strip legacy fields
    const fixedToolForStorage = stripLegacyToolFields({
      ...fixResult.tool,
      instruction: draft.instruction,
    });

    // Also strip legacy fields from original for consistency
    const originalConfigForStorage = stripLegacyToolFields(draft.config);

    return {
      success: true,
      draftId: workingDraftId,
      toolId: fixResult.tool.id,
      originalConfig: originalConfigForStorage,
      config: fixedToolForStorage,
      diffs: fixResult.diffs,
      note: `Tool fixed with ${fixResult.diffs.length} change(s). Use 'run_tool' with draftId '${workingDraftId}' to test, then 'save_tool' to persist.`,
    };
  } catch (error: any) {
    return {
      success: false,
      draftId: workingDraftId,
      error: error.message,
      suggestion: "Fix failed. Try different fix instructions or rebuild the tool.",
    };
  }
};

const processEditToolConfirmation = async (
  toolOutput: any,
): Promise<{ output: string; status: "completed" | "declined" } | null> => {
  let output;
  try {
    output = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
  } catch {
    return null;
  }

  if (!output.confirmationState) {
    return null;
  }

  if (output.confirmationState === EDIT_TOOL_CONFIRMATION.APPROVED) {
    return {
      output: JSON.stringify({
        ...output,
        userApproved: true,
        message: "All changes approved and applied.",
      }),
      status: "completed",
    };
  } else if (output.confirmationState === EDIT_TOOL_CONFIRMATION.PARTIAL) {
    const approvedSummaries = (output.approvedDiffs || []).map((d: any) => formatDiffSummary(d));
    const rejectedSummaries = (output.rejectedDiffs || []).map((d: any) => formatDiffSummary(d));

    return {
      output: JSON.stringify({
        ...output,
        userApproved: true,
        partialApproval: true,
        message: `User PARTIALLY approved: ${output.approvedDiffs?.length || 0} change(s) APPLIED, ${output.rejectedDiffs?.length || 0} REJECTED.`,
        appliedChanges: approvedSummaries,
        rejectedChanges: rejectedSummaries,
      }),
      status: "completed",
    };
  } else if (output.confirmationState === EDIT_TOOL_CONFIRMATION.REJECTED) {
    return {
      output: JSON.stringify({
        ...output,
        userApproved: false,
        rejected: true,
        message: "All changes rejected by user.",
      }),
      status: "declined",
    };
  }

  return null;
};

export const saveToolDefinition = (): ToolDefinition => ({
  name: "save_tool",
  description: `
    <use_case>
      Persists a draft tool to the database, making it available for future use.
    </use_case>

    <important_notes>
      - Requires a draftId from build_tool.
      - Only save tools that have been tested successfully with run_tool.
      - After saving, the tool can be executed by ID using run_tool with toolId.
      - Optionally provide an id to override the default tool ID.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of the draft tool to save" },
      id: {
        type: "string",
        description: "Optional custom ID for the saved tool (overrides the auto-generated ID)",
      },
    },
    required: ["draftId"],
  },
});

export const runSaveTool = async (args: any, client: SuperglueClient, messages?: Message[]) => {
  const { draftId, id } = args;

  const draft = findDraftInMessages(messages || [], draftId);
  if (!draft) {
    return {
      success: false,
      error: `Draft not found: ${draftId}`,
      suggestion: "Draft not found in conversation history. Use build_tool to create a new draft.",
    };
  }

  try {
    const toolId = id || draft.config.id;
    const toolToSave = {
      ...draft.config,
      id: toolId,
      systemIds: draft.systemIds,
    };

    const savedTool = await client.upsertWorkflow(toolId, toolToSave);

    return {
      success: true,
      toolId: savedTool.id,
      note: `Tool "${savedTool.id}" saved successfully. You can now execute it using run_tool with toolId.`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Failed to save tool. Check the error and try again.",
    };
  }
};

export const createSystemDefinition = (): ToolDefinition => ({
  name: "create_system",
  description: `
    <use_case>
      Creates and immediately saves a new system. Systems are building blocks for tools and contain the credentials for accessing the API.
    </use_case>

    <important_notes>
      - Use templateId when creating systems for known services (slack, github, stripe, etc.) - this auto-populates urlHost, urlPath, documentationUrl, and OAuth config.
      - When using templateId, you only need to provide: id, templateId, and credentials (if required by the auth type).
      - For API key auth: provide the api_key in credentials.
      - For OAuth auth: create the system first, then call authenticate_oauth to trigger the OAuth flow.
      - The credentials object stores authentication data. Use placeholder references in the format: <<{system_id}_{credential_name}>> to reference them.
      - If no credentials are needed, provide an empty object.
      - Providing a documentationUrl will trigger asynchronous API documentation processing.
      - For documentation field, you can provide raw documentation text OR use file::filename to reference uploaded files.
      - When users mention API constraints (rate limits, special endpoints, auth requirements, etc.), capture them in 'specificInstructions'.
    </important_notes>`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "A unique identifier for the new system" },
      templateId: {
        type: "string",
        description:
          "Template ID to auto-populate from (e.g., 'slack', 'github', 'stripe'). See AVAILABLE SYSTEM TEMPLATES in context.",
      },
      name: {
        type: "string",
        description: "Human-readable name for the system (auto-populated if using templateId)",
      },
      urlHost: {
        type: "string",
        description:
          "Base URL/hostname for the API including protocol (auto-populated if using templateId)",
      },
      urlPath: {
        type: "string",
        description: "Path component of the URL (auto-populated if using templateId)",
      },
      documentationUrl: {
        type: "string",
        description: "URL to the API documentation (auto-populated if using templateId)",
      },
      documentation: {
        type: "string",
        description:
          "Raw documentation text or file::filename for uploaded files. Multiple files: file::doc1.pdf,file::doc2.pdf",
      },
      specificInstructions: {
        type: "string",
        description: "Specific guidance on how to use this system",
      },
      documentationKeywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Keywords to help with documentation search (auto-populated if using templateId)",
      },
      credentials: {
        type: "object",
        description:
          "Credentials for accessing the system. Flat Object, no nested objects, all keys in snake_case and top level only. Example keys (all optional): api_key, access_token, client_id, client_secret, auth_url, token_url, scopes, grant_type, bot_token, etc...",
      },
    },
    required: ["id", "credentials"],
  },
});

export const runCreateSystem = async (
  args: any,
  client: SuperglueClient,
  filePayloads?: Record<string, any>,
) => {
  let { templateId, ...systemInput } = args;

  // If templateId provided, populate from template
  if (templateId) {
    const template = systems[templateId];
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`,
        suggestion: `Available templates: ${Object.keys(systems).join(", ")}`,
      };
    }

    // Parse apiUrl into urlHost and urlPath
    let urlHost = "";
    let urlPath = "";
    if (template.apiUrl) {
      try {
        const url = new URL(template.apiUrl);
        urlHost = `${url.protocol}//${url.host}`;
        urlPath = url.pathname;
      } catch {
        urlHost = template.apiUrl;
      }
    }

    // Build OAuth credentials from template if available
    const oauthCreds: Record<string, any> = {};
    if (template.oauth) {
      if (template.oauth.authUrl) oauthCreds.auth_url = template.oauth.authUrl;
      if (template.oauth.tokenUrl) oauthCreds.token_url = template.oauth.tokenUrl;
      if (template.oauth.scopes) oauthCreds.scopes = template.oauth.scopes;
      if (template.oauth.client_id) oauthCreds.client_id = template.oauth.client_id;
      if (template.oauth.grant_type) oauthCreds.grant_type = template.oauth.grant_type;
    }

    // Merge template defaults with provided values (provided values take precedence)
    systemInput = {
      name: template.name,
      urlHost,
      urlPath,
      documentationUrl: template.docsUrl,
      documentationKeywords: template.keywords,
      credentials: { ...oauthCreds, ...systemInput.credentials },
      ...systemInput, // User overrides
    };
  }

  try {
    if (filePayloads && Object.keys(filePayloads).length > 0 && systemInput.documentation) {
      const hasFileReference =
        typeof systemInput.documentation === "string" &&
        systemInput.documentation.includes("file::");

      if (hasFileReference) {
        const fileRefs = systemInput.documentation
          .split(",")
          .map((ref: string) => ref.trim().replace(/^file::/, ""));
        systemInput.documentationUrl = setFileUploadDocumentationURL(fileRefs);
      }

      systemInput.documentation = resolveFileReferences(
        systemInput.documentation,
        filePayloads,
        true,
      );
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }

  try {
    const result = await client.upsertSystem(systemInput.id, systemInput, UpsertMode.UPSERT);
    return {
      success: true,
      system: filterSystemFields(result),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Failed to create system. Validate all system inputs and try again.",
    };
  }
};

export const modifySystemDefinition = (): ToolDefinition => ({
  name: "modify_system",
  description: `
    <use_case>
      Modifies an existing system identified by its id. Systems are building blocks for tools and contain the credentials for accessing the API.
      Provide only the id and the fields you want to change. Fields not included will remain unchanged.
    </use_case>

    <important_notes>
      - Most APIs require authentication (API keys, tokens, etc.). Always ask the user for credentials if needed.
      - Always split information clearly: urlHost (without secrets), urlPath, credentials (with secrets), etc.
      - When users mention API constraints (rate limits, special endpoints, auth requirements, etc.), capture them in 'specificInstructions' to guide tool building.
      - Providing a documentationUrl will trigger asynchronous API documentation processing.
      - For documentation field, you can provide raw documentation text OR use file::filename to reference uploaded files. For multiple files, use comma-separated: file::doc1.pdf,file::doc2.pdf
      - When referencing files in the documentation field, use the exact file key (file::<key>) exactly as shown (e.g., file::my_data_csv). Do NOT use the original filename.
      - Files are ONLY available in the same message they were uploaded with
      - If user asks to add documentation from a previous message, tell them to re-upload the file
      - When providing files as system documentation input, the files you use will overwrite the current documentation content. Ensure to include ALL required files always, even if the user only asks you to add one.
      - If you provide documentationUrl, include relevant keywords in 'documentationKeywords' to improve documentation search (e.g., endpoint names, data objects, key concepts mentioned in conversation).
    </important_notes>

    <credential_handling>
      - CREDENTIALS ARE MASKED: The credential values you see (like <<masked_api_key>>) are placeholders, not real values.
      - When updating credentials, ONLY include fields with actual new values provided by the user.
      - You may include masked values in your update - they will be automatically ignored and existing values preserved.
      - To add a new credential field, just include that field. Existing credentials are preserved automatically.
      - Example: To add "scope" while keeping existing "client_id" and "client_secret", just pass: credentials: { scope: "read_write" }
    </credential_handling>
    `,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The unique identifier of the system" },
      name: { type: "string", description: "Human-readable name for the system" },
      urlHost: { type: "string", description: "Base URL/hostname for the API including protocol" },
      urlPath: { type: "string", description: "Path component of the URL" },
      documentationUrl: { type: "string", description: "URL to the API documentation" },
      documentation: {
        type: "string",
        description:
          "Raw documentation text or file::filename for uploaded files. Multiple files: file::doc1.pdf,file::doc2.pdf",
      },
      specificInstructions: {
        type: "string",
        description: "Specific guidance on how to use this system",
      },
      documentationKeywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords to help with documentation search",
      },
      credentials: {
        type: "object",
        description: "Credentials for accessing the system. All keys should be in snake_case.",
      },
    },
    required: ["id"],
  },
});

export const runModifySystem = async (
  args: any,
  client: SuperglueClient,
  filePayloads?: Record<string, any>,
) => {
  let { ...systemInput } = args;

  try {
    if (filePayloads && Object.keys(filePayloads).length > 0 && systemInput.documentation) {
      const hasFileReference =
        typeof systemInput.documentation === "string" &&
        systemInput.documentation.includes("file::");

      if (hasFileReference) {
        const fileRefs = systemInput.documentation
          .split(",")
          .map((ref: string) => ref.trim().replace(/^file::/, ""));
        systemInput.documentationUrl = setFileUploadDocumentationURL(fileRefs);
      }

      systemInput.documentation = resolveFileReferences(
        systemInput.documentation,
        filePayloads,
        true,
      );
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }

  try {
    const result = await client.upsertSystem(systemInput.id, systemInput, UpsertMode.UPDATE);
    const note = result.documentationPending
      ? "System modified. Documentation is being processed in the background."
      : "System modified successfully.";

    return {
      note: note,
      success: true,
      system: filterSystemFields(result),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Failed to modify system. Validate all system inputs and try again.",
    };
  }
};

export const callEndpointDefinition = (): ToolDefinition => ({
  name: "call_endpoint",
  description: `
    <use_case>
      Used to test systems and endpoints before building tools. Use this to explore APIs, verify authentication, test endpoints, and examine response formats.
      Perfect for quickly understanding how an API works before building a tool.
    </use_case>

    <important_notes>
      - REQUIRES USER CONFIRMATION before execution - never auto-executes
      - Ideal for API discovery, testing authentication, exploring endpoints, and validating request/response formats
      - Supports credential injection using placeholders: <<system_id_credential_key>>
      - When a systemId is provided, OAuth tokens are automatically refreshed if expired
      - Use after checking available systems to get credential keys for auth
      - Can execute on production systems - always show request details before execution
      - Supports all HTTP methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
      - Example header with credentials: { "Authorization": "Bearer <<stripe_api_api_key>>" }
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      systemId: {
        type: "string",
        description:
          "Optional system ID for credential injection and automatic OAuth token refresh. Required if using credential placeholders.",
      },
      method: {
        type: "string",
        description: "HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      },
      url: {
        type: "string",
        description: "Full URL to request (including protocol and query parameters)",
      },
      headers: {
        type: "object",
        description:
          "Optional HTTP headers. Can use <<system_id_credential_key>> for credential injection.",
      },
      body: {
        type: "string",
        description: "Optional request body (JSON string for POST/PUT/PATCH requests)",
      },
      timeout: {
        type: "number",
        description: "Optional timeout in milliseconds (default: 30000)",
      },
    },
    required: ["method", "url"],
  },
});

export const runCallEndpoint = async (
  request: CallEndpointArgs,
  client: SuperglueClient,
): Promise<CallEndpointResult> => {
  const { systemId, method, url, headers, body, timeout } = request;

  try {
    return await client.callEndpoint({ systemId, method, url, headers, body, timeout });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
};

const processCallEndpointConfirmation = async (
  toolInput: any,
  toolOutput: any,
  client: SuperglueClient,
): Promise<{ output: string; status: "completed" | "declined" } | null> => {
  let output;
  try {
    output = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
  } catch {
    return null;
  }

  if (!output.confirmationState) {
    return null;
  }

  if (output.confirmationState === CURL_CONFIRMATION.CONFIRMED) {
    try {
      const realResult = await runCallEndpoint(toolInput, client);

      const MAX_BODY_LENGTH = 25_000;
      if (realResult.body) {
        if (typeof realResult.body === "object") {
          const bodyStr = JSON.stringify(realResult.body);
          if (bodyStr.length > MAX_BODY_LENGTH) {
            realResult.body = {
              _note: `Response body truncated for LLM context (original size: ${bodyStr.length} chars)`,
              _truncated: true,
              preview: bodyStr.substring(0, MAX_BODY_LENGTH),
            };
          }
        } else if (
          typeof realResult.body === "string" &&
          realResult.body.length > MAX_BODY_LENGTH
        ) {
          const originalLength = realResult.body.length;
          realResult.body =
            realResult.body.substring(0, MAX_BODY_LENGTH) +
            `\n\n[Truncated from ${originalLength} chars]`;
        }
      }

      return { output: JSON.stringify(realResult), status: "completed" };
    } catch (error: any) {
      const errorResult = {
        success: false,
        error: error.message || "Request failed",
        duration: 0,
      };
      return { output: JSON.stringify(errorResult), status: "completed" };
    }
  } else if (output.confirmationState === CURL_CONFIRMATION.CANCELLED) {
    const cancelOutput = JSON.stringify({
      success: false,
      cancelled: true,
      message: "Request declined by user",
    });
    return { output: cancelOutput, status: "declined" };
  }

  return null;
};

export const searchDocumentationDefinition = (): ToolDefinition => ({
  name: "search_documentation",
  description: `
    <use_case>
      Searches a system's provided documentation and OpenAPI specs (if available) for specific information using keywords. 
      Use this for targeted searches when you need specific details about a system.
    </use_case>

    <important_notes>
      - This is a lightweight search tool that returns a limited number of relevant sections
      - Use clear, specific keywords related to what you're looking for (e.g., "authentication", "pagination", "rate limits")
      - Results are automatically limited to keep responses focused and relevant
      - Use this when you need to find specific information about a system's API or functionality
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      systemId: {
        type: "string",
        description: "The ID of the system to search documentation for",
      },
      keywords: {
        type: "string",
        description: "Keywords to search for in the documentation (space-separated)",
      },
    },
    required: ["systemId", "keywords"],
  },
});

export const runSearchDocumentation = async (args: any, client: SuperglueClient) => {
  const { systemId, keywords } = args;

  try {
    const result = await client.searchSystemDocumentation(systemId, keywords);

    const hasNoDocumentation = result.trim().length === 0;
    const hasNoResults = result.startsWith("No relevant sections found");

    if (hasNoDocumentation) {
      return {
        success: false,
        noDocumentation: true,
        message: result.split("\n\n").slice(1).join("\n\n"),
        systemId: systemId,
        keywords: keywords,
      };
    }

    if (hasNoResults) {
      return {
        success: true,
        noResults: true,
        message: result,
        keywords: keywords,
      };
    }

    return {
      success: true,
      content: result,
      keywords: keywords,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Check that the system ID exists and has documentation available",
    };
  }
};

export const authenticateOAuthDefinition = (): ToolDefinition => ({
  name: "authenticate_oauth",
  description: `
    <use_case>
      Initiates OAuth authentication flow for a system. Use for:
      1. Initial OAuth setup after create_system
      2. Re-authenticating when OAuth tokens have expired and cannot be refreshed
    </use_case>

    <credential_resolution>
      OAuth credentials are resolved in this priority order:
      1. Values passed to this tool (client_id, client_secret, auth_url, token_url)
      2. Values already stored in the system's credentials
      3. Values from templates (slack, salesforce, asana)
      
      If the system already has client_id/client_secret stored in credentials,
      you do NOT need to ask the user again - just call this tool with only systemId and scopes.
    </credential_resolution>

    <templates_with_preconfigured_oauth>
      ONLY these templates have client_id pre-configured (Superglue OAuth):
      - slack: auth_url=https://slack.com/oauth/v2/authorize, token_url=https://slack.com/api/oauth.v2.access
      - salesforce: auth_url=https://login.salesforce.com/services/oauth2/authorize, token_url=https://login.salesforce.com/services/oauth2/token
      - asana: auth_url=https://app.asana.com/-/oauth_authorize, token_url=https://app.asana.com/-/oauth_token
    </templates_with_preconfigured_oauth>

    <first_time_setup>
      For FIRST-TIME setup on Google, Microsoft, GitHub, etc. (when credentials are NOT already stored):
      1. ASK the user for their client_id and client_secret
      2. Provide the correct auth_url and token_url
    </first_time_setup>

    <important>
      - STOP the conversation after calling - user must complete OAuth in UI
    </important>
    `,
  inputSchema: {
    type: "object",
    properties: {
      systemId: { type: "string", description: "ID of the system to authenticate" },
      scopes: {
        type: "string",
        description:
          "Space-separated OAuth scopes - always aim for full access unless user asks for specific scopes",
      },
      client_id: {
        type: "string",
        description:
          "OAuth client ID - only needed if not already stored in system credentials or template",
      },
      client_secret: {
        type: "string",
        description:
          "OAuth client secret - only needed if not already stored in system credentials",
      },
      auth_url: {
        type: "string",
        description:
          "OAuth authorization URL - only needed if not already stored in system credentials or template",
      },
      token_url: {
        type: "string",
        description:
          "OAuth token URL - only needed if not already stored in system credentials or template",
      },
      grant_type: {
        type: "string",
        description: "OAuth grant type: 'authorization_code' (default) or 'client_credentials'",
      },
    },
    required: ["systemId", "scopes"],
  },
});

export const runAuthenticateOAuth = async (args: any, client: SuperglueClient) => {
  const { systemId, scopes, client_id, client_secret, auth_url, token_url, grant_type } = args;

  // Fetch the system to get existing OAuth config
  try {
    const system = await client.getSystem(systemId);
    if (!system) {
      return {
        success: false,
        error: `System '${systemId}' not found`,
        suggestion: "Create the system first using create_system",
      };
    }

    // Check if systemId matches a template (for pre-configured OAuth like Slack, Salesforce, Asana)
    const template = systems[systemId];
    const templateOAuth = template?.oauth;

    // Build OAuth config - priority: args > system.credentials > template
    const oauthConfig: Record<string, any> = {
      grant_type:
        grant_type ||
        system.credentials?.grant_type ||
        templateOAuth?.grant_type ||
        "authorization_code",
    };

    // Merge OAuth fields - args take precedence, then stored credentials, then template
    if (scopes) oauthConfig.scopes = scopes;
    else if (system.credentials?.scopes) oauthConfig.scopes = system.credentials.scopes;
    else if (templateOAuth?.scopes) oauthConfig.scopes = templateOAuth.scopes;

    if (client_id) oauthConfig.client_id = client_id;
    else if (system.credentials?.client_id) oauthConfig.client_id = system.credentials.client_id;
    else if (templateOAuth?.client_id) oauthConfig.client_id = templateOAuth.client_id;

    if (client_secret) oauthConfig.client_secret = client_secret;
    else if (system.credentials?.client_secret)
      oauthConfig.client_secret = system.credentials.client_secret;

    if (auth_url) oauthConfig.auth_url = auth_url;
    else if (system.credentials?.auth_url) oauthConfig.auth_url = system.credentials.auth_url;
    else if (templateOAuth?.authUrl) oauthConfig.auth_url = templateOAuth.authUrl;

    if (token_url) oauthConfig.token_url = token_url;
    else if (system.credentials?.token_url) oauthConfig.token_url = system.credentials.token_url;
    else if (templateOAuth?.tokenUrl) oauthConfig.token_url = templateOAuth.tokenUrl;

    // Validate we have minimum required OAuth fields
    if (!oauthConfig.client_id) {
      return {
        success: false,
        error: "Missing client_id for OAuth",
        suggestion: "Provide client_id or use a template that has pre-configured OAuth",
      };
    }

    if (!oauthConfig.auth_url || !oauthConfig.token_url) {
      return {
        success: false,
        error: "Missing auth_url or token_url for OAuth",
        suggestion: "Provide auth_url and token_url, or use a template with pre-configured OAuth",
      };
    }

    // Return OAuth required state - UI will show button
    return {
      success: true,
      requiresOAuth: true,
      systemId,
      oauthConfig,
      system: filterSystemFields(system),
      message: "OAuth authentication ready. Click the button to authenticate.",
      note: "STOP the conversation here and wait for the user to complete OAuth authentication.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Failed to fetch system. Check that the system ID exists.",
    };
  }
};

export const findSystemTemplatesDefinition = (): ToolDefinition => ({
  name: "find_system_templates",
  description: `
    <use_case>
      Get system template details including documentation URL, OAuth config (auth_url, token_url, scopes, client_id), API endpoints, etc. 
      ALWAYS use this BEFORE creating a system or authenticating OAuth to get the correct URLs and scopes.
    </use_case>

    <important_notes>
      - Provide between 1 and 3 system names to get information for.
      - If you are not sure about the name, provide a partial name or keyword related to the system.
      - Check the returned templates for OAuth config:
        - If template has oauth.client_id: Superglue OAuth is available - can create system directly
        - If template has oauth but NO client_id: Must ask user for OAuth credentials (client_id, client_secret)
      - Use the returned urlHost, urlPath, auth_url, token_url, scopes when creating systems or authenticating
    </important_notes>`,
  inputSchema: {
    type: "object",
    properties: {
      system_names: {
        type: "array",
        items: { type: "string" },
        description: "The names of the systems to get information for",
      },
    },
    required: ["system_names"],
  },
});

export const runFindSystemTemplates = async (args: any) => {
  const { system_names } = args;
  const templates: Array<SystemConfig & { urlHost?: string; urlPath?: string }> = [];

  const processedNames = system_names
    .map((name: string) => name.trim().toLowerCase())
    .filter((name: string) => name.length >= 3);

  if (processedNames.length === 0) {
    return {
      templates: [],
      suggestion:
        "No system templates found - you can still create a new system using 'create_system'. If some parameters are unclear, use the 'web_search' tool to search for more information and ask the user for clarification",
    };
  }

  for (const template of Object.values(systems)) {
    const nameLower = template.name.toLowerCase();
    const apiUrlLower = template.apiUrl?.toLowerCase();
    const docsUrlLower = template.docsUrl?.toLowerCase();
    const regex = template.regex ? new RegExp(template.regex, "i") : null;

    const matches = processedNames.some(
      (name: string) =>
        nameLower?.includes(name) ||
        apiUrlLower?.includes(name) ||
        docsUrlLower?.includes(name) ||
        (regex && regex.test(name)),
    );

    if (matches) {
      const { apiUrl, oauth: rawOauth, ...rest } = template;
      type TemplateOauth =
        | {
            authUrl?: string;
            tokenUrl?: string;
            scopes?: string | string[];
            client_id?: string;
            grant_type?: string;
          }
        | Record<string, unknown>;
      const oauthObj =
        rawOauth && typeof rawOauth === "object" ? (rawOauth as TemplateOauth) : undefined;
      let urlHost = "";
      let urlPath = "";

      if (apiUrl) {
        try {
          const url = new URL(apiUrl);
          urlHost = `${url.protocol}//${url.host}`;
          urlPath = url.pathname;
        } catch {
          urlHost = apiUrl;
          urlPath = "";
        }
      }
      let snakeCaseOauth: Record<string, any> = {};
      if (oauthObj?.authUrl) {
        snakeCaseOauth["auth_url"] = oauthObj.authUrl;
      }
      if (oauthObj?.tokenUrl) {
        snakeCaseOauth["token_url"] = oauthObj.tokenUrl;
      }
      if (oauthObj?.scopes) {
        snakeCaseOauth["scopes"] = oauthObj.scopes;
      }
      if (oauthObj?.client_id) {
        snakeCaseOauth["client_id"] = oauthObj.client_id;
      }
      if (oauthObj?.grant_type) {
        snakeCaseOauth["grant_type"] = oauthObj.grant_type;
      }

      templates.push({
        ...rest,
        urlHost,
        urlPath,
        oauth: snakeCaseOauth,
      } as any);
    }
  }
  const success_suggestion =
    "Use the template data when calling 'create_system'. Check if template.oauth.client_id exists - if yes, Superglue OAuth is available. If no client_id, ask user for OAuth credentials.";
  const no_templates_suggestion =
    "No system templates found - you can still create a new system using 'create_system'. If some parameters are unclear, use the 'web_search' tool to search for more information and ask the user for clarification";
  return {
    templates: templates,
    suggestion: templates.length > 0 ? success_suggestion : no_templates_suggestion,
  };
};

export const editPayloadDefinition = (): ToolDefinition => ({
  name: "edit_payload",
  description: `
    <use_case>
      Edits the test payload JSON used when running the tool in the playground.
      Use this to modify, add, or remove fields from the payload.
    </use_case>

    <important_notes>
      - This only affects the test payload in the playground, not the tool configuration itself.
      - Provide the complete new payload JSON - it will replace the existing payload entirely.
      - Use this when the user wants to change input data for testing the tool.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      newPayload: {
        type: "string",
        description:
          "The complete new payload as a JSON string. This will replace the existing payload.",
      },
    },
    required: ["newPayload"],
  },
});

export const runEditPayload = async (args: { newPayload: string }) => {
  return {
    success: true,
    newPayload: args.newPayload,
    note: "Payload edit pending approval. Apply the change in the playground.",
  };
};

export const getRunsDefinition = (): ToolDefinition => ({
  name: "get_runs",
  description: `
    <use_case>
      Fetches recent run history for a tool. Use this to debug webhook payload mismatches by inspecting what payloads were actually received.
    </use_case>

    <important_notes>
      - Returns recent runs including toolPayload (the actual input received)
      - Useful for debugging when a webhook-triggered tool fails due to unexpected payload format
      - Compare the returned toolPayload against the tool's inputSchema to identify mismatches
      - Can filter by status (running, success, failed, aborted)
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        description: "The ID of the tool to fetch runs for",
      },
      limit: {
        type: "number",
        description: "Maximum number of runs to return (default: 10, max: 50)",
      },
      status: {
        type: "string",
        enum: ["running", "success", "failed", "aborted"],
        description: "Filter runs by status",
      },
    },
    required: ["toolId"],
  },
});

export const runGetRuns = async (
  args: { toolId: string; limit?: number; status?: string },
  client: SuperglueClient,
) => {
  const { toolId, limit = 10, status } = args;
  const cappedLimit = Math.min(limit, 50);

  try {
    const result = await client.listRuns(cappedLimit, 0, toolId);

    // Filter by status if provided
    let runs = result.items;
    if (status) {
      runs = runs.filter((r) => r.status?.toLowerCase() === status.toLowerCase());
    }

    // Map to a simplified format with the key info for debugging
    const simplifiedRuns = runs.map((run) => ({
      runId: run.id,
      status: run.status,
      requestSource: run.requestSource,
      toolPayload: run.toolPayload,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    }));

    return {
      success: true,
      toolId,
      total: result.total,
      runs: simplifiedRuns,
      note:
        simplifiedRuns.length > 0
          ? "Check toolPayload field to see what was actually received. Compare against the tool's inputSchema to identify mismatches."
          : "No runs found for this tool.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Check that the tool ID exists",
    };
  }
};
