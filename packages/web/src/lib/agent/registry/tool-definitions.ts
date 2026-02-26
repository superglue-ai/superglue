import { truncateToolResult } from "@/src/lib/general-utils";
import { resolveOAuthConfig } from "@/src/lib/oauth-utils";
import { applyDiffsToConfig } from "@/src/lib/config-diff-utils";
import {
  ConfirmationAction,
  ToolResult,
  getToolSystemIds,
  getConnectionProtocol,
  mergeCredentials,
  normalizeToolSchemas,
  toJsonSchema,
  convertRequiredToArray,
  ToolDiff,
} from "@superglue/shared";
import { SystemConfig, systems, findTemplateForSystem } from "@superglue/shared/templates";
import * as jsonpatch from "fast-json-patch";
import { findDraftInMessages, formatDiffSummary } from "../agent-context";
import {
  buildScrapeInput,
  filterSystemFields,
  hasPatchableSystemFields,
  resolveBodyFileReferences,
  extractFilePayloadsForUpload,
  resolvePayloadWithFiles,
  skillIndexDescription,
  stripLegacyToolFields,
  truncateResponseData,
  tryTriggerScrapeJob,
  validateDraftOrToolId,
  validatePatches,
  validateRequiredFields,
  validateToolStructure,
} from "../agent-helpers";
import { type SkillName, SKILL_NAMES } from "../skills/index";
import {
  DraftLookup,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistryEntry,
  CallSystemArgs,
  CallSystemResult,
} from "../agent-types";

const buildToolDefinition = (): ToolDefinition => ({
  name: "build_tool",
  description: `Builds a new superglue tool by accepting the full tool configuration JSON.
    Load the tool-building skill via read_skill first — it contains the exact config structure and build recipe.
    Returns a draftId for use with run_tool, edit_tool, or save_tool.`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Tool ID in kebab-case (e.g., 'stripe-list-orders')" },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "camelCase step identifier" },
            instruction: { type: "string", description: "What this step does" },
            dataSelector: {
              type: "string",
              description: "JS: (sourceData) => object (single exec) or array (loop)",
            },
            modify: { type: "boolean", description: "true if step writes/updates/deletes data" },
            config: {
              type: "object",
              description:
                "RequestStepConfig (type: 'request', systemId, url, method, headers?, queryParams?, body?, pagination?) or TransformStepConfig (type: 'transform', transformCode)",
            },
          },
          required: ["id", "config"],
        },
      },
      outputTransform: {
        type: "string",
        description: "JS: (sourceData) => finalOutput. Single-line, no literal newlines or tabs.",
      },
      outputSchema: {
        type: "object",
        description: "Optional JSONSchema for enforcing output shape",
      },
      payload: {
        type: "object",
        description:
          "Sample payload for inputSchema generation and testing. Use file::<key> for file references.",
      },
      systemIds: {
        type: "array",
        items: { type: "string" },
        description: "System IDs used in the tool steps (for validation)",
      },
    },
    required: ["id", "steps"],
  },
});

const runBuildTool = async (input: any, ctx: ToolExecutionContext) => {
  const { id, steps, outputTransform, outputSchema, payload, systemIds } = input;

  const toolConfig = { id, steps, outputTransform, outputSchema };

  const validation = validateToolStructure(toolConfig, { systemIds });
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      next_step: "Fix the tool config and call build_tool again",
    };
  }

  const fileResult = resolvePayloadWithFiles(payload, ctx.filePayloads);
  if (!fileResult.success) {
    return { success: false, ...fileResult };
  }
  const resolvedPayload = fileResult.resolved;

  let inputSchema: any;
  if (resolvedPayload && Object.keys(resolvedPayload).length > 0) {
    try {
      inputSchema = convertRequiredToArray(
        toJsonSchema(
          { payload: resolvedPayload },
          { arrays: { mode: "all" }, required: true, requiredDepth: 2 },
        ),
      );
    } catch {
      inputSchema = undefined;
    }
  }

  const draftId = `draft_${crypto.randomUUID()}`;

  return {
    success: true,
    draftId,
    toolId: id,
    config: stripLegacyToolFields({
      ...toolConfig,
      inputSchema,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
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
    return { success: false, error: idValidation.error, next_step: idValidation.next_step };
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
        next_step: "Check that the tool ID exists and all required credentials are provided",
      };
    }
  } else {
    const draft =
      draftId === "playground-draft" && ctx.playgroundDraft
        ? ctx.playgroundDraft
        : findDraftInMessages(ctx.messages || [], draftId);
    if (!draft) {
      return {
        success: false,
        error: `Draft not found: ${draftId}`,
        next_step: "Draft not found in conversation history. Use build_tool to create a new draft.",
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
      next_step: `This tool requires the following inputs: ${JSON.stringify(schema.properties || {}, null, 2)}. Please provide values for: ${missingFields.join(", ")}`,
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
          traceId,
        })
      : await ctx.superglueClient.runTool({
          toolId: toolId!,
          payload: resolvedPayload,
          options: { requestSource: "frontend" },
        });

    if (!result.success) {
      return {
        success: false,
        ...(isDraft ? { draftId, traceId } : {}),
        stepResults: result.stepResults,
        config: stripLegacyToolFields(toolConfig),
        data: result.data,
        error: result.error,
        next_step: isDraft
          ? "You must use search_documentation and/or web_search to diagnose the issue before making changes. Then use edit_tool with this draftId to fix the error."
          : "You must use search_documentation and/or web_search to diagnose the issue before trying again.",
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
      stepResults: result.stepResults,
      config: stripLegacyToolFields(toolConfig),
      data: result.data,
    };
  } catch (error: any) {
    return {
      success: false,
      ...(isDraft ? { draftId, traceId } : {}),
      config: stripLegacyToolFields(toolConfig),
      error: error.message,
      next_step: isDraft
        ? "You must use search_documentation and/or web_search to diagnose the issue before making changes. Then use edit_tool with this draftId to fix the error."
        : "You must use search_documentation and/or web_search to diagnose the issue. Check that the tool ID exists and all required credentials are provided.",
    };
  }
};

