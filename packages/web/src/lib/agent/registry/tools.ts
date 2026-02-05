import { setFileUploadDocumentationURL } from "@/src/lib/file-utils";
import { truncateToolResult } from "@/src/lib/general-utils";
import { ConfirmationAction, ToolResult, UpsertMode, getToolSystemIds } from "@superglue/shared";
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
  getProtocol,
} from "../agent-helpers";
import {
  EDIT_TOOL_CONFIRMATION,
  SYSTEM_UPSERT_CONFIRMATION,
  CALL_SYSTEM_CONFIRMATION,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistryEntry,
  CallSystemArgs,
  CallSystemResult,
} from "../agent-types";
import { processToolPolicy } from "./tool-policies";

export const TOOL_CONTINUATION_MESSAGES = {
  call_system: {
    confirmed:
      "[USER ACTION] The user confirmed a system call. Analyze the results and respond to the user.",
    declined:
      "[USER ACTION] The user declined a system call. Acknowledge this and ask if they want to proceed differently or if there's anything else you can help with.",
  },
  edit_tool: {
    confirmed:
      "[USER ACTION] The user approved the tool edit changes. The changes have been applied to the tool configuration. Briefly confirm the edit was applied and remind the user they can save the tool if they want to persist these changes. Do NOT call run_tool unless the user explicitly asks to run/test again.",
    declined:
      "[USER ACTION] The user rejected the tool edit changes. Ask what they would like to change or if they want to try a different approach.",
    partial:
      "[USER ACTION] The user PARTIALLY approved the tool edit. IMPORTANT: Check the tool output for 'appliedChanges' (changes that WERE applied) and 'rejectedChanges' (changes the user rejected). Only report the applied changes as successful. Acknowledge which changes were rejected and remind the user they can save the tool if they want to persist the applied changes. Do NOT call run_tool unless the user explicitly asks.",
  },
  edit_payload: {
    confirmed:
      "[USER ACTION] The user approved the payload edit. The payload has been updated in the playground.",
    declined:
      "[USER ACTION] The user rejected the payload edit. Ask what they would like to change or if they want to try a different approach.",
  },
  create_system: {
    confirmed:
      "[USER ACTION] The user provided credentials and confirmed system creation. The system has been created successfully. Briefly confirm and ask if they want to test the system with call_system.",
    declined:
      "[USER ACTION] The user declined system creation. Ask if they want to modify the configuration or if there's anything else you can help with.",
  },
  edit_system: {
    confirmed:
      "[USER ACTION] The user provided credentials and confirmed the system edit. The changes have been applied. Briefly confirm and ask if they want to test the system with call_system.",
    declined:
      "[USER ACTION] The user declined the system edit. Ask what they would like to change or if there's anything else you can help with.",
  },
  authenticate_oauth: {
    confirmed:
      "[USER ACTION] The user provided OAuth credentials. Proceed with the OAuth authentication flow. The user will need to complete the OAuth flow in the UI.",
    declined:
      "[USER ACTION] The user declined to provide OAuth credentials. Ask if they want to use a different authentication method or if there's anything else you can help with.",
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
      outputSchema: {
        type: "object",
        description: "JSONSchema for the expected output structure",
      },
    },
    required: ["instruction", "systemIds"],
  },
});

