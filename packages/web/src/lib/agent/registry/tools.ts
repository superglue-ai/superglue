import { setFileUploadDocumentationURL } from "@/src/lib/file-utils";
import {
  CallEndpointArgs,
  CallEndpointResult,
  ConfirmationAction,
  SelfHealingMode,
  ToolResult,
  UpsertMode,
} from "@superglue/shared";
import { SystemConfig, systems, findTemplateForSystem } from "@superglue/shared/templates";
import { DraftLookup, findDraftInMessages, formatDiffSummary } from "../agent-context";
import {
  filterSystemFields,
  resolveDocumentationFiles,
  resolvePayloadWithFiles,
  stripLegacyToolFields,
  truncateResponseBody,
  validateDraftOrToolId,
  validateRequiredFields,
} from "../agent-helpers";
import {
  CALL_ENDPOINT_CONFIRMATION,
  EDIT_TOOL_CONFIRMATION,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistryEntry,
} from "../agent-types";

export const TOOL_CONTINUATION_MESSAGES = {
  call_endpoint: {
    confirmed:
      "[USER ACTION] The user confirmed an HTTP request. Analyze the results and respond to the user.",
    declined:
      "[USER ACTION] The user declined an HTTP request. Acknowledge this and ask if they want to proceed differently or if there's anything else you can help with.",
  },
  edit_tool: {
    confirmed:
      "[USER ACTION] The user approved the tool edit changes. The changes have been applied to the tool configuration. Briefly confirm the edit was applied. Do NOT call run_tool unless the user explicitly asks to run/test again.",
    declined:
      "[USER ACTION] The user rejected the tool edit changes. Ask what they would like to change or if they want to try a different approach.",
    partial:
      "[USER ACTION] The user PARTIALLY approved the tool edit. IMPORTANT: Check the tool output for 'appliedChanges' (changes that WERE applied) and 'rejectedChanges' (changes the user rejected). Only report the applied changes as successful. Acknowledge which changes were rejected. Do NOT call run_tool unless the user explicitly asks.",
  },
  edit_payload: {
    confirmed:
      "[USER ACTION] The user approved the payload edit. The payload has been updated in the playground.",
    declined:
      "[USER ACTION] The user rejected the payload edit. Ask what they would like to change or if they want to try a different approach.",
  },
};

const buildToolDefinition = (): ToolDefinition => ({
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
      - Use file::<key> in payload values to reference uploaded files (gets replaced with actual parsed content)
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
      payload: {
        type: "object",
        description:
          'Sample JSON payload for the tool. Use file::<key> syntax for file references (e.g., { "data": "file::my_csv" })',
      },
      responseSchema: {
        type: "object",
        description: "JSONSchema for the expected output structure",
      },
    },
    required: ["instruction", "systemIds"],
  },
});