const editToolDefinition = (): ToolDefinition => ({
  name: "edit_tool",
  description: `
    <use_case>
    Load the tool-fixing skill via read_skill before generating patches.  
    Modifies an existing tool using targeted JSON Patch operations. Use this to fix errors and edit any tool. 
    </use_case>

    <important_notes>
      - Provide either draftId (from build_tool) OR toolId (for saved tools), not both.
      - You MUST include the payload parameter with the exact same test data that was used in build_tool. Copy it from the build_tool call in the conversation history. Use an empty object {} only if the tool genuinely requires no input.
      - When you edit an existing saved tool, edits are not automatically persisted. Call save_tool to ensure changes are saved. This tool cannot unarchive tools.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of the draft tool to edit (from build_tool)" },
      toolId: { type: "string", description: "ID of a saved tool to edit" },
      patches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: ["add", "remove", "replace", "move", "copy", "test"],
              description: "The JSON Patch operation type (RFC 6902)",
            },
            path: {
              type: "string",
              description:
                "JSON Pointer path to the target location (e.g., '/steps/0/config/url', '/outputTransform', '/steps/-' for append)",
            },
            value: {
              description: "The value to set (required for add, replace, test operations)",
            },
            from: {
              type: "string",
              description: "Source path for move and copy operations",
            },
          },
          required: ["op", "path"],
        },
        description: "Array of RFC 6902 JSON Patch operations to apply to the tool configuration",
      },
      payload: {
        type: "object",
        description:
          "The test payload used when users click the 'Test with N changes' button in the UI to test the fixed tool",
      },
    },
    required: ["patches", "payload"],
  },
});

const runEditTool = async (input: any, ctx: ToolExecutionContext) => {
  const { draftId, toolId, patches: rawPatches } = input;

  const idValidation = validateDraftOrToolId(draftId, toolId);
  if (idValidation.valid === false) {
    return { success: false, error: idValidation.error, next_step: idValidation.next_step };
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
          next_step: "Check that the tool ID exists",
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
        next_step: "Check that the tool ID exists and you have access",
      };
    }
  } else {
    if (draftId === "playground-draft" && ctx.playgroundDraft) {
      draft = ctx.playgroundDraft;
    } else {
      draft = findDraftInMessages(ctx.messages || [], draftId);
    }
  }

  if (!draft) {
    return {
      success: false,
      error: `Draft not found: ${workingDraftId}`,
      next_step: "Draft not found in conversation history. Use build_tool to create a new draft.",
    };
  }

  let patches = rawPatches as jsonpatch.Operation[];
  if (patches && !Array.isArray(patches)) {
    patches = [patches];
  }
  if (!patches || patches.length === 0) {
    return {
      success: false,
      error: "No patches provided. At least one JSON Patch operation is required.",
      next_step: "Load the tool-fixing skill via read_skill and generate patches.",
    };
  }

  const patchValidation = validatePatches(patches);
  if (!patchValidation.valid) {
    return {
      success: false,
      error: patchValidation.error,
      next_step: "Fix the patch operations and try again.",
    };
  }

  try {
    const toolCopy = JSON.parse(JSON.stringify(draft.config));
    const result = jsonpatch.applyPatch(toolCopy, patches, true, true);
    const patchedTool = result.newDocument || toolCopy;

    const normalizedTool = normalizeToolSchemas(patchedTool);

    const toolValidation = validateToolStructure(normalizedTool);
    if (!toolValidation.valid) {
      return {
        success: false,
        error: toolValidation.error,
        next_step: "Fix the patches to produce a valid tool structure.",
      };
    }

    const fixedTool = {
      ...normalizedTool,
      instruction: draft.instruction || normalizedTool.instruction,
      createdAt: draft.config.createdAt,
      updatedAt: new Date(),
    };

    const fixedToolForStorage = stripLegacyToolFields(fixedTool);
    const originalConfigForStorage = stripLegacyToolFields(draft.config);

    const diffs: ToolDiff[] = patches.map((p) => {
      const diff: ToolDiff = {
        op: p.op as ToolDiff["op"],
        path: p.path,
      };
      if ("value" in p) diff.value = (p as any).value;
      if ("from" in p && (p as any).from) diff.from = (p as any).from;
      return diff;
    });

    return {
      success: true,
      draftId: workingDraftId,
      toolId: fixedTool.id,
      originalConfig: originalConfigForStorage,
      config: fixedToolForStorage,
      diffs,
      note: `Tool edited with ${diffs.length} change(s). Use 'run_tool' with draftId '${workingDraftId}' to test, then 'save_tool' to persist.`,
    };
  } catch (error: any) {
    return {
      success: false,
      draftId: workingDraftId,
      error: `Error applying patches: ${error.message}`,
      next_step: "Check patch paths against the actual tool config and try again.",
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

  if (parsedOutput.confirmationState === "confirmed") {
    if (parsedOutput.draftId === "playground-draft" && parsedOutput.config) {
      const systemIds = getToolSystemIds(parsedOutput.config);
      _ctx.playgroundDraft = {
        config: parsedOutput.config,
        systemIds,
        instruction: parsedOutput.config.instruction || "",
      };
    }
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: true,
        message: "All changes approved and applied.",
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === "partial") {
    const approvedSummaries = (parsedOutput.approvedDiffs || []).map((d: any) =>
      formatDiffSummary(d),
    );
    const rejectedSummaries = (parsedOutput.rejectedDiffs || []).map((d: any) =>
      formatDiffSummary(d),
    );

    // Apply only the approved diffs to the original config to get the correct updated config
    let updatedConfig = parsedOutput.originalConfig;
    if (parsedOutput.originalConfig && parsedOutput.approvedDiffs?.length > 0) {
      try {
        updatedConfig = applyDiffsToConfig(parsedOutput.originalConfig, parsedOutput.approvedDiffs);
      } catch (e) {
        console.error("[edit_tool] Failed to apply approved diffs:", e);
        // Fall back to original config if applying diffs fails
        updatedConfig = parsedOutput.originalConfig;
      }
    }

    if (parsedOutput.draftId === "playground-draft" && updatedConfig) {
      const systemIds = getToolSystemIds(updatedConfig);
      _ctx.playgroundDraft = {
        config: updatedConfig,
        systemIds,
        instruction: updatedConfig.instruction || "",
      };
    }

    return {
      output: JSON.stringify({
        ...parsedOutput,
        config: updatedConfig,
        userApproved: true,
        partialApproval: true,
        message: `User PARTIALLY approved: ${parsedOutput.approvedDiffs?.length || 0} change(s) APPLIED, ${parsedOutput.rejectedDiffs?.length || 0} REJECTED.`,
        appliedChanges: approvedSummaries,
        rejectedChanges: rejectedSummaries,
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === "declined") {
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
      - After saving, the tool can be executed by ID using run_tool with toolId.
    </important_notes>
    `,
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string", description: "ID of the draft tool to save" },
      id: {
        type: "string",
        description:
          "Optional custom ID for the saved tool (overrides the auto-generated ID). Use only lowercase letters, numbers, and underscores - no hyphens.",
      },
    },
    required: ["draftId"],
  },
});

const runSaveTool = async (input: any, ctx: ToolExecutionContext) => {
  const { draftId, id } = input;

  const draft =
    draftId === "playground-draft" && ctx.playgroundDraft
      ? ctx.playgroundDraft
      : findDraftInMessages(ctx.messages || [], draftId);
  if (!draft) {
    return {
      success: false,
      error: `Draft not found: ${draftId}`,
      next_step: "Draft not found in conversation history. Use build_tool to create a new draft.",
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
      next_step: "Failed to save tool. Check the error and try again.",
    };
  }
};