const runBuildTool = async (input: any, ctx: ToolExecutionContext) => {
  const { instruction, systemIds, payload, outputSchema } = input;

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
      outputSchema,
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
    const result: ToolResult = isDraft
      ? await ctx.superglueClient.runToolConfig({
          tool: toolConfig,
          payload: resolvedPayload,
          options: { timeout: undefined }, // retries not supported in REST
        })
      : await ctx.superglueClient.runTool({
          toolId: toolId!,
          payload: resolvedPayload,
        });

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
      - Provide specific fix instructions (e.g., "change the endpoint to /v2/users", "remove extra fields from outputTransform", "fix the response schema mapping").
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
      const systemIds = getToolSystemIds(savedTool);
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

    const apiEndpoint = ctx.superglueClient.apiEndpoint || "https://api.superglue.cloud";
    return {
      success: true,
      toolId: savedTool.id,
      webhookUrl: `${apiEndpoint}/v1/hooks/${savedTool.id}?token=YOUR_API_KEY`,
      note: `Tool "${savedTool.id}" saved successfully. You can now execute it using run_tool with toolId. If this is a tool that you want to trigger from external services, you can use the webhook URL to trigger it.`,
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
      - For OAuth auth: create the system first, then call authenticate_oauth to trigger the OAuth flow.
      - Providing a documentationUrl will trigger asynchronous API documentation processing.
      - For documentation field, you can provide raw documentation text OR use file::filename to reference uploaded files.
      - When users mention API constraints (rate limits, special endpoints, auth requirements, etc.), capture them in 'specificInstructions'.
    </important_notes>
    
    <credential_handling>
      - Use 'credentials' for NON-SENSITIVE config: client_id, auth_url, token_url, scopes, grant_type, redirect_uri
      - Use 'sensitiveCredentials' for SECRETS that require user input: { api_key: true, client_secret: true }
      - When sensitiveCredentials is set, a secure UI appears for users to enter the actual values
      - NEVER ask users to paste secrets in chat - always use sensitiveCredentials instead
      - Example: For API key auth, use sensitiveCredentials: { api_key: true }
    </credential_handling>`,
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
          "Non-sensitive credentials only: client_id, auth_url, token_url, scopes, grant_type, redirect_uri. Do NOT include secrets here.",
      },
      sensitiveCredentials: {
        type: "object",
        description:
          "Sensitive credentials requiring secure user input. Set field to true to request it. Example: { api_key: true, client_secret: true }. A secure UI will appear for users to enter values.",
      },
      metadata: {
        type: "object",
        description:
          "Optional metadata object for storing additional system information such as capabilities, systemDetails and possible tools that can be built with this system.",
      },
    },
    required: ["id"],
  },
});

const runCreateSystem = async (input: any, ctx: ToolExecutionContext) => {
  let { templateId, sensitiveCredentials, ...systemInput } = input;

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

  if (sensitiveCredentials && Object.keys(sensitiveCredentials).length > 0) {
    return {
      confirmationState: SYSTEM_UPSERT_CONFIRMATION.PENDING,
      systemConfig: systemInput,
      requiredSensitiveFields: Object.keys(sensitiveCredentials),
    };
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

const processCreateSystemConfirmation = async (
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

  if (parsedOutput.confirmationState === SYSTEM_UPSERT_CONFIRMATION.CONFIRMED) {
    const confirmationData = parsedOutput.confirmationData || parsedOutput;
    const systemConfig = confirmationData.systemConfig || parsedOutput.systemConfig;
    const userProvidedCredentials =
      confirmationData.userProvidedCredentials || parsedOutput.userProvidedCredentials || {};

    if (!systemConfig || !systemConfig.id) {
      return {
        output: JSON.stringify({
          success: false,
          error: "Missing system configuration",
          suggestion: "System configuration is required to create the system.",
        }),
        status: "completed",
      };
    }

    const finalCredentials = {
      ...(systemConfig.credentials || {}),
      ...userProvidedCredentials,
    };

    const { sensitiveCredentials: _, ...cleanSystemConfig } = systemConfig;

    try {
      const result = await ctx.superglueClient.upsertSystem(
        cleanSystemConfig.id,
        { ...cleanSystemConfig, credentials: finalCredentials },
        UpsertMode.UPSERT,
      );
      return {
        output: JSON.stringify({ success: true, system: filterSystemFields(result) }),
        status: "completed",
      };
    } catch (error: any) {
      return {
        output: JSON.stringify({
          success: false,
          error: error.message,
          suggestion: "Failed to create system. Validate all system inputs and try again.",
        }),
        status: "completed",
      };
    }
  } else if (parsedOutput.confirmationState === SYSTEM_UPSERT_CONFIRMATION.DECLINED) {
    return {
      output: JSON.stringify({
        success: false,
        cancelled: true,
        message: "System creation cancelled by user",
      }),
      status: "declined",
    };
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
};

const editSystemDefinition = (): ToolDefinition => ({
  name: "edit_system",
  description: `
    <use_case>
      Edits an existing system identified by its id. Systems are building blocks for tools and contain the credentials for accessing the API.
      Provide only the id and the fields you want to change. Fields not included will remain unchanged.
    </use_case>

    <important_notes>
      - When users mention API constraints (rate limits, special endpoints, auth requirements, etc.), capture them in 'specificInstructions' to guide tool building.
      - Providing a documentationUrl will trigger asynchronous API documentation processing.
      - For documentation field, you can provide raw documentation text OR use file::filename to reference uploaded files. For multiple files, use comma-separated: file::doc1.pdf,file::doc2.pdf
      - When referencing files in the documentation field, use the exact file key (file::<key>) exactly as shown (e.g., file::my_data_csv). Do NOT use the original filename.
      - Files persist for the entire conversation session (until page refresh or new conversation)
      - When providing files as system documentation input, the files you use will overwrite the current documentation content. Ensure to include ALL required files always, even if the user only asks you to add one.
      - If you provide documentationUrl, include relevant keywords in 'documentationKeywords' to improve documentation search (e.g., endpoint names, data objects, key concepts mentioned in conversation).
    </important_notes>

    <credential_handling>
      - Use 'credentials' for NON-SENSITIVE config: client_id, auth_url, token_url, scopes, grant_type, redirect_uri
      - Use 'sensitiveCredentials' for SECRETS that require user input: { api_key: true, client_secret: true }
      - When sensitiveCredentials is set, a secure UI appears for users to enter the actual values
      - NEVER ask users to paste secrets in chat - always use sensitiveCredentials instead
      - Sensitive credential values you see (like <<masked_api_key>>) are placeholders, not real values
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
        description:
          "Non-sensitive credentials only: client_id, auth_url, token_url, scopes, grant_type, redirect_uri. Do NOT include secrets here.",
      },
      sensitiveCredentials: {
        type: "object",
        description:
          "Sensitive credentials requiring secure user input. Set field to true to request it. Example: { api_key: true }. A secure UI will appear for users to enter values.",
      },
    },
    required: ["id"],
  },
});