const runBuildTool = async (input: any, ctx: ToolExecutionContext) => {
  const { instruction, systemIds, payload, responseSchema } = input;

  const fileResult = resolvePayloadWithFiles(payload, ctx.filePayloads);
  if (!fileResult.success) {
    return { success: false, ...fileResult };
  }
  const resolvedPayload = fileResult.resolved;

  try {
    const builtTool = await ctx.superglueClient.buildWorkflow({
      instruction,
      systemIds,
      payload: resolvedPayload,
      responseSchema,
      save: false,
    });

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

const runToolDefinition = (): ToolDefinition => ({
  name: "run_tool",
  description: `
    <use_case>
      Executes a tool - either a draft (by draftId) or a saved tool (by toolId).
    </use_case>

    <important_notes>
      - Provide either draftId (for drafts from build_tool) OR toolId (for saved tools), not both.
      - If execution fails, the error is stored in the draft for use with edit_tool.
      - Use file::<key> in payload values to reference uploaded files (e.g., { "data": "file::my_csv" })
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of a draft tool (from build_tool)" },
      toolId: { type: "string", description: "ID of a saved tool" },
      payload: {
        type: "object",
        description:
          "JSON payload to pass to the tool. Use file::<key> syntax for file references.",
      },
    },
  },
});

const runRunTool = async (input: any, ctx: ToolExecutionContext) => {
  const { draftId, toolId, payload } = input;

  const idValidation = validateDraftOrToolId(draftId, toolId);
  if (idValidation.valid === false) {
    return { success: false, error: idValidation.error, suggestion: idValidation.suggestion };
  }

  const fileResult = resolvePayloadWithFiles(payload, ctx.filePayloads);
  if (!fileResult.success) {
    return { success: false, ...fileResult };
  }
  const resolvedPayload = fileResult.resolved;

  let toolConfig: any;
  let inputSchema: any;
  let isDraft = false;

  if (toolId) {
    try {
      toolConfig = await ctx.superglueClient.getWorkflow(toolId);
      inputSchema = toolConfig?.inputSchema?.properties?.payload;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        suggestion: "Check that the tool ID exists and all required credentials are provided",
      };
    }
  } else {
    const draft = findDraftInMessages(ctx.messages || [], draftId);
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

  const validation = validateRequiredFields(inputSchema, resolvedPayload);
  if (validation.valid === false) {
    const { missingFields, schema } = validation;
    return {
      success: false,
      ...(isDraft ? { draftId } : {}),
      error: `Missing required input fields: ${missingFields.join(", ")}`,
      config: stripLegacyToolFields(toolConfig),
      inputSchema: schema,
      providedPayload: resolvedPayload,
      suggestion: `This tool requires the following inputs: ${JSON.stringify(schema.properties || {}, null, 2)}. Please provide values for: ${missingFields.join(", ")}`,
    };
  }

  const traceId = isDraft ? crypto.randomUUID() : undefined;
  if (isDraft && ctx.logCallback && traceId) {
    ctx.logCallback(`TOOL_CALL_UPDATE:run_tool:TRACE_ID:${traceId}`);
  }

  try {
    const result: ToolResult = await ctx.superglueClient.executeWorkflow(
      isDraft
        ? {
            tool: toolConfig,
            payload: resolvedPayload,
            options: { selfHealing: SelfHealingMode.DISABLED, testMode: false, retries: 0 },
            traceId,
          }
        : {
            id: toolId,
            payload: resolvedPayload,
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

const editToolDefinition = (): ToolDefinition => ({
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
      - CRITICAL: You MUST include the payload parameter with the exact same test data that was used in build_tool. Copy it from the build_tool call in the conversation history. Without this payload, users cannot test the fixed tool. Use an empty object {} only if the tool genuinely requires no input.
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
        description:
          "CRITICAL: Copy the exact payload from the build_tool call. Users need this to test the fixed tool.",
      },
    },
    required: ["fixInstructions", "payload"],
  },
});

const editToolDefinitionPlayground = (): ToolDefinition => ({
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

const runEditTool = async (input: any, ctx: ToolExecutionContext) => {
  const { draftId, toolId, fixInstructions } = input;

  const idValidation = validateDraftOrToolId(draftId, toolId);
  if (idValidation.valid === false) {
    return { success: false, error: idValidation.error, suggestion: idValidation.suggestion };
  }

  let draft: DraftLookup | null = null;
  let workingDraftId = draftId;

  if (toolId) {
    try {
      const savedTool = await ctx.superglueClient.getWorkflow(toolId);
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
    draft = findDraftInMessages(ctx.messages || [], draftId);
  }

  if (!draft) {
    return {
      success: false,
      error: `Draft not found: ${workingDraftId}`,
      suggestion: "Draft not found in conversation history. Use build_tool to create a new draft.",
    };
  }

  try {
    const fixResult = await ctx.superglueClient.fixWorkflow({
      tool: draft.config,
      fixInstructions,
      systemIds: draft.systemIds,
    });

    const fixedToolForStorage = stripLegacyToolFields({
      ...fixResult.tool,
      instruction: draft.instruction,
    });

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
  input: any,
  output: any,
  _ctx: ToolExecutionContext,
): Promise<{ output: string; status: "completed" | "declined" }> => {
  let parsedOutput;
  try {
    parsedOutput = typeof output === "string" ? JSON.parse(output) : output;
  } catch {
    return { output: JSON.stringify(output), status: "completed" };
  }

  if (!parsedOutput.confirmationState) {
    return { output: JSON.stringify(parsedOutput), status: "completed" };
  }

  if (parsedOutput.confirmationState === EDIT_TOOL_CONFIRMATION.CONFIRMED) {
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: true,
        message: "All changes approved and applied.",
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === EDIT_TOOL_CONFIRMATION.PARTIAL) {
    const approvedSummaries = (parsedOutput.approvedDiffs || []).map((d: any) =>
      formatDiffSummary(d),
    );
    const rejectedSummaries = (parsedOutput.rejectedDiffs || []).map((d: any) =>
      formatDiffSummary(d),
    );

    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: true,
        partialApproval: true,
        message: `User PARTIALLY approved: ${parsedOutput.approvedDiffs?.length || 0} change(s) APPLIED, ${parsedOutput.rejectedDiffs?.length || 0} REJECTED.`,
        appliedChanges: approvedSummaries,
        rejectedChanges: rejectedSummaries,
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === EDIT_TOOL_CONFIRMATION.DECLINED) {
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: false,
        rejected: true,
        message: "All changes rejected by user.",
      }),
      status: "declined",
    };
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
};

const saveToolDefinition = (): ToolDefinition => ({
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

const runSaveTool = async (input: any, ctx: ToolExecutionContext) => {
  const { draftId, id } = input;

  const draft = findDraftInMessages(ctx.messages || [], draftId);
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

    const savedTool = await ctx.superglueClient.upsertWorkflow(toolId, toolToSave);

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

const createSystemDefinition = (): ToolDefinition => ({
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
      metadata: {
        type: "object",
        description:
          "Optional metadata object for storing additional system information such as capabilities, systemDetails and possible tools that can be built with this system.",
      },
    },
    required: ["id", "credentials"],
  },
});

const runCreateSystem = async (input: any, ctx: ToolExecutionContext) => {
  let { templateId, ...systemInput } = input;

  if (templateId) {
    const template = systems[templateId];
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`,
        suggestion: `Available templates: ${Object.keys(systems).join(", ")}`,
      };
    }

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

    const oauthCreds: Record<string, any> = {};
    if (template.oauth) {
      if (template.oauth.authUrl) oauthCreds.auth_url = template.oauth.authUrl;
      if (template.oauth.tokenUrl) oauthCreds.token_url = template.oauth.tokenUrl;
      if (template.oauth.scopes) oauthCreds.scopes = template.oauth.scopes;
      if (template.oauth.client_id) oauthCreds.client_id = template.oauth.client_id;
      if (template.oauth.grant_type) oauthCreds.grant_type = template.oauth.grant_type;
    }

    systemInput = {
      name: template.name,
      urlHost,
      urlPath,
      documentationUrl: template.docsUrl,
      documentationKeywords: template.keywords,
      templateName: templateId,
      ...systemInput,
      credentials: { ...oauthCreds, ...systemInput.credentials },
    };
  }

  const docResult = resolveDocumentationFiles(
    systemInput.documentation,
    ctx.filePayloads,
    setFileUploadDocumentationURL,
  );
  if ("error" in docResult) {
    return {
      success: false,
      error: docResult.error,
      suggestion:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }
  if (docResult.documentation !== undefined) {
    systemInput.documentation = docResult.documentation;
  }
  if (docResult.documentationUrl) {
    systemInput.documentationUrl = docResult.documentationUrl;
  }

  try {
    const result = await ctx.superglueClient.upsertSystem(
      systemInput.id,
      systemInput,
      UpsertMode.UPSERT,
    );
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

const modifySystemDefinition = (): ToolDefinition => ({
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
      - Files persist for the entire conversation session (until page refresh or new conversation)
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

const runModifySystem = async (input: any, ctx: ToolExecutionContext) => {
  let { ...systemInput } = input;

  const docResult = resolveDocumentationFiles(
    systemInput.documentation,
    ctx.filePayloads,
    setFileUploadDocumentationURL,
  );
  if ("error" in docResult) {
    return {
      success: false,
      error: docResult.error,
      suggestion:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }
  if (docResult.documentation !== undefined) {
    systemInput.documentation = docResult.documentation;
  }
  if (docResult.documentationUrl) {
    systemInput.documentationUrl = docResult.documentationUrl;
  }

  try {
    const result = await ctx.superglueClient.upsertSystem(
      systemInput.id,
      systemInput,
      UpsertMode.UPDATE,
    );
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

const callEndpointDefinition = (): ToolDefinition => ({
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

const runCallEndpoint = async (
  request: CallEndpointArgs,
  ctx: ToolExecutionContext,
): Promise<CallEndpointResult> => {
  const { systemId, method, url, headers, body, timeout } = request;

  try {
    return await ctx.superglueClient.callEndpoint({
      systemId,
      method,
      url,
      headers,
      body,
      timeout,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
};

const processCallEndpointConfirmation = async (
  input: any,
  output: any,
  ctx: ToolExecutionContext,
): Promise<{ output: string; status: "completed" | "declined" }> => {
  let parsedOutput;
  try {
    parsedOutput = typeof output === "string" ? JSON.parse(output) : output;
  } catch {
    return { output: JSON.stringify(output), status: "completed" };
  }

  if (!parsedOutput.confirmationState) {
    return { output: JSON.stringify(parsedOutput), status: "completed" };
  }

  if (parsedOutput.confirmationState === CALL_ENDPOINT_CONFIRMATION.CONFIRMED) {
    try {
      const realResult = await runCallEndpoint(input, ctx);
      return { output: JSON.stringify(truncateResponseBody(realResult)), status: "completed" };
    } catch (error: any) {
      const errorResult = {
        success: false,
        error: error.message || "Request failed",
        duration: 0,
      };
      return { output: JSON.stringify(errorResult), status: "completed" };
    }
  } else if (parsedOutput.confirmationState === CALL_ENDPOINT_CONFIRMATION.DECLINED) {
    const cancelOutput = JSON.stringify({
      success: false,
      cancelled: true,
      message: "Request declined by user",
    });
    return { output: cancelOutput, status: "declined" };
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
};

const searchDocumentationDefinition = (): ToolDefinition => ({
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

const runSearchDocumentation = async (input: any, ctx: ToolExecutionContext) => {
  const { systemId, keywords } = input;

  try {
    const result = await ctx.superglueClient.searchSystemDocumentation(systemId, keywords);

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

const authenticateOAuthDefinition = (): ToolDefinition => ({
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
      3. Values from templates (slack, salesforce, asana, notion, airtable, jira, confluence)
      
      If the system already has client_id/client_secret stored in credentials,
      you do NOT need to ask the user again - just call this tool with only systemId and scopes.
    </credential_resolution>

    <templates_with_preconfigured_oauth>
      ONLY these templates have client_id pre-configured (Superglue OAuth):
      - slack: auth_url=https://slack.com/oauth/v2/authorize, token_url=https://slack.com/api/oauth.v2.access
      - salesforce: auth_url=https://login.salesforce.com/services/oauth2/authorize, token_url=https://login.salesforce.com/services/oauth2/token
      - asana: auth_url=https://app.asana.com/-/oauth_authorize, token_url=https://app.asana.com/-/oauth_token
      - notion: auth_url=https://api.notion.com/v1/oauth/authorize, token_url=https://api.notion.com/v1/oauth/token
      - airtable: auth_url=https://airtable.com/oauth2/v1/authorize, token_url=https://airtable.com/oauth2/v1/token
      - jira: auth_url=https://auth.atlassian.com/authorize, token_url=https://auth.atlassian.com/oauth/token
      - confluence: auth_url=https://auth.atlassian.com/authorize, token_url=https://auth.atlassian.com/oauth/token
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

const runAuthenticateOAuth = async (input: any, ctx: ToolExecutionContext) => {
  const { systemId, scopes, client_id, client_secret, auth_url, token_url, grant_type } = input;

  try {
    const system = await ctx.superglueClient.getSystem(systemId);
    if (!system) {
      return {
        success: false,
        error: `System '${systemId}' not found`,
        suggestion: "Create the system first using create_system",
      };
    }

    // Check if this system matches a template with OAuth configured
    const templateMatch = findTemplateForSystem(system);
    const template = templateMatch?.template || systems[systemId];
    const templateOAuth = template?.oauth;

    const oauthConfig: Record<string, any> = {
      grant_type:
        grant_type ||
        system.credentials?.grant_type ||
        templateOAuth?.grant_type ||
        "authorization_code",
    };

    if (scopes) oauthConfig.scopes = scopes;
    else if (system.credentials?.scopes) oauthConfig.scopes = system.credentials.scopes;
    else if (templateOAuth?.scopes) oauthConfig.scopes = templateOAuth.scopes;

    if (client_id) oauthConfig.client_id = client_id;
    else if (system.credentials?.client_id) oauthConfig.client_id = system.credentials.client_id;
    else if (templateOAuth?.client_id) oauthConfig.client_id = templateOAuth.client_id;

    // Priority: user input > stored system credentials > template
    // If user provided client_secret, use it (will be cached)
    // If not provided but system has it stored, use it (will be cached)
    // If neither, and template has client_id, backend will resolve template client_secret
    if (client_secret) {
      oauthConfig.client_secret = client_secret;
    } else if (system.credentials?.client_secret) {
      oauthConfig.client_secret = system.credentials.client_secret;
    }
    // Note: If no client_secret is set here, and template has client_id,
    // the frontend will set templateInfo and backend will resolve template credentials

    if (auth_url) oauthConfig.auth_url = auth_url;
    else if (system.credentials?.auth_url) oauthConfig.auth_url = system.credentials.auth_url;
    else if (templateOAuth?.authUrl) oauthConfig.auth_url = templateOAuth.authUrl;

    if (token_url) oauthConfig.token_url = token_url;
    else if (system.credentials?.token_url) oauthConfig.token_url = system.credentials.token_url;
    else if (templateOAuth?.tokenUrl) oauthConfig.token_url = templateOAuth.tokenUrl;

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

const findSystemTemplatesDefinition = (): ToolDefinition => ({
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

const runFindSystemTemplates = async (input: any, _ctx: ToolExecutionContext) => {
  const { system_names } = input;
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

const editPayloadDefinition = (): ToolDefinition => ({
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

const runEditPayload = async (input: { newPayload: string }, _ctx: ToolExecutionContext) => {
  return {
    success: true,
    newPayload: input.newPayload,
    note: "Payload edit pending approval. Apply the change in the playground.",
  };
};

const processEditPayloadConfirmation = async (
  _input: any,
  output: any,
  _ctx: ToolExecutionContext,
): Promise<{ output: string; status: "completed" | "declined" }> => {
  let parsedOutput;
  try {
    parsedOutput = typeof output === "string" ? JSON.parse(output) : output;
  } catch {
    return { output: JSON.stringify(output), status: "completed" };
  }

  if (parsedOutput.confirmationState === EDIT_TOOL_CONFIRMATION.CONFIRMED) {
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: true,
        message: "Payload edit approved and applied.",
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === EDIT_TOOL_CONFIRMATION.DECLINED) {
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: false,
        rejected: true,
        message: "Payload edit rejected by user.",
      }),
      status: "declined",
    };
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
};

const getRunsDefinition = (): ToolDefinition => ({
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

const runGetRuns = async (
  input: { toolId: string; limit?: number; status?: string },
  ctx: ToolExecutionContext,
) => {
  const { toolId, limit = 10, status } = input;
  const cappedLimit = Math.min(limit, 50);

  try {
    const result = await ctx.superglueClient.listRuns(cappedLimit, 0, toolId);

    let runs = result.items;
    if (status) {
      runs = runs.filter((r) => r.status?.toLowerCase() === status.toLowerCase());
    }

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

const findToolDefinition = (): ToolDefinition => ({
  name: "find_tool",
  description: `Look up an existing tool by ID or search for tools by query.
<use_case>Use when you need to see the full configuration of an existing tool, or find tools matching a description.</use_case>`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Exact tool ID to look up" },
      query: { type: "string", description: "Search query to find matching tools" },
    },
  },
});

const runFindTool = async (
  input: { id?: string; query?: string },
  ctx: ToolExecutionContext,
): Promise<any> => {
  if (!input.id && !input.query) {
    return { success: false, error: "Provide either id or query" };
  }
  if (input.id) {
    const tool = await ctx.superglueClient.getWorkflow(input.id);
    return { success: true, tool };
  }
  const tools = await ctx.superglueClient.findRelevantTools(input.query);
  return { success: true, tools };
};

const findSystemDefinition = (): ToolDefinition => ({
  name: "find_system",
  description: `Look up an existing system by ID or search for systems by query.
<use_case>Use when you need to see the full configuration of an existing system, or find systems matching a description.</use_case>`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Exact system ID to look up" },
      query: { type: "string", description: "Search query to find matching systems" },
    },
  },
});

const runFindSystem = async (
  input: { id?: string; query?: string },
  ctx: ToolExecutionContext,
): Promise<any> => {
  if (!input.id && !input.query) {
    return { success: false, error: "Provide either id or query" };
  }
  if (input.id) {
    const system = await ctx.superglueClient.getSystem(input.id);
    return { success: true, system };
  }
  const { items } = await ctx.superglueClient.listSystems(100);
  const query = input.query!.toLowerCase();
  const keywords = query.split(/\s+/).filter((k) => k.length > 0);
  const filtered = items.filter((s) => {
    const text = [s.id, s.urlHost, s.documentation].filter(Boolean).join(" ").toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
  return { success: true, systems: filtered };
};

export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  build_tool: {
    name: "build_tool",
    definition: buildToolDefinition,
    execute: runBuildTool,
  },
  run_tool: {
    name: "run_tool",
    definition: runToolDefinition,
    execute: runRunTool,
  },
  edit_tool: {
    name: "edit_tool",
    definition: editToolDefinition,
    execute: runEditTool,
    confirmation: {
      timing: "after",
      validActions: [
        ConfirmationAction.CONFIRMED,
        ConfirmationAction.DECLINED,
        ConfirmationAction.PARTIAL,
      ],
      processConfirmation: processEditToolConfirmation,
    },
  },
  edit_tool_playground: {
    name: "edit_tool",
    definition: editToolDefinitionPlayground,
    execute: runEditTool,
    confirmation: {
      timing: "after",
      validActions: [
        ConfirmationAction.CONFIRMED,
        ConfirmationAction.DECLINED,
        ConfirmationAction.PARTIAL,
      ],
      processConfirmation: processEditToolConfirmation,
    },
  },
  save_tool: {
    name: "save_tool",
    definition: saveToolDefinition,
    execute: runSaveTool,
  },
  create_system: {
    name: "create_system",
    definition: createSystemDefinition,
    execute: runCreateSystem,
  },
  modify_system: {
    name: "modify_system",
    definition: modifySystemDefinition,
    execute: runModifySystem,
  },
  call_endpoint: {
    name: "call_endpoint",
    definition: callEndpointDefinition,
    execute: async (input: any, ctx: ToolExecutionContext) => {
      const { shouldAutoExecute } = processToolPolicy("call_endpoint", input, ctx);

      if (shouldAutoExecute) {
        const result = await runCallEndpoint(input, ctx);
        return truncateResponseBody(result);
      }

      return {
        confirmationState: CALL_ENDPOINT_CONFIRMATION.PENDING,
        request: {
          method: input.method,
          url: input.url,
          headers: input.headers,
          body: input.body,
          systemId: input.systemId,
        },
      };
    },
    confirmation: {
      timing: "before",
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      processConfirmation: processCallEndpointConfirmation,
    },
  },
  search_documentation: {
    name: "search_documentation",
    definition: searchDocumentationDefinition,
    execute: runSearchDocumentation,
  },
  authenticate_oauth: {
    name: "authenticate_oauth",
    definition: authenticateOAuthDefinition,
    execute: runAuthenticateOAuth,
  },
  find_system_templates: {
    name: "find_system_templates",
    definition: findSystemTemplatesDefinition,
    execute: runFindSystemTemplates,
  },
  edit_payload: {
    name: "edit_payload",
    definition: editPayloadDefinition,
    execute: runEditPayload,
    confirmation: {
      timing: "after",
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      processConfirmation: processEditPayloadConfirmation,
    },
  },
  get_runs: {
    name: "get_runs",
    definition: getRunsDefinition,
    execute: runGetRuns,
  },
  find_tool: {
    name: "find_tool",
    definition: findToolDefinition,
    execute: runFindTool,
  },
  find_system: {
    name: "find_system",
    definition: findSystemDefinition,
    execute: runFindSystem,
  },
};

export const AGENT_TOOL_SET = [
  "build_tool",
  "run_tool",
  "edit_tool",
  "save_tool",
  "create_system",
  "modify_system",
  "search_documentation",
  "call_endpoint",
  "authenticate_oauth",
  "get_runs",
  "find_system_templates",
  "find_tool",
  "find_system",
];

export const PLAYGROUND_TOOL_SET = [
  "edit_tool_playground",
  "edit_payload",
  "search_documentation",
  "call_endpoint",
  "modify_system",
  "authenticate_oauth",
  "find_tool",
  "find_system",
];