const createSystemDefinition = (): ToolDefinition => ({
  name: "create_system",
  description: `
    <use_case>
      Creates and saves a new system. Load the systems-handling skill via read_skill for full credential and OAuth patterns.
    </use_case>

    <important_notes>
      - IMPORTANT: You CANNOT create private/tunneled systems. Private systems (on-prem servers, AWS VPCs, 
        Azure VNets, databases behind firewalls, or any system without public inbound access) require a 
        dedicated setup wizard that connects via the Secure Gateway. If the user wants to connect 
        to such a system, direct them to:
        1. The "Private System" option in the system picker
        2. Documentation: /docs/guides/secure-gateway
      - Use find_system first to check if the system exists and get template information (OAuth config, documentation URL, etc.).
      - slack, salesforce, asana, notion, airtable, jira, confluence are the only templates that support pre-configured oauth
      - For the list above, this also contains pre-configured client_id, but ONLY for pre-configured oauth templates.
    </important_notes>`,
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Unique identifier for the system (e.g., 'slack', 'github_api', 'stripe'). Use only lowercase letters, numbers, and underscores — no hyphens. Used as the system ID for credential injection, tool references, etc. If a system with this ID already exists, a suffix like '_1' will be appended.",
      },
      name: {
        type: "string",
        description:
          "Optional human-readable display name for the system (e.g., 'Slack API', 'GitHub REST API'). Falls back to the id if not provided. Auto-populated if using templateId.",
      },
      templateId: {
        type: "string",
        description: "Template ID to auto-populate from (e.g., 'slack', 'github', 'stripe').",
      },
      url: {
        type: "string",
        description: "Full URL for the API including protocol (auto-populated if using templateId)",
      },
      documentationUrl: {
        type: "string",
        description:
          "URL to API documentation. Triggers a one-time background scrape job. Not stored on the system.",
      },
      openApiUrl: {
        type: "string",
        description:
          "Direct URL to an OpenAPI/Swagger spec (JSON or YAML). Validated and stored as a file reference.",
      },
      files: {
        type: "string",
        description:
          "Upload documentation files using file::filename syntax. Multiple files: file::doc1.pdf,file::doc2.pdf",
      },
      specificInstructions: {
        type: "string",
        description: "Specific guidance on how to use this system",
      },
      credentials: {
        type: "object",
        description:
          "Non-sensitive credentials only: client_id, auth_url, token_url, scopes, grant_type, redirect_uri.",
      },
      sensitiveCredentials: {
        type: "object",
        description:
          "Do not use for preconfigured OAuth systems. Sensitive credentials requiring secure user input via UI. Set field(s) to true to request it. Example: { api_key: true, client_secret: true }.",
      },
      metadata: {
        type: "object",
        description:
          "Optional metadata object for storing additional system information such as capabilities and possible tools that can be built with this system.",
      },
    },
    required: ["id"],
  },
});

const runCreateSystem = async (input: any, ctx: ToolExecutionContext) => {
  let { templateId, sensitiveCredentials, documentationUrl, openApiUrl, files, ...systemInput } =
    input;

  if (templateId) {
    const template = systems[templateId];
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`,
        next_step: `Available templates: ${Object.keys(systems).join(", ")}`,
      };
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
      name: systemInput.name || template.name,
      url: template.apiUrl,
      templateName: templateId,
      ...systemInput,
      credentials: { ...oauthCreds, ...systemInput.credentials },
    };

    documentationUrl = documentationUrl || template.docsUrl || undefined;
    openApiUrl = openApiUrl || template.openApiUrl || undefined;
  }

  const fileUploadResult = extractFilePayloadsForUpload(files, ctx.filePayloads);
  if ("error" in fileUploadResult) {
    return {
      success: false,
      error: fileUploadResult.error,
      next_step:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }

  const {
    documentationUrl: _docUrl,
    openApiUrl: _oaUrl,
    documentation: _doc,
    documentationKeywords: _kw,
    ...createPayload
  } = systemInput;

  try {
    const result = await ctx.superglueClient.createSystem(createPayload);

    if (fileUploadResult.files.length > 0) {
      try {
        await ctx.superglueClient.uploadSystemFileReferences(result.id, fileUploadResult.files);
      } catch (uploadError: any) {
        return {
          success: true,
          system: filterSystemFields(result),
          warning: `System created but file upload failed: ${uploadError.message}`,
        };
      }
    }

    if (documentationUrl && !sensitiveCredentials) {
      try {
        await ctx.superglueClient.triggerSystemDocumentationScrapeJob(result.id, {
          url: documentationUrl,
        });
      } catch (scrapeError: any) {
        return {
          success: true,
          system: filterSystemFields(result),
          warning: `System created but documentation scrape failed to start: ${scrapeError.message}`,
        };
      }
    }

    if (openApiUrl && !sensitiveCredentials) {
      try {
        await ctx.superglueClient.fetchOpenApiSpec(result.id, openApiUrl);
      } catch {
        // non-fatal — spec fetch failure doesn't block system creation
      }
    }

    return {
      success: true,
      system: filterSystemFields(result),
      ...(documentationUrl ? { documentationUrl } : {}),
      ...(openApiUrl ? { openApiUrl } : {}),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      next_step: "Failed to create system. Validate all system inputs and try again.",
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

  if (parsedOutput.confirmationState === "confirmed") {
    const confirmationData = parsedOutput.confirmationData || parsedOutput;
    let systemConfig = confirmationData.systemConfig || parsedOutput.systemConfig;
    const userProvidedCredentials =
      confirmationData.userProvidedCredentials || parsedOutput.userProvidedCredentials || {};

    if (!systemConfig || (!systemConfig.id && !systemConfig.name)) {
      return {
        output: JSON.stringify({
          success: false,
          error: "Missing system configuration",
          next_step: "System configuration is required to create the system.",
        }),
        status: "completed",
      };
    }

    const {
      sensitiveCredentials: _,
      templateId,
      documentationUrl: inputDocUrl,
      openApiUrl: inputOpenApiUrl,
      documentation: _doc,
      documentationKeywords: _kw,
      ...cleanSystemConfig
    } = systemConfig;

    const templateForDocs = templateId ? systems[templateId] : undefined;
    const documentationUrl = inputDocUrl || templateForDocs?.docsUrl || undefined;
    const openApiUrl = inputOpenApiUrl || templateForDocs?.openApiUrl || undefined;

    if (templateId && !cleanSystemConfig.templateName) {
      cleanSystemConfig.templateName = templateId;
    }

    const finalCredentials = mergeCredentials(
      { ...(cleanSystemConfig.credentials || {}), ...userProvidedCredentials },
      undefined,
    );

    try {
      const result = await ctx.superglueClient.createSystem({
        ...cleanSystemConfig,
        credentials: finalCredentials,
      });

      if (documentationUrl) {
        try {
          await ctx.superglueClient.triggerSystemDocumentationScrapeJob(result.id, {
            url: documentationUrl,
          });
        } catch {
          // scrape failure is non-fatal
        }
      }

      if (openApiUrl) {
        try {
          await ctx.superglueClient.fetchOpenApiSpec(result.id, openApiUrl);
        } catch {
          // spec fetch failure is non-fatal
        }
      }

      return {
        output: JSON.stringify({
          success: true,
          system: filterSystemFields(result),
          ...(documentationUrl ? { documentationUrl } : {}),
          ...(openApiUrl ? { openApiUrl } : {}),
        }),
        status: "completed",
      };
    } catch (error: any) {
      return {
        output: JSON.stringify({
          success: false,
          error: error.message,
          next_step: "Failed to create system. Validate all system inputs and try again.",
        }),
        status: "completed",
      };
    }
  } else if (parsedOutput.confirmationState === "declined") {
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
      Always load the systems-handling skill via read_skill before editing a system.
      Edits an existing system identified by its id. Systems are building blocks for tools and contain the credentials for accessing the API.
      Provide only the id and the fields you want to change. Fields not included will remain unchanged.
    </use_case>

    <important_notes>
      - NOTE: For private/tunneled systems (systems with tunnel configuration), you can only edit: name, specificInstructions, credentials (API keys, etc.) and add documentation files.
        You CANNOT change the tunnel configuration (tunnelId, targetName). If the user needs to change 
        the target, they must create a new system through the Private System wizard.
      - You cannot remove or edit existing documentation by editing the system directly. You can add documentation only by using the files field (file::...) when calling edit_system; uploads are appended to the system's documentation.
      - When referencing files, use the exact file key (file::<key>) exactly as shown (e.g., file::my_data_csv). Do NOT use the original filename.
    </important_notes>`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The unique identifier of the system" },
      name: { type: "string", description: "Human-readable name for the system" },
      url: { type: "string", description: "Full URL for the API including protocol" },
      files: {
        type: "string",
        description: "Upload documentation files using file::filename syntax.",
      },
      specificInstructions: {
        type: "string",
        description: "Specific guidance on how to use this system",
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
      scrapeUrl: {
        type: "string",
        description:
          "Optional: URL to scrape for documentation. Triggers a background scrape job. This URL is not stored on the system.",
      },
      scrapeKeywords: {
        type: "string",
        description:
          "Optional: Space-separated keywords to scope the scrape (e.g., 'authentication pagination rate-limits').",
      },
    },
    required: ["id"],
  },
});