const runEditSystem = async (input: any, ctx: ToolExecutionContext) => {
  let { sensitiveCredentials, ...systemInput } = input;

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

  if (sensitiveCredentials && Object.keys(sensitiveCredentials).length > 0) {
    return {
      confirmationState: SYSTEM_UPSERT_CONFIRMATION.PENDING,
      systemConfig: systemInput,
      requiredSensitiveFields: Object.keys(sensitiveCredentials),
    };
  }

  try {
    const result = await ctx.superglueClient.upsertSystem(
      systemInput.id,
      systemInput,
      UpsertMode.UPDATE,
    );
    return {
      success: true,
      systemId: result.id,
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

const processEditSystemConfirmation = async (
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

  if (parsedOutput.confirmationState === SYSTEM_UPSERT_CONFIRMATION.CONFIRMED) {
    const confirmationData = parsedOutput.confirmationData || parsedOutput;
    const systemConfig = confirmationData.systemConfig || parsedOutput.systemConfig;
    const userProvidedCredentials =
      confirmationData.userProvidedCredentials || parsedOutput.userProvidedCredentials || {};

    if (!systemConfig || !systemConfig.id) {
      return {
        output: JSON.stringify({
          success: false,
          error: "Missing system configuration",
          suggestion: "System configuration is required to update the system.",
        }),
        status: "completed",
      };
    }

    const finalCredentials = {
      ...(systemConfig.credentials || {}),
      ...userProvidedCredentials,
    };

    const { sensitiveCredentials: _, ...cleanSystemConfig } = systemConfig;

    try {
      const result = await ctx.superglueClient.upsertSystem(
        cleanSystemConfig.id,
        { ...cleanSystemConfig, credentials: finalCredentials },
        UpsertMode.UPDATE,
      );
      return {
        output: JSON.stringify({
          success: true,
          systemId: result.id,
          system: filterSystemFields(result),
        }),
        status: "completed",
      };
    } catch (error: any) {
      return {
        output: JSON.stringify({
          success: false,
          error: error.message,
          suggestion: "Failed to modify system. Validate all system inputs and try again.",
        }),
        status: "completed",
      };
    }
  } else if (parsedOutput.confirmationState === SYSTEM_UPSERT_CONFIRMATION.DECLINED) {
    return {
      output: JSON.stringify({
        success: false,
        cancelled: true,
        message: "System edit cancelled by user",
      }),
      status: "declined",
    };
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
};

const callSystemDefinition = (): ToolDefinition => ({
  name: "call_system",
  description: `
    <use_case>
      Used to test systems and endpoints before building tools. Use this to explore APIs, databases, and file servers, verify authentication, test endpoints, and examine response formats.
      Perfect for quickly understanding how a system works before building a tool.
    </use_case>

    <important_notes>
      - Supports HTTP/HTTPS URLs for REST APIs
      - Supports postgres:// and postgresql:// URLs for PostgreSQL databases
      - Supports sftp://, ftp://, and ftps:// URLs for file transfer operations
      - Supports credential injection using placeholders: <<system_id_credential_key>>
      - When a systemId is provided, OAuth tokens are automatically refreshed if expired
    </important_notes>

    <http_usage>
      - Supports all HTTP methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
      - Example header with credentials: { "Authorization": "Bearer <<stripe_api_api_key>>" }
    </http_usage>

    <postgres_usage>
      - URL format: postgres://user:password@host:port/database
      - Body should contain JSON with query: {"query": "SELECT * FROM users WHERE id = $1", "params": [123]}
      - Supports parameterized queries for safety
    </postgres_usage>

    <sftp_usage>
      - URL format: sftp://user:password@host:port
      - Body should contain JSON with operation: {"operation": "list", "path": "/data"}
      - Supported operations: list, get, put, delete, rename, mkdir, rmdir, exists, stat
    </sftp_usage>
    `,
  inputSchema: {
    type: "object",
    properties: {
      systemId: {
        type: "string",
        description:
          "Optional system ID for credential injection and automatic OAuth token refresh. Required if using credential placeholders.",
      },
      url: {
        type: "string",
        description:
          "Full URL including protocol. Supports http(s)://, postgres://, postgresql://, sftp://, ftp://, ftps://. Can use <<system_id_credential_key>> for credential injection.",
      },
      method: {
        type: "string",
        description: "HTTP method (only used for HTTP/HTTPS URLs)",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      },
      headers: {
        type: "object",
        description:
          "Optional HTTP headers (only used for HTTP/HTTPS URLs). Can use <<system_id_credential_key>> for credential injection.",
      },
      body: {
        type: "string",
        description:
          "Request body. For HTTP: JSON string for POST/PUT/PATCH. For Postgres: JSON with query and params. For SFTP: JSON with operation and path. Can use <<system_id_credential_key>> for credential injection.",
      },
    },
    required: ["url"],
  },
});

const runCallSystem = async (
  request: CallSystemArgs,
  ctx: ToolExecutionContext,
): Promise<CallSystemResult> => {
  const { systemId, url, method, headers, body } = request;
  const protocol = getProtocol(url);

  try {
    // this split is not strictly necessary, but we need due to backwards compatibility with composeURL() in the tool executor
    const { urlHost, urlPath } =
      protocol === "http" ? splitUrl(url) : { urlHost: url, urlPath: "" };

    const step = {
      id: `call_system_${Date.now()}`,
      config: {
        url,
        method: method || "GET",
        headers,
        body,
        systemId,
      },
    };

    const result = await ctx.superglueClient.executeStep({
      step,
      payload: {},
    });

    return {
      success: result.success,
      protocol,
      data: result.data,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      protocol,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const processCallSystemConfirmation = async (
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

  if (parsedOutput.confirmationState === CALL_SYSTEM_CONFIRMATION.CONFIRMED) {
    try {
      const realResult = await runCallSystem(input, ctx);
      return { output: JSON.stringify(truncateResponseBody(realResult)), status: "completed" };
    } catch (error: any) {
      const errorResult = {
        success: false,
        protocol: getProtocol(input.url),
        error: error.message || "Request failed",
      };
      return { output: JSON.stringify(errorResult), status: "completed" };
    }
  } else if (parsedOutput.confirmationState === CALL_SYSTEM_CONFIRMATION.DECLINED) {
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
      3. Both client_credentials and authorization_code flows are supported
    </use_case>

    <credential_resolution>
      OAuth credentials are resolved in this priority order:
      1. Values passed to this tool (client_id, auth_url, token_url) or via sensitiveCredentials (client_secret)
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
      - notion: auth_url=https://api.notion.com/v1/oauth/authorize, token_url=https://api.notion.com/v1/oauth/token (uses basic_auth + json)
      - airtable: auth_url=https://airtable.com/oauth2/v1/authorize, token_url=https://airtable.com/oauth2/v1/token (uses PKCE + basic_auth)
      - jira: auth_url=https://auth.atlassian.com/authorize, token_url=https://auth.atlassian.com/oauth/token
      - confluence: auth_url=https://auth.atlassian.com/authorize, token_url=https://auth.atlassian.com/oauth/token
    </templates_with_preconfigured_oauth>

    <first_time_setup>
      For FIRST-TIME setup on Google, Microsoft, GitHub, etc. (when credentials are NOT already stored):
      1. Provide client_id directly (non-sensitive)
      2. Use sensitiveCredentials: { client_secret: true } to request the secret via secure UI
      3. Provide the correct auth_url and token_url and other configuration options
    </first_time_setup>

    <credential_handling>
      - client_id, auth_url, token_url, scopes, grant_type are NON-SENSITIVE - pass directly
      - client_secret is SENSITIVE - use sensitiveCredentials: { client_secret: true }
      - NEVER ask users to paste client_secret in chat - use sensitiveCredentials instead
    </credential_handling>

    <important>
      - STOP the conversation after calling - user must complete OAuth in UI
      - client_credentials flow only requires client_id, client_secret, scopes and token_url
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
          "OAuth client ID (non-sensitive) - only needed if not already stored in system credentials or template",
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
      tokenAuthMethod: {
        type: "string",
        enum: ["body", "basic_auth"],
        description:
          "How to send client credentials to token endpoint. 'body' (default) or 'basic_auth' (Authorization header)",
      },
      tokenContentType: {
        type: "string",
        enum: ["form", "json"],
        description:
          "Content-Type for token request. 'form' (default, x-www-form-urlencoded) or 'json' (application/json)",
      },
      usePKCE: {
        type: "boolean",
        description:
          "Enable PKCE flow (Proof Key for Code Exchange). Required by some providers like Airtable, Twitter",
      },
      extraHeaders: {
        type: "object",
        description:
          "Additional headers for token requests, e.g., {'Notion-Version': '2022-06-28'}",
      },
      sensitiveCredentials: {
        type: "object",
        description:
          "Sensitive OAuth credentials requiring secure user input. Set { client_secret: true } if user needs to provide it. A secure UI will appear for users to enter the value.",
      },
    },
    required: ["systemId", "scopes"],
  },
});

const runAuthenticateOAuth = async (input: any, ctx: ToolExecutionContext) => {
  const {
    systemId,
    scopes,
    client_id,
    auth_url,
    token_url,
    grant_type,
    tokenAuthMethod,
    tokenContentType,
    usePKCE,
    extraHeaders,
    sensitiveCredentials,
  } = input;

  try {
    const system = await ctx.superglueClient.getSystem(systemId);
    if (!system) {
      return {
        success: false,
        error: `System '${systemId}' not found`,
        suggestion: "Create the system first using create_system",
      };
    }

    const templateMatch = findTemplateForSystem(system);
    const templateOAuth = templateMatch?.template.oauth;

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

    if (system.credentials?.client_secret) {
      oauthConfig.client_secret = system.credentials.client_secret;
    }

    if (auth_url) oauthConfig.auth_url = auth_url;
    else if (system.credentials?.auth_url) oauthConfig.auth_url = system.credentials.auth_url;
    else if (templateOAuth?.authUrl) oauthConfig.auth_url = templateOAuth.authUrl;

    if (token_url) oauthConfig.token_url = token_url;
    else if (system.credentials?.token_url) oauthConfig.token_url = system.credentials.token_url;
    else if (templateOAuth?.tokenUrl) oauthConfig.token_url = templateOAuth.tokenUrl;

    // Token exchange configuration - agent input > system credentials > template
    if (tokenAuthMethod) oauthConfig.tokenAuthMethod = tokenAuthMethod;
    else if (system.credentials?.tokenAuthMethod)
      oauthConfig.tokenAuthMethod = system.credentials.tokenAuthMethod;
    else if (templateOAuth?.tokenAuthMethod)
      oauthConfig.tokenAuthMethod = templateOAuth.tokenAuthMethod;

    if (tokenContentType) oauthConfig.tokenContentType = tokenContentType;
    else if (system.credentials?.tokenContentType)
      oauthConfig.tokenContentType = system.credentials.tokenContentType;
    else if (templateOAuth?.tokenContentType)
      oauthConfig.tokenContentType = templateOAuth.tokenContentType;

    if (usePKCE !== undefined) oauthConfig.usePKCE = usePKCE;
    else if (system.credentials?.usePKCE !== undefined)
      oauthConfig.usePKCE = system.credentials.usePKCE;
    else if (templateOAuth?.usePKCE) oauthConfig.usePKCE = templateOAuth.usePKCE;

    if (extraHeaders) oauthConfig.extraHeaders = extraHeaders;
    else if (system.credentials?.extraHeaders) {
      // Parse if stored as JSON string
      if (typeof system.credentials.extraHeaders === "string") {
        try {
          oauthConfig.extraHeaders = JSON.parse(system.credentials.extraHeaders);
        } catch {
          // Malformed JSON in stored extraHeaders - skip rather than crash
          console.warn("Failed to parse extraHeaders from credentials, ignoring malformed value");
        }
      } else {
        oauthConfig.extraHeaders = system.credentials.extraHeaders;
      }
    } else if (templateOAuth?.extraHeaders) oauthConfig.extraHeaders = templateOAuth.extraHeaders;

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

    if (sensitiveCredentials && Object.keys(sensitiveCredentials).length > 0) {
      return {
        confirmationState: SYSTEM_UPSERT_CONFIRMATION.PENDING,
        systemId,
        oauthConfig,
        system: filterSystemFields(system),
        requiredSensitiveFields: Object.keys(sensitiveCredentials),
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

const processAuthenticateOAuthConfirmation = async (
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

  if (parsedOutput.confirmationState === SYSTEM_UPSERT_CONFIRMATION.CONFIRMED) {
    const confirmationData = parsedOutput.confirmationData || parsedOutput;
    const systemId = confirmationData.systemId || parsedOutput.systemId;
    const oauthConfig = confirmationData.oauthConfig || parsedOutput.oauthConfig;
    const userProvidedCredentials =
      confirmationData.userProvidedCredentials || parsedOutput.userProvidedCredentials || {};

    const finalOAuthConfig = {
      ...(oauthConfig || {}),
      ...userProvidedCredentials,
    };

    return {
      output: JSON.stringify({
        success: true,
        requiresOAuth: true,
        systemId,
        oauthConfig: finalOAuthConfig,
        message: "OAuth authentication ready. Click the button to authenticate.",
        note: "STOP the conversation here and wait for the user to complete OAuth authentication.",
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === SYSTEM_UPSERT_CONFIRMATION.DECLINED) {
    return {
      output: JSON.stringify({
        success: false,
        cancelled: true,
        message: "OAuth authentication cancelled by user",
      }),
      status: "declined",
    };
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
};

const findSystemTemplatesDefinition = (): ToolDefinition => ({
  name: "find_system_templates",
  description: `
    <use_case>
    This is a silent tool, NEVER mention to the user that you are using this.   
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
      Fetches recent run history. Use this to debug webhook payload mismatches by inspecting what payloads were actually received, or to see recent executions filtered by status or source.
    </use_case>

    <important_notes>
      - Returns recent runs including toolPayload (the actual input received)
      - Useful for debugging when a webhook-triggered tool fails due to unexpected payload format
      - Compare the returned toolPayload against the tool's inputSchema to identify mismatches
      - Can filter by toolId, status (running, success, failed, aborted), or requestSources (api, frontend, scheduler, mcp, tool-chain, webhook)
      - All filters are optional - you can combine them or use none
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        description: "Optional: The ID of a specific tool to fetch runs for",
      },
      limit: {
        type: "number",
        description: "Maximum number of runs to return (default: 10, max: 50)",
      },
      status: {
        type: "string",
        enum: ["running", "success", "failed", "aborted"],
        description: "Optional: Filter runs by status",
      },
      requestSources: {
        type: "array",
        items: {
          type: "string",
          enum: ["api", "frontend", "scheduler", "mcp", "tool-chain", "webhook"],
        },
        description: "Optional: Filter runs by how they were triggered (can specify multiple)",
      },
    },
    required: [],
  },
});

const runGetRuns = async (
  input: { toolId?: string; limit?: number; status?: string; requestSources?: string[] },
  ctx: ToolExecutionContext,
) => {
  const { toolId, limit = 10, status, requestSources } = input;
  const cappedLimit = Math.min(limit, 50);

  try {
    const result = await ctx.superglueClient.listRuns({
      toolId,
      limit: cappedLimit,
      status: status as "running" | "success" | "failed" | "aborted" | undefined,
      requestSources: requestSources as
        | ("api" | "frontend" | "scheduler" | "mcp" | "tool-chain" | "webhook")[]
        | undefined,
    });

    // Map to a simplified format with the key info for debugging
    const simplifiedRuns = result.items.map((run) => ({
      runId: run.runId,
      toolId: run.toolId,
      status: run.status,
      requestSource: run.requestSource,
      toolPayload: run.toolPayload,
      error: run.error,
      metadata: run.metadata,
    }));

    return {
      success: true,
      toolId: toolId || "all",
      total: result.total,
      runs: simplifiedRuns,
      note:
        simplifiedRuns.length > 0
          ? "Check toolPayload field to see what was actually received. Compare against the tool's inputSchema to identify mismatches."
          : "No runs found matching the filters.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Check that the filters are valid",
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

  const maskCredentialsInSystem = (sys: any) => {
    if (!sys?.credentials || Object.keys(sys.credentials).length === 0) return sys;
    const maskedCredentials: Record<string, string> = {};
    for (const key of Object.keys(sys.credentials)) {
      maskedCredentials[key] = `<<masked_${key}>>`;
    }
    return { ...sys, credentials: maskedCredentials };
  };

  if (input.id) {
    const system = await ctx.superglueClient.getSystem(input.id);
    return { success: true, system: maskCredentialsInSystem(system) };
  }
  const { items } = await ctx.superglueClient.listSystems(100);
  const query = input.query!.toLowerCase();
  const keywords = query.split(/\s+/).filter((k) => k.length > 0);
  const filtered = items.filter((s) => {
    const text = [s.id, s.urlHost, s.documentation].filter(Boolean).join(" ").toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
  return { success: true, systems: filtered.map(maskCredentialsInSystem) };
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
      states: {
        [ConfirmationAction.CONFIRMED]: EDIT_TOOL_CONFIRMATION.CONFIRMED,
        [ConfirmationAction.DECLINED]: EDIT_TOOL_CONFIRMATION.DECLINED,
        [ConfirmationAction.PARTIAL]: EDIT_TOOL_CONFIRMATION.PARTIAL,
      },
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
    confirmation: {
      timing: "before",
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      states: {
        [ConfirmationAction.CONFIRMED]: SYSTEM_UPSERT_CONFIRMATION.CONFIRMED,
        [ConfirmationAction.DECLINED]: SYSTEM_UPSERT_CONFIRMATION.DECLINED,
      },
      processConfirmation: processCreateSystemConfirmation,
    },
  },
  edit_system: {
    name: "edit_system",
    definition: editSystemDefinition,
    execute: runEditSystem,
    confirmation: {
      timing: "before",
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      states: {
        [ConfirmationAction.CONFIRMED]: SYSTEM_UPSERT_CONFIRMATION.CONFIRMED,
        [ConfirmationAction.DECLINED]: SYSTEM_UPSERT_CONFIRMATION.DECLINED,
      },
      processConfirmation: processEditSystemConfirmation,
    },
  },
  call_system: {
    name: "call_system",
    definition: callSystemDefinition,
    execute: async (input: any, ctx: ToolExecutionContext) => {
      const { shouldAutoExecute } = processToolPolicy("call_system", input, ctx);

      if (shouldAutoExecute) {
        const result = await runCallSystem(input, ctx);
        return truncateResponseBody(result);
      }

      return {
        confirmationState: CALL_SYSTEM_CONFIRMATION.PENDING,
        request: {
          url: input.url,
          method: input.method,
          headers: input.headers,
          body: input.body,
          systemId: input.systemId,
        },
      };
    },
    confirmation: {
      timing: "before",
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      states: {
        [ConfirmationAction.CONFIRMED]: CALL_SYSTEM_CONFIRMATION.CONFIRMED,
        [ConfirmationAction.DECLINED]: CALL_SYSTEM_CONFIRMATION.DECLINED,
      },
      processConfirmation: processCallSystemConfirmation,
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
    confirmation: {
      timing: "before",
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      states: {
        [ConfirmationAction.CONFIRMED]: SYSTEM_UPSERT_CONFIRMATION.CONFIRMED,
        [ConfirmationAction.DECLINED]: SYSTEM_UPSERT_CONFIRMATION.DECLINED,
      },
      processConfirmation: processAuthenticateOAuthConfirmation,
    },
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
      states: {
        [ConfirmationAction.CONFIRMED]: EDIT_TOOL_CONFIRMATION.CONFIRMED,
        [ConfirmationAction.DECLINED]: EDIT_TOOL_CONFIRMATION.DECLINED,
      },
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
  "edit_system",
  "search_documentation",
  "call_system",
  "authenticate_oauth",
  "get_runs",
  "find_system_templates",
  "find_tool",
  "find_system",
];

export const PLAYGROUND_TOOL_SET = [
  "edit_tool",
  "edit_payload",
  "run_tool",
  "search_documentation",
  "call_system",
  "edit_system",
  "authenticate_oauth",
  "find_tool",
  "find_system",
  "get_runs",
];

export const SYSTEM_PLAYGROUND_TOOL_SET = [
  "create_system",
  "edit_system",
  "call_system",
  "authenticate_oauth",
  "find_system",
  "get_runs",
  "search_documentation",
  "find_system_templates",
];