const runEditSystem = async (input: any, ctx: ToolExecutionContext) => {
  let { sensitiveCredentials, files, scrapeUrl, scrapeKeywords, ...systemInput } = input;

  const fileUploadResult = extractFilePayloadsForUpload(files, ctx.filePayloads);
  if ("error" in fileUploadResult) {
    return {
      success: false,
      error: fileUploadResult.error,
      next_step:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }

  const {
    documentationUrl: _docUrl,
    openApiUrl: _oaUrl,
    documentation: _doc,
    documentationKeywords: _kw,
    documentationFiles: _docFiles,
    ...patchPayload
  } = systemInput;

  const scrapeInput = buildScrapeInput(scrapeUrl, scrapeKeywords);

  try {
    const existingSystem = await ctx.superglueClient.getSystem(patchPayload.id);
    if (!existingSystem) {
      return {
        success: false,
        error: "System not found",
        next_step: "Check the system id and try again.",
      };
    }

    const hasPatch = hasPatchableSystemFields(patchPayload);
    const hasFiles = fileUploadResult.files.length > 0;
    const hasScrape = !!scrapeInput;

    if (!hasPatch && !hasFiles && !hasScrape) {
      return {
        success: false,
        error: "No changes provided. Include at least one system field, files, or scrapeUrl.",
        next_step:
          "Provide a field to update, a documentation file to upload, or a scrapeUrl to trigger a scrape.",
      };
    }

    if (!hasPatch && hasFiles) {
      await ctx.superglueClient.uploadSystemFileReferences(patchPayload.id, fileUploadResult.files);
      const updated = await ctx.superglueClient.getSystem(patchPayload.id);
      const scrapeWarning = await tryTriggerScrapeJob(ctx, patchPayload.id, scrapeInput);
      return {
        success: true,
        systemId: patchPayload.id,
        system: filterSystemFields(updated || existingSystem),
        ...(scrapeWarning ? { warning: scrapeWarning } : {}),
      };
    }

    if (!hasPatch && !hasFiles && hasScrape) {
      const scrapeWarning = await tryTriggerScrapeJob(ctx, patchPayload.id, scrapeInput);
      if (scrapeWarning) {
        return {
          success: true,
          systemId: patchPayload.id,
          system: filterSystemFields(existingSystem),
          warning: scrapeWarning,
        };
      }
      return {
        success: true,
        systemId: patchPayload.id,
        system: filterSystemFields(existingSystem),
      };
    }

    if (patchPayload.credentials) {
      patchPayload.credentials = mergeCredentials(
        patchPayload.credentials,
        existingSystem?.credentials,
      );
    }

    const result = await ctx.superglueClient.updateSystem(patchPayload.id, patchPayload);

    if (fileUploadResult.files.length > 0) {
      try {
        await ctx.superglueClient.uploadSystemFileReferences(result.id, fileUploadResult.files);
      } catch (uploadError: any) {
        return {
          success: true,
          systemId: result.id,
          system: filterSystemFields(result),
          warning: `System updated but file upload failed: ${uploadError.message}`,
        };
      }
    }

    const scrapeWarning = await tryTriggerScrapeJob(ctx, result.id, scrapeInput);
    if (scrapeWarning) {
      return {
        success: true,
        systemId: result.id,
        system: filterSystemFields(result),
        warning: `System updated but ${scrapeWarning}`,
      };
    }

    return {
      success: true,
      systemId: result.id,
      system: filterSystemFields(result),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      next_step: "Failed to modify system. Validate all system inputs and try again.",
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

  if (parsedOutput.confirmationState === "confirmed") {
    const confirmationData = parsedOutput.confirmationData || parsedOutput;
    let systemConfig = confirmationData.systemConfig || parsedOutput.systemConfig;
    const userProvidedCredentials =
      confirmationData.userProvidedCredentials || parsedOutput.userProvidedCredentials || {};

    if (!systemConfig || !systemConfig.id) {
      return {
        output: JSON.stringify({
          success: false,
          error: "Missing system configuration",
          next_step: "System configuration is required to update the system.",
        }),
        status: "completed",
      };
    }

    const {
      sensitiveCredentials: _,
      templateId,
      documentationUrl: _docUrl,
      openApiUrl: _oaUrl,
      documentation: _doc,
      documentationKeywords: _kw,
      documentationFiles: _docFiles,
      scrapeUrl: _scrapeUrl,
      scrapeKeywords: _scrapeKeywords,
      ...cleanSystemConfig
    } = systemConfig;

    if (templateId && !cleanSystemConfig.templateName) {
      cleanSystemConfig.templateName = templateId;
    }

    try {
      const existingSystem = await ctx.superglueClient.getSystem(cleanSystemConfig.id);
      if (!existingSystem) {
        return {
          output: JSON.stringify({
            success: false,
            error: "System not found",
            next_step: "Check the system id and try again.",
          }),
          status: "completed",
        };
      }

      const fileUploadResult = extractFilePayloadsForUpload(input.files, ctx.filePayloads);
      const hasFilesToUpload = !("error" in fileUploadResult) && fileUploadResult.files.length > 0;
      const scrapeInput = buildScrapeInput(input?.scrapeUrl, input?.scrapeKeywords);
      const hasScrape = !!scrapeInput;
      const hasPatch = hasPatchableSystemFields(cleanSystemConfig);
      const hasCredentialUpdate =
        !!userProvidedCredentials && Object.keys(userProvidedCredentials).length > 0;

      if (!hasPatch && !hasFilesToUpload && !hasScrape && !hasCredentialUpdate) {
        return {
          output: JSON.stringify({
            success: false,
            error: "No changes provided. Include at least one system field, files, or scrapeUrl.",
            next_step:
              "Provide a field to update, a documentation file to upload, or a scrapeUrl to trigger a scrape.",
          }),
          status: "completed",
        };
      }
      if (!hasPatch && hasFilesToUpload && !("error" in fileUploadResult)) {
        await ctx.superglueClient.uploadSystemFileReferences(
          cleanSystemConfig.id,
          fileUploadResult.files,
        );
        const updated = await ctx.superglueClient.getSystem(cleanSystemConfig.id);
        const scrapeWarning = await tryTriggerScrapeJob(ctx, cleanSystemConfig.id, scrapeInput);
        return {
          output: JSON.stringify({
            success: true,
            systemId: cleanSystemConfig.id,
            system: filterSystemFields(updated || existingSystem),
            ...(scrapeWarning ? { warning: scrapeWarning } : {}),
          }),
          status: "completed",
        };
      }

      if (!hasPatch && !hasFilesToUpload && hasScrape) {
        const scrapeWarning = await tryTriggerScrapeJob(ctx, cleanSystemConfig.id, scrapeInput);
        if (scrapeWarning) {
          return {
            output: JSON.stringify({
              success: true,
              systemId: cleanSystemConfig.id,
              system: filterSystemFields(existingSystem),
              warning: scrapeWarning,
            }),
            status: "completed",
          };
        }
        return {
          output: JSON.stringify({
            success: true,
            systemId: cleanSystemConfig.id,
            system: filterSystemFields(existingSystem),
          }),
          status: "completed",
        };
      }

      const finalCredentials = mergeCredentials(
        { ...(cleanSystemConfig.credentials || {}), ...userProvidedCredentials },
        existingSystem?.credentials,
      );

      const result = await ctx.superglueClient.updateSystem(cleanSystemConfig.id, {
        ...cleanSystemConfig,
        credentials: finalCredentials,
      });
      const scrapeWarning = await tryTriggerScrapeJob(ctx, result.id, scrapeInput);
      if (scrapeWarning) {
        return {
          output: JSON.stringify({
            success: true,
            systemId: result.id,
            system: filterSystemFields(result),
            warning: `System updated but ${scrapeWarning}`,
          }),
          status: "completed",
        };
      }
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
          next_step: "Failed to modify system. Validate all system inputs and try again.",
        }),
        status: "completed",
      };
    }
  } else if (parsedOutput.confirmationState === "declined") {
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
      Load the relevant protocol skill via read_skill (http-apis, databases, or file-servers) before calling call_system for detailed usage patterns and URL formats.
      Use this to explore APIs, databases, and file servers, verify authentication, test endpoints, and examine response formats BEFORE building tools.
    </use_case>

    <important_notes>
      - Only call ONE AT A TIME - NEVER multiple call_system in parallel in the same turn.
      - Supports credential injection using placeholders: <<system_id_credential_key>>
      - When a systemId is provided, OAuth tokens are automatically refreshed if expired
      - Use file::<key> in body values to reference uploaded files (e.g., {"data": "file::my_csv"})
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
      url: {
        type: "string",
        description:
          "Full URL including protocol. Supports http(s)://, postgres://, postgresql://, sftp://, ftp://, ftps://, smb://. Can use <<system_id_credential_key>> for credential injection.",
      },
      method: {
        type: "string",
        description: "HTTP method (only used for HTTP/HTTPS URLs)",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      },
      headers: {
        type: "object",
        description:
          "HTTP headers (only used for HTTP/HTTPS URLs). Ensure to include system credentials via <<system_id_credential_key>> if this url requires authentication.",
      },
      body: {
        type: "string",
        description:
          "Request body. For HTTP: JSON string for POST/PUT/PATCH. For Postgres: JSON with query and params. For SFTP/SMB: JSON with operation and path, or array of operations for batch. Can use <<system_id_credential_key>> for credential injection. Use file::<key> in values to reference uploaded files, they are auto parsed to JSON and replaced in the body.",
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
  const protocol = getConnectionProtocol(url);

  try {
    const resolvedBody = resolveBodyFileReferences(body, ctx.filePayloads);
    if (resolvedBody.success === false) {
      return { success: false, protocol, error: resolvedBody.error };
    }

    const step = {
      id: `call_system_${Date.now()}`,
      config: {
        url,
        method: method || "GET",
        headers,
        body: resolvedBody.body,
        systemId,
      },
    };

    const result = await ctx.superglueClient.executeStep({
      step,
      payload: {},
    });

    const responseData = result.data?.data !== undefined ? result.data.data : result.data;

    return truncateResponseData({
      success: result.success,
      protocol,
      data: responseData,
      error: result.error,
      next_step: result.error
        ? "You must use search_documentation and/or web_search to diagnose the issue before making changes."
        : undefined,
    } as CallSystemResult);
  } catch (error) {
    return {
      success: false,
      protocol,
      error: error instanceof Error ? error.message : String(error),
      next_step:
        "You must use search_documentation and/or web_search to diagnose the issue before making changes.",
    } as CallSystemResult;
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

  if (parsedOutput.confirmationState === "confirmed") {
    try {
      const realResult = await runCallSystem(input, ctx);
      return { output: JSON.stringify(realResult), status: "completed" };
    } catch (error: any) {
      const errorResult = {
        success: false,
        protocol: getConnectionProtocol(input.url),
        error: error.message || "Request failed",
        next_step:
          "You must use search_documentation and web_search to diagnose the issue before making changes.",
      };
      return { output: JSON.stringify(errorResult), status: "completed" };
    }
  } else if (parsedOutput.confirmationState === "declined") {
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
    </use_case>

    <important_notes>
      - Max 1 search per turn per system.
      - Documentation can be incomplete.
      - Use clear, specific keywords related to what you're looking for (e.g., "authentication", "pagination", "rate limits")
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
      next_step: "Check that the system ID exists and has documentation available",
    };
  }
};

const authenticateOAuthDefinition = (): ToolDefinition => ({
  name: "authenticate_oauth",
  description: `
    <use_case>
      Load the systems-handling skill via read_skill before calling authenticate_oauth for full OAuth setup patterns.
      Initiates OAuth authentication flow for a system. Use for:
      1. Initial OAuth setup after create_system
      2. Re-authenticating when OAuth tokens have expired and cannot be refreshed
      3. Both client_credentials and authorization_code flows
    </use_case>

    <credential_resolution>
      client_id and client_secret must already be stored on the system (via create_system or edit_system) OR provided by a matching template (slack, salesforce, asana, notion, airtable, jira, confluence).
      This tool does NOT accept client_id or client_secret directly. If missing, use edit_system first.
    </credential_resolution>

    <important>
      - On success, all OAuth config and tokens are automatically saved to the system
      - client_credentials flow requires client_id + client_secret stored on the system, plus scopes and token_url
      - SCOPES: You must use the maximum scopes by default. Only use limited scopes if user explicitly requests limited scopes. For jira/confluence, don't forget the offline_access scope.
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
    },
    required: ["systemId", "scopes"],
  },
});

const runAuthenticateOAuth = async (input: any, ctx: ToolExecutionContext) => {
  try {
    const system = await ctx.superglueClient.getSystem(input.systemId);
    if (!system) {
      return {
        success: false,
        error: `System '${input.systemId}' not found`,
        next_step: "Create the system first using create_system",
      };
    }

    const templateOAuth = findTemplateForSystem(system)?.template.oauth;
    const oauthConfig = resolveOAuthConfig(input, system.credentials, templateOAuth);

    if (!oauthConfig.client_id) {
      return {
        success: false,
        error:
          "Missing client_id. The system does not have a client_id in its credentials and no matching template provides one.",
        next_step:
          "Use edit_system to add client_id to the system's credentials, then call authenticate_oauth again.",
      };
    }

    const isTemplateOAuth =
      !!templateOAuth?.client_id &&
      (!system.credentials?.client_id || system.credentials.client_id === templateOAuth.client_id);

    if (!isTemplateOAuth && !oauthConfig.client_secret) {
      return {
        success: false,
        error:
          "Missing client_secret. The system has client_id but no client_secret stored in its credentials.",
        next_step:
          "Use edit_system with sensitiveCredentials: { client_secret: true } to store the client_secret, then call authenticate_oauth again.",
      };
    }

    if (!oauthConfig.auth_url || !oauthConfig.token_url) {
      return {
        success: false,
        error: "Missing auth_url or token_url for OAuth",
        next_step: "Provide auth_url and token_url, or use a template with pre-configured OAuth",
      };
    }

    const { client_secret: _secret, ...safeOauthConfig } = oauthConfig;

    return {
      success: true,
      requiresOAuth: true,
      systemId: input.systemId,
      oauthConfig: safeOauthConfig,
      system: filterSystemFields(system),
      message: "OAuth authentication ready. Click the button to authenticate.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      next_step: "Failed to fetch system. Check that the system ID exists.",
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

  if (parsedOutput.success === false && parsedOutput.error) {
    return { output: JSON.stringify(parsedOutput), status: "completed" };
  }
  if (!parsedOutput.confirmationState) {
    return { output: JSON.stringify(parsedOutput), status: "completed" };
  }

  if (parsedOutput.confirmationState === "declined") {
    return {
      output: JSON.stringify({
        success: false,
        cancelled: true,
        message: "OAuth authentication cancelled by user",
      }),
      status: "declined",
    };
  }

  if (parsedOutput.confirmationState === "oauth_failure") {
    const confirmationData = parsedOutput.confirmationData || {};
    return {
      output: JSON.stringify({
        success: false,
        error: confirmationData.error || "OAuth authentication failed",
        systemId: confirmationData.systemId,
      }),
      status: "completed",
    };
  }

  if (parsedOutput.confirmationState === "oauth_success") {
    const confirmationData = parsedOutput.confirmationData || {};
    const { tokens } = confirmationData;
    const oauthConfig = parsedOutput.oauthConfig || {};
    const systemId = confirmationData.systemId || parsedOutput.systemId;

    if (!tokens?.access_token) {
      return {
        output: JSON.stringify({
          success: false,
          error: "OAuth flow completed but no access_token received.",
        }),
        status: "completed",
      };
    }

    try {
      const currentSystem = await ctx.superglueClient.getSystem(systemId);
      const { extraHeaders, ...restOauthConfig } = oauthConfig;
      const updatedCredentials = {
        ...currentSystem?.credentials,
        ...restOauthConfig,
        ...(extraHeaders && {
          extraHeaders:
            typeof extraHeaders === "string" ? extraHeaders : JSON.stringify(extraHeaders),
        }),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_at: tokens.expires_at,
      };

      await ctx.superglueClient.updateSystem(systemId, { credentials: updatedCredentials });

      return {
        output: JSON.stringify({
          success: true,
          systemId,
          message: "OAuth authentication completed and credentials saved to system.",
        }),
        status: "completed",
      };
    } catch (error: any) {
      return {
        output: JSON.stringify({
          success: false,
          error: `OAuth succeeded but failed to save credentials: ${error.message}`,
          next_step: "Try calling authenticate_oauth again.",
        }),
        status: "completed",
      };
    }
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
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

  if (parsedOutput.confirmationState === "confirmed") {
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: true,
        message: "Payload edit approved and applied.",
      }),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === "declined") {
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
      Fetches recent run history. Use this to debug webhook payload mismatches by inspecting what payloads were actually received, see recent executions filtered by status or source, or investigate what end users (agents) did and how they affected systems ("blast radius").
    </use_case>

    <important_notes>
      - Returns recent runs including toolPayload (the actual input received)
      - Useful for debugging when a webhook-triggered tool fails due to unexpected payload format
      - Compare the returned toolPayload against the tool's inputSchema to identify mismatches
      - Can filter by toolId, status (running, success, failed, aborted), or requestSources (api, frontend, scheduler, mcp, tool-chain, webhook)
      - Can filter by userId to see what a specific user or end user did
      - Can filter by systemId to see all runs that touched a specific system
      - Can use search to find runs containing specific text in their payload or results (e.g., "issue XYZ", "user@email.com")
      - Set fetchResults=true to load full execution details (stepResults, toolResult) for runs that have stored results (only use if needed e.g. for investigation, can bloat context, and not if just listing runs)
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
      offset: {
        type: "number",
        description: "Optional: Number of runs to skip for pagination (default: 0)",
      },
      status: {
        type: "string",
        enum: ["running", "success", "failed", "aborted"],
        description: "Optional: Filter runs by status",
      },
      fetchResults: {
        type: "boolean",
        description:
          "Optional: If true, fetch full stored results (stepResults, toolResult) for runs that have them. Default: false.",
      },
      requestSources: {
        type: "array",
        items: {
          type: "string",
          enum: ["api", "frontend", "scheduler", "mcp", "tool-chain", "webhook"],
        },
        description: "Optional: Filter runs by how they were triggered (can specify multiple)",
      },
      userId: {
        type: "string",
        description: "Optional: Filter runs by user ID to see what a specific user or end user did",
      },
      systemId: {
        type: "string",
        description:
          "Optional: Filter runs by system ID to see all runs that touched a specific system",
      },
      search: {
        type: "string",
        description:
          "Optional: Full-text search across run results (payload, API responses, etc.). Automatically fetches S3 results to search. Use to find runs containing specific text like issue IDs, email addresses, or other identifiers.",
      },
    },
    required: [],
  },
});

const runGetRuns = async (
  input: {
    toolId?: string;
    limit?: number;
    offset?: number;
    status?: string;
    requestSources?: string[];
    fetchResults?: boolean;
    userId?: string;
    systemId?: string;
    search?: string;
  },
  ctx: ToolExecutionContext,
) => {
  const {
    toolId,
    limit = 10,
    offset = 0,
    status,
    requestSources,
    fetchResults = false,
    userId,
    systemId,
    search,
  } = input;

  // If searching, fetch more runs to filter through
  const fetchLimit = search ? Math.min(limit * 5, 200) : Math.min(limit, 50);
  // Convert offset to page for the API
  const page = Math.floor(offset / fetchLimit) + 1;
  // Calculate how many items to skip within the fetched page
  const skipWithinPage = offset % fetchLimit;

  try {
    const result = await ctx.superglueClient.listRuns({
      toolId,
      limit: fetchLimit,
      page,
      status: status as "running" | "success" | "failed" | "aborted" | undefined,
      requestSources: requestSources as
        | ("api" | "frontend" | "scheduler" | "mcp" | "tool-chain" | "webhook")[]
        | undefined,
      userId,
      systemId,
    });

    const searchTerm = search?.toLowerCase();
    const shouldFetchResults = fetchResults || !!search;

    // Strip large fields from runs to avoid JSON serialization issues
    const stripRun = (run: any) => {
      const { tool, data, stepResults, ...rest } = run;
      return rest;
    };

    // Skip items within the page to handle offset correctly
    let runs = result.items.slice(skipWithinPage);

    if (shouldFetchResults && searchTerm) {
      const filtered = runs.filter((run) => {
        const runStr = JSON.stringify(run).toLowerCase();
        return runStr.includes(searchTerm);
      });
      runs = filtered.slice(0, limit).map(stripRun);
    } else {
      runs = runs.slice(0, limit).map(stripRun);
    }

    return {
      success: true,
      toolId: toolId || "all",
      total: search ? runs.length : result.total,
      runs,
      note:
        runs.length > 0
          ? `Check toolPayload field to see what was actually received. Compare against the tool's inputSchema to identify mismatches.${search ? ` Searched through ${result.items.length} runs for "${search}".` : ""}`
          : search
            ? `No runs found containing "${search}".`
            : "No runs found matching the filters.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      next_step: "Check that the filters are valid",
    };
  }
};

const findToolDefinition = (): ToolDefinition => ({
  name: "find_tool",
  description: `Look up an existing tool by ID or search for tools by query.
<use_case>Use when you need to see the full configuration of an existing tool, or find tools matching a description.</use_case>
<important_notes>
  - Use query "*" or omit both id and query to list all tools.
  - Search matches against tool ID, instruction, step instructions, and system IDs.
</important_notes>`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Exact tool ID to look up" },
      query: {
        type: "string",
        description: 'Search query to find matching tools. Use "*" to list all tools.',
      },
    },
  },
});

const runFindTool = async (
  input: { id?: string; query?: string },
  ctx: ToolExecutionContext,
): Promise<any> => {
  try {
    if (input.id) {
      const tool = await ctx.superglueClient.getWorkflow(input.id);
      if (!tool) {
        return { success: false, error: `Tool '${input.id}' not found` };
      }
      return { success: true, tool };
    }

    const rawQuery = (input.query || "").trim();

    if (!rawQuery || rawQuery === "*" || rawQuery === "all") {
      const { items } = await ctx.superglueClient.listWorkflows(100);
      const nonArchived = items.filter((t: any) => !t.archived);
      return {
        success: true,
        tools: nonArchived.map((t: any) => ({
          id: t.id,
          instruction: t.instruction,
          inputSchema: t.inputSchema,
          outputSchema: t.outputSchema,
          steps: t.steps?.map((s: any) => ({
            systemId: s.config?.systemId,
            instruction: s.instruction,
          })),
        })),
      };
    }

    const tools = await ctx.superglueClient.findRelevantTools(rawQuery);
    return { success: true, tools };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      next_step: "Check the tool ID or search query and try again.",
    };
  }
};

const findSystemDefinition = (): ToolDefinition => ({
  name: "find_system",
  description: `Look up an existing system by ID or search for systems by query. Also returns matching template information (OAuth config, documentation URL, etc.) if available.
<use_case>Use before call_system, create_system, or edit_system to get full system configuration and template details.</use_case>
<important_notes>
  - Use query "*" or omit both id and query to list all systems.
  - Search matches against system ID and URL.
</important_notes>`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Exact system ID to look up" },
      query: {
        type: "string",
        description:
          'Search query to find matching systems by ID or URL. Use "*" to list all systems.',
      },
    },
  },
});

const formatTemplateForOutput = (template: SystemConfig) => {
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

  let snakeCaseOauth: Record<string, any> = {};
  if (oauthObj?.authUrl) snakeCaseOauth["auth_url"] = oauthObj.authUrl;
  if (oauthObj?.tokenUrl) snakeCaseOauth["token_url"] = oauthObj.tokenUrl;
  if (oauthObj?.scopes) snakeCaseOauth["scopes"] = oauthObj.scopes;
  if (oauthObj?.client_id) snakeCaseOauth["client_id"] = oauthObj.client_id;
  if (oauthObj?.grant_type) snakeCaseOauth["grant_type"] = oauthObj.grant_type;

  return {
    ...rest,
    url: apiUrl || "",
    oauth: Object.keys(snakeCaseOauth).length > 0 ? snakeCaseOauth : undefined,
  };
};

const runFindSystem = async (
  input: { id?: string; query?: string },
  ctx: ToolExecutionContext,
): Promise<any> => {
  const attachTemplate = (system: any) => {
    const templateMatch = findTemplateForSystem(system);
    return {
      ...filterSystemFields(system),
      template: templateMatch ? formatTemplateForOutput(templateMatch.template) : null,
    };
  };

  try {
    if (input.id) {
      const system = await ctx.superglueClient.getSystem(input.id);
      if (!system) {
        const query = input.id.toLowerCase();
        const matchingTemplates: any[] = [];
        for (const template of Object.values(systems)) {
          const nameLower = template.name.toLowerCase();
          const apiUrlLower = template.apiUrl?.toLowerCase();
          const regex = template.regex ? new RegExp(template.regex, "i") : null;
          if (
            nameLower?.includes(query) ||
            apiUrlLower?.includes(query) ||
            (regex && regex.test(query))
          ) {
            matchingTemplates.push(formatTemplateForOutput(template));
          }
        }
        return {
          success: false,
          error: `System '${input.id}' not found`,
          matchingTemplates: matchingTemplates.length > 0 ? matchingTemplates : undefined,
          next_step:
            matchingTemplates.length > 0
              ? "No system with this ID exists, but matching templates were found. Use create_system with the template data."
              : "No system or template found. Use create_system to create a new system.",
        };
      }
      return { success: true, system: attachTemplate(system) };
    }

    const rawQuery = (input.query || "").trim();

    if (!rawQuery || rawQuery === "*" || rawQuery === "all") {
      const { items } = await ctx.superglueClient.listSystems(100);
      return { success: true, systems: items.map(attachTemplate) };
    }

    const { items } = await ctx.superglueClient.listSystems(100);
    const query = rawQuery.toLowerCase();
    const keywords = query.split(/\s+/).filter((k) => k.length > 0);
    const filtered = items.filter((s) => {
      const text = [s.id, s.name, s.url].filter(Boolean).join(" ").toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });

    const matchingTemplates: any[] = [];
    for (const template of Object.values(systems)) {
      const nameLower = template.name.toLowerCase();
      const apiUrlLower = template.apiUrl?.toLowerCase();
      const regex = template.regex ? new RegExp(template.regex, "i") : null;
      if (
        keywords.some(
          (kw) => nameLower?.includes(kw) || apiUrlLower?.includes(kw) || (regex && regex.test(kw)),
        )
      ) {
        matchingTemplates.push(formatTemplateForOutput(template));
      }
    }

    return {
      success: true,
      systems: filtered.map(attachTemplate),
      templates: matchingTemplates.length > 0 ? matchingTemplates : undefined,
      next_step:
        filtered.length === 0 && matchingTemplates.length > 0
          ? "No existing systems match, but templates were found. Use create_system with the template data."
          : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      next_step: "Check the system ID or search query and try again.",
    };
  }
};

const readSkillDefinition = (): ToolDefinition => ({
  name: "read_skill",
  description: `Loads superglue reference documentation ("skills") into your context. You MUST call this before building, fixing, or editing tools to understand the correct syntax and patterns.

Available skills:
${skillIndexDescription}

Loading strategy:
- Always load: superglue-concepts + variables-and-data-flow
- Building tools: + tool-building + transforms-and-output + relevant protocol skill(s)
- Editing/fixing tools: + tool-fixing + relevant protocol skill(s)
- Managing systems: + systems-handling
- Protocol skills: http-apis (REST/GraphQL), databases (Postgres), file-servers (FTP/SFTP/SMB)`,
  inputSchema: {
    type: "object",
    properties: {
      skills: {
        type: "array",
        items: {
          type: "string",
          enum: [...SKILL_NAMES],
        },
        description: "Array of skill names to load",
      },
    },
    required: ["skills"],
  },
});

const runReadSkill = async (input: any, _ctx: ToolExecutionContext) => {
  const { skills } = input;
  const validSkills = (skills as string[]).filter((s): s is SkillName =>
    SKILL_NAMES.includes(s as SkillName),
  );
  const invalid = (skills as string[]).filter((s) => !SKILL_NAMES.includes(s as SkillName));

  if (validSkills.length === 0) {
    return {
      success: false,
      error: `No valid skill names provided. Available: ${SKILL_NAMES.join(", ")}`,
    };
  }

  const { loadSkills } = await import("../skills/load-skills");
  const content = loadSkills(validSkills);
  return {
    success: true,
    loaded: validSkills,
    ...(invalid.length > 0 ? { invalid_skills: invalid } : {}),
    content,
  };
};

const inspectToolDefinition = (): ToolDefinition => ({
  name: "inspect_tool",
  description: `Inspect specific parts of the current playground tool configuration and execution results in detail.
    Request all needed sections and steps in a single call — both accept multiple items.
    Unlike find_tool (which looks up saved tools by ID/query), this inspects the current draft in the playground.`,
  inputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "instruction",
            "input_schema",
            "output_schema",
            "output_transform",
            "payload",
            "response_filters",
          ],
        },
        description: "Top-level sections to return in full",
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stepId: { type: "string" },
            include: {
              type: "array",
              items: {
                type: "string",
                enum: ["config", "result", "data_selector", "instruction"],
              },
            },
          },
          required: ["stepId", "include"],
        },
        description: "Specific steps to inspect, with what to include for each",
      },
    },
  },
});

const runInspectTool = async (
  input: { sections?: string[]; steps?: Array<{ stepId: string; include: string[] }> },
  ctx: ToolExecutionContext,
) => {
  const draft = ctx.playgroundDraft;
  if (!draft) {
    return {
      success: false,
      error: "No playground draft available. This tool only works in the tool playground.",
    };
  }

  const result: Record<string, any> = {};

  if (input.sections) {
    for (const section of input.sections) {
      switch (section) {
        case "instruction":
          result.instruction = draft.config.instruction || "";
          break;
        case "input_schema":
          result.inputSchema = draft.config.inputSchema || null;
          break;
        case "output_schema":
          result.outputSchema = draft.config.outputSchema || null;
          break;
        case "output_transform":
          result.outputTransform = draft.config.outputTransform || null;
          break;
        case "payload":
          result.payload = Object.keys(ctx.filePayloads).length > 0 ? ctx.filePayloads : null;
          break;
        case "response_filters":
          result.responseFilters = (draft.config as any).responseFilters || [];
          break;
      }
    }
  }

  if (input.steps) {
    result.steps = {};
    const configSteps = draft.config.steps || [];
    for (const req of input.steps) {
      const step = configSteps.find((s: any) => s.id === req.stepId);
      if (!step) {
        result.steps[req.stepId] = { error: `Step "${req.stepId}" not found` };
        continue;
      }
      const stepData: Record<string, any> = {};
      for (const field of req.include) {
        switch (field) {
          case "config":
            stepData.config = step.config || null;
            break;
          case "result":
            stepData.result = draft.executionResults?.[req.stepId] || {
              status: "no_result",
            };
            break;
          case "data_selector":
            stepData.dataSelector = step.dataSelector || null;
            break;
          case "instruction":
            stepData.instruction = step.instruction || null;
            break;
        }
      }
      result.steps[req.stepId] = stepData;
    }
  }

  return { success: true, ...result };
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
    confirmation: {
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      processConfirmation: processCreateSystemConfirmation,
    },
  },
  edit_system: {
    name: "edit_system",
    definition: editSystemDefinition,
    execute: runEditSystem,
    confirmation: {
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
      processConfirmation: processEditSystemConfirmation,
    },
  },
  call_system: {
    name: "call_system",
    definition: callSystemDefinition,
    execute: runCallSystem,
    confirmation: {
      validActions: [ConfirmationAction.CONFIRMED, ConfirmationAction.DECLINED],
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
      validActions: [
        ConfirmationAction.OAUTH_SUCCESS,
        ConfirmationAction.OAUTH_FAILURE,
        ConfirmationAction.DECLINED,
      ],
      processConfirmation: processAuthenticateOAuthConfirmation,
    },
  },
  edit_payload: {
    name: "edit_payload",
    definition: editPayloadDefinition,
    execute: runEditPayload,
    confirmation: {
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
  read_skill: {
    name: "read_skill",
    definition: readSkillDefinition,
    execute: runReadSkill,
  },
  inspect_tool: {
    name: "inspect_tool",
    definition: inspectToolDefinition,
    execute: runInspectTool,
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
  "find_tool",
  "find_system",
  "read_skill",
];

export const TOOL_PLAYGROUND_TOOL_SET = [
  "edit_tool",
  "edit_payload",
  "run_tool",
  "save_tool",
  "search_documentation",
  "call_system",
  "edit_system",
  "authenticate_oauth",
  "find_tool",
  "find_system",
  "read_skill",
  "inspect_tool",
];

export const SYSTEM_PLAYGROUND_TOOL_SET = [
  "edit_system",
  "call_system",
  "authenticate_oauth",
  "find_system",
  "search_documentation",
  "read_skill",
];
