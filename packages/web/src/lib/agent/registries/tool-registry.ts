import vm from "node:vm";
import { resolveOAuthConfig } from "@/src/lib/oauth-utils";
import { applyDiffsToConfig } from "@/src/lib/config-diff-utils";
import {
  ConfirmationAction,
  ToolResult,
  getToolSystemIds,
  getConnectionProtocol,
  isRequestConfig,
  mergeCredentials,
  normalizeToolSchemas,
  toJsonSchema,
  convertRequiredToArray,
  slugify,
  ToolDiff,
  Tool,
  RequestSource,
  SystemAccessLevel,
  validateToolStructure,
} from "@superglue/shared";
import { systems, findTemplateForSystem } from "@superglue/shared/templates";
import * as jsonpatch from "fast-json-patch";
import { findDraftInMessages } from "../agent-context";
import {
  buildEditToolApprovalMessage,
  buildEditToolConfirmationOutput,
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
  resolveOriginalConfig,
  formatSystemKnowledgeForOutput,
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
import {
  canKeepDraftOnlyOnAccept,
  createNewTool,
  shouldDefaultSaveOnAccept,
} from "../agent-tools/tool-persistence";

const buildToolDefinition = (): ToolDefinition => ({
  name: "build_tool",
  description: `Builds a new superglue tool by accepting the full tool configuration JSON.
    Load the tool-building skill via load_skill first — it contains the exact config structure and build recipe.
    In the main agent, successful builds are auto-saved. In the tool playground, builds remain draft-only until explicitly saved.`,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Tool ID in kebab-case (e.g., 'stripe-list-orders')" },
      instruction: {
        type: "string",
        description: "Brief human-readable tool instruction. 2 - 3 sentences.",
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "camelCase step identifier" },
            instruction: {
              type: "string",
              description: "Short human-readable step instruction.",
            },
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
          required: ["id", "instruction", "config", "modify"],
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
    },
    required: ["id", "instruction", "steps"],
  },
});

const runBuildTool = async (input: any, ctx: ToolExecutionContext) => {
  const { id, instruction, steps, outputTransform, outputSchema, payload } = input;

  if (!instruction || typeof instruction !== "string" || instruction.trim().length === 0) {
    return {
      success: false,
      error: "Tool instruction is required and must be a short human-friendly sentence",
    };
  }

  const toolConfig = { id, instruction, steps, outputTransform, outputSchema };

  const validation = validateToolStructure(toolConfig);
  if (validation.valid === false) {
    return {
      success: false,
      error: validation.error,
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
        toJsonSchema(resolvedPayload, {
          arrays: { mode: "all" },
          required: true,
          requiredDepth: 2,
        }),
      );
    } catch {
      inputSchema = undefined;
    }
  }

  const builtConfig = stripLegacyToolFields({
    ...toolConfig,
    inputSchema,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (ctx.agentId !== "main") {
    const draftId = `draft_${crypto.randomUUID()}`;

    return {
      success: true,
      draftId,
      toolId: builtConfig.id,
      persistence: "draft_only",
      config: builtConfig,
    };
  }

  try {
    const savedTool = await createNewTool(ctx, builtConfig);
    return {
      success: true,
      toolId: savedTool.id,
      persistence: "saved",
      config: stripLegacyToolFields(savedTool),
    };
  } catch (error: any) {
    if (error?.message?.includes("already exists")) {
      return {
        success: false,
        error: error.message,
      };
    }

    const draftId = `draft_${crypto.randomUUID()}`;
    return {
      success: true,
      draftId,
      toolId: builtConfig.id,
      persistence: "draft_only",
      saveError: error?.message || "Failed to save tool",
      config: builtConfig,
    };
  }
};

const runToolDefinition = (): ToolDefinition => ({
  name: "run_tool",
  description:
    "Executes a tool — either a draft (by draftId) or a saved tool (by toolId), not both. Use file::<key> syntax in payload for file references. Set includeStepResults: true only when debugging wrong/empty output. Set returnFullConfig: true only when you need the full config.",
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
      returnFullConfig: {
        type: "boolean",
        description:
          "Whether to include the full executed tool config in the output. Defaults to false. A lightweight step summary is always returned; only set true when you need the complete config.",
      },
      includeStepResults: {
        type: "boolean",
        description:
          "Whether to include raw step-level results in the output. Defaults to false. Set true when debugging issues with output data (wrong, empty, or missing fields) to inspect what each step returned before transformation.",
      },
    },
  },
});

const runRunTool = async (input: any, ctx: ToolExecutionContext) => {
  const { draftId, toolId, payload, returnFullConfig = false, includeStepResults = false } = input;

  const idValidation = validateDraftOrToolId(draftId, toolId);
  if (idValidation.valid === false) {
    return { success: false, error: idValidation.error };
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
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
    if (!toolConfig) {
      return {
        success: false,
        error: `Tool '${toolId}' not found`,
      };
    }
    inputSchema = toolConfig.inputSchema?.properties?.payload || toolConfig.inputSchema;
  } else {
    const draft =
      draftId === "playground-draft" && ctx.playgroundDraft
        ? ctx.playgroundDraft
        : findDraftInMessages(ctx.messages || [], draftId);
    if (!draft) {
      return {
        success: false,
        error: `Draft not found: ${draftId}`,
      };
    }
    toolConfig = draft.config;
    inputSchema = draft.config.inputSchema;
    isDraft = true;
  }

  const maybeConfig = returnFullConfig ? { config: stripLegacyToolFields(toolConfig) } : {};

  const toolSummary = {
    id: toolConfig.id,
    hasOutputTransform: !!toolConfig.outputTransform,
    steps: (toolConfig.steps || []).map((s: any) => ({
      id: s.id,
      type: s.config?.type || "request",
      systemId: isRequestConfig(s.config) ? s.config.systemId : undefined,
    })),
  };

  const validation = validateRequiredFields(inputSchema, resolvedPayload);
  if (validation.valid === false) {
    const { missingFields, schema } = validation;
    return {
      success: false,
      ...(isDraft ? { draftId } : {}),
      error: `Missing required input fields: ${missingFields.join(", ")}`,
      toolSummary,
      ...maybeConfig,
      inputSchema: schema,
      providedPayload: resolvedPayload,
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
          options: { requestSource: RequestSource.FRONTEND },
        });

    if (!result.success) {
      return {
        success: false,
        ...(isDraft ? { draftId, traceId } : {}),
        ...(includeStepResults ? { stepResults: result.stepResults } : {}),
        toolSummary,
        ...maybeConfig,
        data: result.data,
        error: result.error,
      };
    }

    return {
      success: true,
      ...(isDraft
        ? {
            draftId,
            traceId,
          }
        : {}),
      ...(includeStepResults ? { stepResults: result.stepResults } : {}),
      toolSummary,
      ...maybeConfig,
      data: result.data,
    };
  } catch (error: any) {
    return {
      success: false,
      ...(isDraft ? { draftId, traceId } : {}),
      toolSummary,
      ...maybeConfig,
      error: error.message,
    };
  }
};

const editToolDefinition = (): ToolDefinition => ({
  name: "edit_tool",
  description:
    "Modifies a tool using JSON Patch operations. Load the tool-editing skill first. Provide either draftId (from build_tool) OR toolId, not both. You MUST include payload with the same test data from build_tool. Confirmation results explicitly state whether changes were saved or kept draft-only.",
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
    return { success: false, error: idValidation.error };
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
    };
  }

  const patchValidation = validatePatches(patches);
  if (!patchValidation.valid) {
    return {
      success: false,
      error: patchValidation.error,
    };
  }

  try {
    const toolCopy = normalizeToolSchemas(JSON.parse(JSON.stringify(draft.config)));
    const result = jsonpatch.applyPatch(toolCopy, patches, true, true);
    const patchedTool = result.newDocument || toolCopy;

    const normalizedTool = normalizeToolSchemas(patchedTool);

    const toolValidation = validateToolStructure(normalizedTool);
    if (toolValidation.valid === false) {
      return {
        success: false,
        error: toolValidation.error,
      };
    }

    const fixedTool = {
      ...normalizedTool,
      instruction: draft.instruction || normalizedTool.instruction,
      createdAt: draft.config.createdAt,
      updatedAt: new Date(),
    };

    const isPlayground = workingDraftId === "playground-draft";

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
      defaultSaveOnAccept: shouldDefaultSaveOnAccept(ctx),
      allowDraftOnlyAccept: canKeepDraftOnlyOnAccept(ctx),
      ...(isPlayground ? {} : { originalConfig: stripLegacyToolFields(draft.config as Tool) }),
      diffs,
    };
  } catch (error: any) {
    return {
      success: false,
      draftId: workingDraftId,
      error: `Error applying patches: ${error.message}`,
    };
  }
};

const processEditToolConfirmation = async (
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

  const isPlayground = parsedOutput.draftId === "playground-draft";
  const saveResult = parsedOutput.confirmationData?.saveResult;

  if (parsedOutput.confirmationState === "confirmed") {
    const originalConfig =
      parsedOutput.originalConfig ||
      (await resolveOriginalConfig(parsedOutput.draftId, parsedOutput.toolId, ctx));

    let config: any = originalConfig;
    if (originalConfig && parsedOutput.diffs?.length > 0) {
      try {
        config = applyDiffsToConfig(originalConfig, parsedOutput.diffs);
      } catch {
        config = originalConfig;
      }
    }

    if (isPlayground && config) {
      const systemIds = getToolSystemIds(config);
      ctx.playgroundDraft = {
        config,
        systemIds,
        instruction: config.instruction || "",
      };
    }

    const confirmOutput = buildEditToolConfirmationOutput(
      {
        ...parsedOutput,
        userApproved: true,
        message: buildEditToolApprovalMessage({ saveResult }),
      },
      saveResult,
      { keepDraftIdOnSave: isPlayground },
    );

    if (!isPlayground && confirmOutput.persistence === "draft_only" && config) {
      confirmOutput.config = config;
    }

    return {
      output: JSON.stringify(confirmOutput),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === "partial") {
    const approvedDiffs = parsedOutput.confirmationData?.appliedChanges || [];
    const rejectedDiffs = parsedOutput.confirmationData?.rejectedChanges || [];

    const originalConfig =
      parsedOutput.originalConfig ||
      (await resolveOriginalConfig(parsedOutput.draftId, parsedOutput.toolId, ctx));

    let updatedConfig = originalConfig;
    if (originalConfig && approvedDiffs.length > 0) {
      try {
        updatedConfig = applyDiffsToConfig(originalConfig, approvedDiffs);
      } catch (e) {
        console.error("[edit_tool] Failed to apply approved diffs:", e);
        updatedConfig = originalConfig;
      }
    }

    if (isPlayground && updatedConfig) {
      const systemIds = getToolSystemIds(updatedConfig);
      ctx.playgroundDraft = {
        config: updatedConfig,
        systemIds,
        instruction: updatedConfig.instruction || "",
      };
    }

    const partialOutput = buildEditToolConfirmationOutput(
      {
        ...parsedOutput,
        userApproved: true,
        partialApproval: true,
        message: buildEditToolApprovalMessage({
          saveResult,
          approvedCount: approvedDiffs.length,
          rejectedCount: rejectedDiffs.length,
        }),
        approvedDiffs,
        rejectedDiffs,
      },
      saveResult,
      { keepDraftIdOnSave: isPlayground },
    );

    if (!isPlayground && partialOutput.persistence === "draft_only" && updatedConfig) {
      partialOutput.config = updatedConfig;
    }

    return {
      output: JSON.stringify(partialOutput),
      status: "completed",
    };
  } else if (parsedOutput.confirmationState === "declined") {
    return {
      output: JSON.stringify({
        ...parsedOutput,
        userApproved: false,
        rejected: true,
        message: "All changes rejected by user.",
        originalConfig: undefined,
        confirmationState: undefined,
        confirmationData: undefined,
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
      persistence: "saved",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
};

const createSystemDefinition = (): ToolDefinition => ({
  name: "create_system",
  description:
    "Creates and saves a new system. Load the systems-handling skill first. Provide templateId to auto-populate from known services. Use find_system first to check existence and get template info.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Optional unique identifier for the system (e.g., 'slack', 'github_api', 'stripe'). Use only lowercase letters, numbers, and underscores — no hyphens. If not provided, will be derived from the name. If a system with this ID already exists, a suffix like '_1' will be appended.",
      },
      name: {
        type: "string",
        description:
          "Human-readable display name for the system (e.g., 'Slack API', 'GitHub REST API'). Auto-populated if using templateId.",
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
          "Non-sensitive credentials only: e.g. auth_url, token_url, scopes, grant_type, redirect_uri.",
      },
      sensitiveCredentials: {
        type: "object",
        description:
          "Do not use for preconfigured OAuth systems. Sensitive credentials requiring secure user input via UI. Set field(s) to true to request it. Example: { client_id: true, client_secret: true, api_key: true }.",
      },
      environment: {
        type: "string",
        enum: ["dev", "prod"],
        description:
          "Set to 'dev' for development systems, 'prod' for production systems. Environment is immutable after creation. To create a linked dev/prod pair, create both systems with the same ID but different environment values.",
      },
    },
    required: ["name"],
  },
});

const runCreateSystem = async (input: any, ctx: ToolExecutionContext) => {
  let {
    templateId,
    sensitiveCredentials,
    documentationUrl,
    openApiUrl,
    files,
    environment,
    ...systemInput
  } = input;

  // Validate credentials and sensitiveCredentials are objects, not JSON strings
  if (systemInput.credentials && typeof systemInput.credentials === "string") {
    return {
      success: false,
      error: "credentials must be an object, not a JSON string",
    };
  }

  if (sensitiveCredentials && typeof sensitiveCredentials === "string") {
    return {
      success: false,
      error: "sensitiveCredentials must be an object, not a JSON string",
    };
  }

  if (templateId) {
    const template = systems[templateId];
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`,
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

  // Add environment field to the system input
  if (environment === "dev" || environment === "prod") {
    systemInput.environment = environment;
  }

  if (!systemInput.id && systemInput.name) {
    systemInput.id = slugify(systemInput.name);
  }
  if (!systemInput.name) {
    return { success: false, error: "System name is required" };
  }

  const fileUploadResult = extractFilePayloadsForUpload(files, ctx.filePayloads);
  if ("error" in fileUploadResult) {
    return {
      success: false,
      error: fileUploadResult.error,
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
        }),
        status: "completed",
      };
    }

    if (!systemConfig.id && systemConfig.name) {
      systemConfig.id = slugify(systemConfig.name);
    }
    if (!systemConfig.name) {
      return {
        output: JSON.stringify({
          success: false,
          error: "System name is required",
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
  description:
    "Edits an existing system. Load the systems-handling skill first. Provide only the fields to change — omitted fields are preserved. Cannot remove existing documentation, only append via files field.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The unique identifier of the system" },
      environment: {
        type: "string",
        enum: ["dev", "prod"],
        description:
          "Which environment's system to edit. Defaults to 'prod'. Use 'dev' for sandbox/development systems.",
      },
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
          "OAuth flow metadata ONLY: auth_url, token_url, scopes, grant_type, redirect_uri. Do NOT put credential values like client_id, client_secret, or api_key here — use sensitiveCredentials instead.",
      },
      sensitiveCredentials: {
        type: "object",
        description:
          "ALL credential values the user must provide. Set field(s) to true to request via secure UI. Example: { client_id: true, client_secret: true } or { api_key: true }. NEVER ask users to paste credential values in chat — always use this field.",
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
  let { sensitiveCredentials, files, scrapeUrl, scrapeKeywords, environment, ...systemInput } =
    input;

  // Validate credentials and sensitiveCredentials are objects, not JSON strings
  if (systemInput.credentials && typeof systemInput.credentials === "string") {
    return {
      success: false,
      error: "credentials must be an object, not a JSON string",
    };
  }

  if (sensitiveCredentials && typeof sensitiveCredentials === "string") {
    return {
      success: false,
      error: "sensitiveCredentials must be an object, not a JSON string",
    };
  }

  // Default to prod if not specified
  const env: "dev" | "prod" = environment === "dev" ? "dev" : "prod";

  const fileUploadResult = extractFilePayloadsForUpload(files, ctx.filePayloads);
  if ("error" in fileUploadResult) {
    return {
      success: false,
      error: fileUploadResult.error,
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
    const existingSystem = await ctx.superglueClient.getSystem(patchPayload.id, {
      environment: env,
    });
    if (!existingSystem) {
      return {
        success: false,
        error: `System not found (id: ${patchPayload.id}, environment: ${env})`,
      };
    }

    const hasPatch = hasPatchableSystemFields(patchPayload);
    const hasFiles = fileUploadResult.files.length > 0;
    const hasScrape = !!scrapeInput;

    if (!hasPatch && !hasFiles && !hasScrape) {
      return {
        success: false,
        error: "No changes provided. Include at least one system field, files, or scrapeUrl.",
      };
    }

    if (!hasPatch && hasFiles) {
      await ctx.superglueClient.uploadSystemFileReferences(patchPayload.id, fileUploadResult.files);
      const updated = await ctx.superglueClient.getSystem(patchPayload.id, { environment: env });
      const scrapeWarning = await tryTriggerScrapeJob(ctx, patchPayload.id, scrapeInput);
      return {
        success: true,
        system: filterSystemFields(updated || existingSystem),
        ...(scrapeWarning ? { warning: scrapeWarning } : {}),
      };
    }

    if (!hasPatch && !hasFiles && hasScrape) {
      const scrapeWarning = await tryTriggerScrapeJob(ctx, patchPayload.id, scrapeInput);
      if (scrapeWarning) {
        return {
          success: true,
          system: filterSystemFields(existingSystem),
          warning: scrapeWarning,
        };
      }
      return {
        success: true,
        system: filterSystemFields(existingSystem),
      };
    }

    if (patchPayload.credentials) {
      patchPayload.credentials = mergeCredentials(
        patchPayload.credentials,
        existingSystem?.credentials,
      );
    }

    const result = await ctx.superglueClient.updateSystem(patchPayload.id, patchPayload, {
      environment: env,
    });

    if (fileUploadResult.files.length > 0) {
      try {
        await ctx.superglueClient.uploadSystemFileReferences(result.id, fileUploadResult.files);
      } catch (uploadError: any) {
        return {
          success: true,
          system: filterSystemFields(result),
          warning: `System updated but file upload failed: ${uploadError.message}`,
        };
      }
    }

    const scrapeWarning = await tryTriggerScrapeJob(ctx, result.id, scrapeInput);
    if (scrapeWarning) {
      return {
        success: true,
        system: filterSystemFields(result),
        warning: `System updated but ${scrapeWarning}`,
      };
    }

    return {
      success: true,
      system: filterSystemFields(result),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
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

  const env: "dev" | "prod" = input?.environment === "dev" ? "dev" : "prod";

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
      environment: _env, // Remove environment from cleanSystemConfig as it's immutable
      ...cleanSystemConfig
    } = systemConfig;

    if (templateId && !cleanSystemConfig.templateName) {
      cleanSystemConfig.templateName = templateId;
    }

    try {
      const existingSystem = await ctx.superglueClient.getSystem(cleanSystemConfig.id, {
        environment: env,
      });
      if (!existingSystem) {
        return {
          output: JSON.stringify({
            success: false,
            error: `System not found (id: ${cleanSystemConfig.id}, environment: ${env})`,
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
          }),
          status: "completed",
        };
      }
      if (!hasPatch && hasFilesToUpload && !("error" in fileUploadResult)) {
        await ctx.superglueClient.uploadSystemFileReferences(
          cleanSystemConfig.id,
          fileUploadResult.files,
        );
        const updated = await ctx.superglueClient.getSystem(cleanSystemConfig.id, {
          environment: env,
        });
        const scrapeWarning = await tryTriggerScrapeJob(ctx, cleanSystemConfig.id, scrapeInput);
        return {
          output: JSON.stringify({
            success: true,
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
              system: filterSystemFields(existingSystem),
              warning: scrapeWarning,
            }),
            status: "completed",
          };
        }
        return {
          output: JSON.stringify({
            success: true,
            system: filterSystemFields(existingSystem),
          }),
          status: "completed",
        };
      }

      const finalCredentials = mergeCredentials(
        { ...(cleanSystemConfig.credentials || {}), ...userProvidedCredentials },
        existingSystem?.credentials,
      );

      const result = await ctx.superglueClient.updateSystem(
        cleanSystemConfig.id,
        {
          ...cleanSystemConfig,
          credentials: finalCredentials,
        },
        { environment: env },
      );
      const scrapeWarning = await tryTriggerScrapeJob(ctx, result.id, scrapeInput);
      if (scrapeWarning) {
        return {
          output: JSON.stringify({
            success: true,
            system: filterSystemFields(result),
            warning: `System updated but ${scrapeWarning}`,
          }),
          status: "completed",
        };
      }
      return {
        output: JSON.stringify({
          success: true,
          system: filterSystemFields(result),
        }),
        status: "completed",
      };
    } catch (error: any) {
      return {
        output: JSON.stringify({
          success: false,
          error: error.message,
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
      Load the relevant protocol skill via load_skill (databases for PostgreSQL/MSSQL, file-servers for FTP/SFTP/SMB, redis) before calling call_system for detailed usage patterns and URL formats.
      Use this to explore APIs, databases, and file servers, verify authentication, test endpoints, and examine response formats BEFORE building tools.
    </use_case>

    <important_notes>
      - Only call ONE AT A TIME - NEVER multiple call_system in parallel in the same turn.
      - Do not forget auth headers when required
      - Supports credential injection using placeholders: <<system_id_credential_key>>
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
      environment: {
        type: "string",
        enum: ["dev", "prod"],
        description:
          "Which environment's system credentials to use. Defaults to 'prod'. Use 'dev' for sandbox/development systems.",
      },
      url: {
        type: "string",
        description:
          "Full URL including protocol. Supports http(s)://, postgres://, postgresql://, mssql://, sqlserver://, redis://, rediss://, sftp://, ftp://, ftps://, smb://. Can use <<system_id_credential_key>> for credential injection.",
      },
      method: {
        type: "string",
        description: "HTTP method (only used for HTTP/HTTPS URLs)",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      },
      headers: {
        type: "object",
        description:
          'HTTP headers (only used for HTTP/HTTPS URLs). REQUIRED for authenticated APIs — include the system\'s credential placeholders (e.g., { "Authorization": "Bearer <<systemId_access_token>>" }). Check find_system output for available credentialPlaceholders.',
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
  const { systemId, environment, url, method, headers, body } = request;
  const protocol = getConnectionProtocol(url);

  const mode: "dev" | "prod" = environment === "dev" ? "dev" : "prod";

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
      mode,
    });

    const responseData = result.data?.data !== undefined ? result.data.data : result.data;

    return truncateResponseData({
      success: result.success,
      protocol,
      data: responseData,
      error: result.error,
    } as CallSystemResult);
  } catch (error) {
    return {
      success: false,
      protocol,
      error: error instanceof Error ? error.message : String(error),
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
    };
  }
};

const authenticateOAuthDefinition = (): ToolDefinition => ({
  name: "authenticate_oauth",
  description:
    "Initiates OAuth flow for a system. Load the systems-handling skill first. Credentials (client_id/secret) must already be stored on the system or provided by a preconfigured template. On success, tokens are auto-saved.",
  inputSchema: {
    type: "object",
    properties: {
      systemId: { type: "string", description: "ID of the system to authenticate" },
      environment: {
        type: "string",
        enum: ["dev", "prod"],
        description:
          "Which environment's system to authenticate. Defaults to 'prod'. Use 'dev' for sandbox/development systems.",
      },
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
  const env: "dev" | "prod" = input.environment === "dev" ? "dev" : "prod";

  try {
    const system = await ctx.superglueClient.getSystem(input.systemId, { environment: env });
    if (!system) {
      return {
        success: false,
        error: `System '${input.systemId}' (${env}) not found`,
      };
    }

    const templateOAuth = findTemplateForSystem(system)?.template.oauth;
    const oauthConfig = resolveOAuthConfig(input, system.credentials, templateOAuth);

    if (!oauthConfig.client_id) {
      return {
        success: false,
        error:
          "Missing client_id. The system does not have a client_id in its credentials and no matching template provides one.",
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
      };
    }

    if (!oauthConfig.auth_url || !oauthConfig.token_url) {
      return {
        success: false,
        error: "Missing auth_url or token_url for OAuth",
      };
    }

    const { client_secret: _secret, ...safeOauthConfig } = oauthConfig;

    return {
      success: true,
      requiresOAuth: true,
      oauthConfig: safeOauthConfig,
      system: filterSystemFields(system),
      message: "OAuth authentication ready. Click the button to authenticate.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
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
    // Get environment from input (original tool call) or parsedOutput, default to prod
    const env: "dev" | "prod" =
      input?.environment === "dev" || parsedOutput.environment === "dev" ? "dev" : "prod";

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
      const currentSystem = await ctx.superglueClient.getSystem(systemId, { environment: env });
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

      await ctx.superglueClient.updateSystem(
        systemId,
        { credentials: updatedCredentials },
        { environment: env },
      );

      return {
        output: JSON.stringify({
          success: true,
          systemId,
          environment: env,
          message: "OAuth authentication completed and credentials saved to system.",
        }),
        status: "completed",
      };
    } catch (error: any) {
      return {
        output: JSON.stringify({
          success: false,
          error: `OAuth succeeded but failed to save credentials: ${error.message}`,
        }),
        status: "completed",
      };
    }
  }

  return { output: JSON.stringify(parsedOutput), status: "completed" };
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

function summarizeTool(t: any) {
  return {
    id: t.id,
    instruction: t.instruction,
    inputSchema: t.inputSchema,
    outputSchema: t.outputSchema,
    steps: t.steps?.map((s: any) => ({
      systemId: s.config?.systemId,
      instruction: s.instruction,
      ...(s.config?.url
        ? {
            config: {
              url: s.config.url,
              method: s.config.method,
              queryParams: s.config.queryParams,
              headers: s.config.headers,
              body: s.config.body,
            },
          }
        : {}),
    })),
  };
}

function keywordFilterTools(query: string, tools: any[]) {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 0);

  const scored = tools.map((tool) => {
    const searchableText = [
      tool.id,
      tool.name,
      tool.instruction,
      ...(tool.steps || []).map((s: any) => s.instruction),
      ...(tool.steps || []).map((s: any) => s.config?.systemId),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchedKeywords = keywords.filter((kw) => searchableText.includes(kw));
    return { tool, score: matchedKeywords.length };
  });

  const matches = scored.filter((s) => s.score > 0);
  if (matches.length === 0) return tools;
  matches.sort((a, b) => b.score - a.score);
  return matches.map((m) => m.tool);
}

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
      if (tool.archived) {
        return { success: false, error: `Tool '${input.id}' is archived` };
      }
      return { success: true, tool };
    }

    const rawQuery = (input.query || "").trim();
    const { items } = await ctx.superglueClient.listWorkflows(1000);

    const filtered =
      !rawQuery || rawQuery === "*" || rawQuery === "all"
        ? items
        : keywordFilterTools(rawQuery, items);

    return { success: true, tools: filtered.map(summarizeTool) };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
};

const findSystemDefinition = (): ToolDefinition => ({
  name: "find_system",
  description: `Look up an existing system by ID or search for systems by query. Also returns system knowledge (OAuth config, documentation URL, etc.) if available for systems not yet created.
<use_case>Use before call_system, create_system, or edit_system to get full system configuration.</use_case>
<important_notes>
  - Use query "*" or omit both id and query to list all systems.
  - Search matches against system ID and URL.
  - Systems can have dev/prod environments. By default, returns ALL environments for matching systems.
  - Only specify environment parameter if you specifically need just one environment. When unsure, omit it to see all environments.
  - Credentials are MASKED — you cannot see actual API keys/secrets. When comparing dev vs prod, if configs look identical, the difference is in the credential VALUES (which are hidden). Don't tell users systems are "identical" when credentials are likely different.
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
      environment: {
        type: "string",
        enum: ["dev", "prod"],
        description:
          "Optional: Filter to a specific environment. If omitted, returns both dev and prod systems.",
      },
    },
  },
});

const runFindSystem = async (
  input: { id?: string; query?: string; environment?: "dev" | "prod" },
  ctx: ToolExecutionContext,
): Promise<any> => {
  const findMatchingSystemKnowledge = (searchQuery: string) => {
    const query = searchQuery.toLowerCase();
    const results: any[] = [];
    for (const template of Object.values(systems)) {
      const nameLower = template.name.toLowerCase();
      const nameNormalized = nameLower.replace(/[_-]/g, " ");
      const apiUrlLower = template.apiUrl?.toLowerCase();
      const regex = template.regex ? new RegExp(template.regex, "i") : null;
      const multiWordKeywords = (template.keywords || [])
        .filter((k) => k.includes(" "))
        .map((k) => k.toLowerCase());
      if (
        nameLower?.includes(query) ||
        nameNormalized?.includes(query) ||
        apiUrlLower?.includes(query) ||
        (regex && regex.test(query)) ||
        multiWordKeywords.some((kw) => kw.includes(query) || query.includes(kw))
      ) {
        results.push(formatSystemKnowledgeForOutput(template));
      }
    }
    return results;
  };

  try {
    const { items: allSystems } = await ctx.superglueClient.listSystems(1000, 1);

    let systems = input.environment
      ? allSystems.filter((s) => s.environment === input.environment)
      : allSystems;

    if (input.id) {
      systems = systems.filter((s) => s.id === input.id);

      if (systems.length === 0) {
        const matchingSystemKnowledge = findMatchingSystemKnowledge(input.id);
        return {
          success: false,
          error: input.environment
            ? `System '${input.id}' (${input.environment}) not found`
            : `System '${input.id}' not found`,
          matchingSystemKnowledge:
            matchingSystemKnowledge.length > 0 ? matchingSystemKnowledge : undefined,
        };
      }

      if (systems.length === 1) {
        return { success: true, systems: [filterSystemFields(systems[0])] };
      }
      return { success: true, systems: systems.map(filterSystemFields) };
    }

    // Filter by query (search in id, name, url)
    const rawQuery = (input.query || "").trim();

    if (rawQuery && rawQuery !== "*" && rawQuery !== "all") {
      const query = rawQuery.toLowerCase();
      const keywords = query.split(/\s+/).filter((k) => k.length > 0);
      systems = systems.filter((s) => {
        const text = [s.id, s.name, s.url].filter(Boolean).join(" ").toLowerCase();
        return keywords.some((kw) => text.includes(kw));
      });

      const matchingSystemKnowledge = findMatchingSystemKnowledge(rawQuery);

      return {
        success: true,
        systems: systems.map(filterSystemFields),
        matchingSystemKnowledge:
          systems.length === 0 && matchingSystemKnowledge.length > 0
            ? matchingSystemKnowledge
            : undefined,
      };
    }

    return { success: true, systems: systems.map(filterSystemFields) };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
};

const loadSkillDefinition = (): ToolDefinition => ({
  name: "load_skill",
  description: `Loads superglue skills into context.

Available skills:
${skillIndexDescription}

Some skills include additional tools that become available after loading.`,
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

const runLoadSkill = async (input: any, ctx: ToolExecutionContext) => {
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

  for (const s of validSkills) ctx.loadedSkills.add(s);

  const toolsLoaded = validSkills.flatMap((s) => SKILL_GATED_TOOLS[s] ?? []);

  return {
    success: true,
    loaded: validSkills,
    ...(invalid.length > 0 ? { invalid_skills: invalid } : {}),
    ...(toolsLoaded.length > 0 ? { toolsLoaded } : {}),
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

const inspectSystemDefinition = (): ToolDefinition => ({
  name: "inspect_system",
  description: `Inspect specific parts of the current system editor state in detail.
    Unlike find_system (which looks up the saved server-side system), this inspects the current unsaved system editor state in the sidebar.`,
  inputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "system_id",
            "url",
            "template_name",
            "auth_type",
            "credential_keys",
            "specific_instructions",
            "section_statuses",
          ],
        },
        description: "Top-level sections to return from the current system editor state",
      },
    },
  },
});

const runInspectSystem = async (input: { sections?: string[] }, ctx: ToolExecutionContext) => {
  const system = ctx.systemPlaygroundContext;
  if (!system) {
    return {
      success: false,
      error: "No system editor state available. This tool only works in the system playground.",
    };
  }

  const sections =
    input.sections && input.sections.length > 0
      ? input.sections
      : [
          "system_id",
          "url",
          "template_name",
          "auth_type",
          "credential_keys",
          "specific_instructions",
          "section_statuses",
        ];

  const result: Record<string, any> = {};

  for (const section of sections) {
    switch (section) {
      case "system_id":
        result.systemId = system.systemId;
        break;
      case "url":
        result.url = system.url;
        break;
      case "template_name":
        result.templateName = system.templateName || null;
        break;
      case "auth_type":
        result.authType = system.authType;
        break;
      case "credential_keys":
        result.credentialKeys = system.credentialKeys;
        break;
      case "specific_instructions":
        result.specificInstructions = system.specificInstructions;
        break;
      case "section_statuses":
        result.sectionStatuses = system.sectionStatuses;
        break;
    }
  }

  return { success: true, ...result };
};

const findRoleDefinition = (): ToolDefinition => ({
  name: "find_role",
  description:
    "Look up a saved role by ID, or list all roles. Returns the persisted role configuration (not the current UI draft). Use inspect_role for the current draft state.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Exact role ID to look up" },
      query: {
        type: "string",
        description: 'Search query to match against role name/ID. Use "*" to list all roles.',
      },
    },
  },
});

const runFindRole = async (
  input: { id?: string; query?: string },
  ctx: ToolExecutionContext,
): Promise<any> => {
  try {
    if (input.id) {
      const role = await ctx.superglueClient.getRole(input.id);
      if (!role) return { success: false, error: `Role '${input.id}' not found` };
      return { success: true, roles: [role] };
    }

    const allRoles = await ctx.superglueClient.listRoles();
    if (!input.query || input.query === "*") {
      return {
        success: true,
        roles: allRoles.map((r) => ({ id: r.id, name: r.name, description: r.description })),
      };
    }

    const q = input.query.toLowerCase();
    const matches = allRoles.filter(
      (r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
    if (!matches.length) return { success: false, error: `No roles matching '${input.query}'` };
    return {
      success: true,
      roles: matches.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        tools: r.tools,
        systems: r.systems,
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
};

const inspectRoleDefinition = (): ToolDefinition => ({
  name: "inspect_role",
  description:
    "Read the current role configuration draft. Returns tool permissions, system access levels (with inline custom rules), members assigned to this role, and lists of available tools/systems.",
  inputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "role_info",
            "tools",
            "systems",
            "available_tools",
            "available_systems",
            "members",
          ],
        },
        description: "Sections to return. Omit for all.",
      },
    },
  },
});

const runInspectRole = async (input: { sections?: string[] }, ctx: ToolExecutionContext) => {
  const arc = ctx.accessRulesContext;
  if (!arc) {
    return {
      success: false,
      error: "No access rules context available. This tool only works in the access rules view.",
    };
  }

  const allSections = !input.sections || input.sections.length === 0;
  const result: Record<string, any> = {};

  if (allSections || input.sections?.includes("role_info")) {
    result.roleInfo = {
      id: arc.role.id,
      name: arc.role.name,
      description: arc.role.description,
      isBaseRole: arc.role.isBaseRole || false,
      canEdit: arc.role.id !== "admin",
      canEditDescription: !arc.role.isBaseRole,
      isEditing: arc.isEditing,
    };
  }

  if (allSections || input.sections?.includes("tools")) {
    result.tools = arc.role.tools;
  }

  if (allSections || input.sections?.includes("systems")) {
    result.systems = arc.role.systems;
  }

  if (allSections || input.sections?.includes("available_tools")) {
    result.availableTools = arc.availableTools;
  }

  if (allSections || input.sections?.includes("available_systems")) {
    result.availableSystems = arc.availableSystems;
  }

  if (allSections || input.sections?.includes("members")) {
    const roleId = arc.role.id;
    result.members = arc.users
      .filter((u) => {
        if (roleId === "admin") return u.roleIds.includes("admin");
        if (roleId === "member") return u.userType === "member";
        if (roleId === "enduser") return u.userType === "end_user";
        return u.roleIds.includes(roleId);
      })
      .map((u) => ({ id: u.id, email: u.email, name: u.name, userType: u.userType }));
  }

  return { success: true, ...result };
};

const editRoleDefinition = (): ToolDefinition => ({
  name: "edit_role",
  description:
    "Edit a role's access configuration. You must specify the roleId of the role currently selected in the UI. Only specify fields you want to change — unmentioned fields are preserved. Changes apply to the local draft; the user must click Save to persist.",
  inputSchema: {
    type: "object",
    properties: {
      roleId: {
        type: "string",
        description:
          "ID of the role to edit. Must match the role currently selected in the UI. Use inspect_role to check which role is selected.",
      },
      toolAccess: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["ALL", "SPECIFIC"],
            description: "Switch between all-tools and specific-tools mode",
          },
          add: {
            type: "array",
            items: { type: "string" },
            description: "Tool IDs to add to the allowlist",
          },
          remove: {
            type: "array",
            items: { type: "string" },
            description: "Tool IDs to remove from the allowlist",
          },
        },
        description: "Changes to tool permissions. Omit to leave unchanged.",
      },
      systemAccess: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["ALL", "SPECIFIC"],
            description:
              "Switch between all-systems (full read-write on everything, including future systems) and specific-systems mode",
          },
          set: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: ["READ_ONLY", "READ_WRITE"],
            },
            description:
              "Map of systemId -> access level to set or update (only in SPECIFIC mode). Setting a level replaces any custom rule on that system.",
          },
          setRule: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                name: { type: "string" },
                expression: {
                  type: "string",
                  description:
                    "JS expression receiving the resolved stepConfig (with actual runtime URL, headers, body, queryParams), must return truthy to allow",
                },
              },
              required: ["name", "expression"],
            },
            description:
              "Map of systemId -> custom rule to set. Replaces the system's access level with a custom rule. Only in SPECIFIC mode.",
          },
          remove: {
            type: "array",
            items: { type: "string" },
            description:
              "System IDs to remove from the allowlist (only in SPECIFIC mode). Removing a system also removes its custom rule.",
          },
        },
        description: "Changes to system permissions. Omit to leave unchanged.",
      },
      description: {
        type: "string",
        description: "Updated role description. Omit to leave unchanged.",
      },
      explanation: {
        type: "string",
        description: "Brief explanation of what changed and why",
      },
    },
    required: ["roleId", "explanation"],
  },
});

const runEditRole = async (
  input: {
    roleId: string;
    toolAccess?: { mode?: "ALL" | "SPECIFIC"; add?: string[]; remove?: string[] };
    systemAccess?: {
      mode?: "ALL" | "SPECIFIC";
      set?: Record<string, string>;
      setRule?: Record<string, { name: string; expression: string }>;
      remove?: string[];
    };
    description?: string;
    explanation: string;
  },
  ctx: ToolExecutionContext,
) => {
  const arc = ctx.accessRulesContext;
  if (!arc) {
    return {
      success: false,
      error: "No access rules context available. This tool only works in the access rules view.",
    };
  }

  if (input.roleId !== arc.role.id) {
    return {
      success: false,
      error: `Cannot edit role '${input.roleId}' — the user currently has '${arc.role.name}' (${arc.role.id}) selected. You can only edit the role that is currently in focus. Ask the user to switch to '${input.roleId}' first.`,
    };
  }

  if (arc.role.id === "admin") {
    return { success: false, error: "The admin role is immutable and cannot be edited." };
  }

  const isBaseRole = arc.role.isBaseRole && arc.role.id !== "admin";

  const newConfig: Record<string, any> = {
    tools: arc.role.tools === "ALL" ? ("ALL" as const) : [...arc.role.tools],
    systems: arc.role.systems === "ALL" ? ("ALL" as const) : { ...arc.role.systems },
    description: isBaseRole ? arc.role.description : arc.role.description,
  };

  if (input.toolAccess) {
    const ta = input.toolAccess;
    if (ta.mode === "ALL") {
      newConfig.tools = "ALL";
    } else if (ta.mode === "SPECIFIC") {
      if (!Array.isArray(newConfig.tools)) {
        newConfig.tools = [];
      }
    }

    if (ta.add?.length && Array.isArray(newConfig.tools)) {
      const invalid = ta.add.filter((id) => !arc.availableTools.some((t) => t.id === id));
      if (invalid.length) {
        return {
          success: false,
          error: `Unknown tool IDs: ${invalid.join(", ")}. Use find_tool to discover available tools.`,
        };
      }
      const added = ta.add.filter((id) => !(newConfig.tools as string[]).includes(id));
      (newConfig.tools as string[]).push(...added);
    }

    if (ta.remove?.length && Array.isArray(newConfig.tools)) {
      newConfig.tools = newConfig.tools.filter((id: string) => !ta.remove!.includes(id));
    }
  }

  if (input.systemAccess) {
    const sa = input.systemAccess;
    if (sa.mode === "ALL") {
      if (sa.setRule && Object.keys(sa.setRule).length > 0) {
        return {
          success: false,
          error: `Cannot set systems mode to "ALL" and add custom rules in the same call. Custom rules only apply in SPECIFIC mode.`,
        };
      }
      newConfig.systems = "ALL";
    } else if (sa.mode === "SPECIFIC") {
      if (newConfig.systems === "ALL") {
        newConfig.systems = {};
      }
    }

    if (sa.set && newConfig.systems !== "ALL") {
      const invalid = Object.keys(sa.set).filter(
        (id) => !arc.availableSystems.some((s) => s.id === id),
      );
      if (invalid.length) {
        return {
          success: false,
          error: `Unknown system IDs: ${invalid.join(", ")}. Use find_system to discover available systems.`,
        };
      }
      for (const [sysId, level] of Object.entries(sa.set)) {
        const normalized =
          level === "READ_WRITE" || level === "read-write"
            ? SystemAccessLevel.READ_WRITE
            : level === "READ_ONLY" || level === "read-only"
              ? SystemAccessLevel.READ_ONLY
              : null;
        if (!normalized) {
          return {
            success: false,
            error: `Invalid access level "${level}" for system "${sysId}". Must be READ_WRITE or READ_ONLY.`,
          };
        }
        (newConfig.systems as Record<string, any>)[sysId] = normalized;
      }
    }

    if (sa.setRule && newConfig.systems !== "ALL") {
      const invalid = Object.keys(sa.setRule).filter(
        (id) => !arc.availableSystems.some((s) => s.id === id),
      );
      if (invalid.length) {
        return {
          success: false,
          error: `Unknown system IDs in custom rules: ${invalid.join(", ")}. Use find_system to discover available systems.`,
        };
      }
      for (const [sysId, rule] of Object.entries(sa.setRule)) {
        (newConfig.systems as Record<string, any>)[sysId] = {
          rules: [
            {
              id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: rule.name,
              expression: rule.expression,
              isActive: true,
            },
          ],
        };
      }
    }

    if (sa.remove?.length && newConfig.systems !== "ALL") {
      for (const sysId of sa.remove) {
        delete (newConfig.systems as Record<string, any>)[sysId];
      }
    }
  }

  if (input.description !== undefined) {
    if (isBaseRole) {
      return {
        success: false,
        error: `Cannot change the description of the '${arc.role.name}' base role. Only tool and system permissions can be edited.`,
      };
    }
    newConfig.description = input.description;
  }

  return {
    success: true,
    explanation: input.explanation,
    roleId: arc.role.id,
    newConfig,
  };
};

const testRoleAccessDefinition = (): ToolDefinition => ({
  name: "test_role_access",
  description:
    "Test a custom rule expression against a sample stepConfig. Evaluates a JS expression locally (no server call) to verify it returns the expected allow/block result before adding it to a role. The expression receives a `stepConfig` object and must return truthy to allow.",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          'The JS expression to evaluate. Receives `stepConfig` in scope. Example: `stepConfig.method !== "DELETE"`',
      },
      stepConfig: {
        type: "object",
        description:
          "Sample stepConfig to evaluate against. Use realistic resolved values (url, method, headers, queryParams, body, systemId).",
        properties: {
          url: { type: "string" },
          method: { type: "string" },
          headers: { type: "object" },
          queryParams: { type: "object" },
          body: { type: "string" },
          systemId: { type: "string" },
        },
      },
    },
    required: ["expression", "stepConfig"],
  },
});

const runTestRoleAccess = async (input: { expression: string; stepConfig: object }) => {
  if (!input.expression?.trim()) {
    return { success: false, error: "Expression is required." };
  }
  try {
    const sandbox = Object.freeze({ stepConfig: Object.freeze(input.stepConfig ?? {}) });
    const allowed = vm.runInNewContext(`"use strict"; Boolean(${input.expression})`, sandbox, {
      timeout: 100,
    });
    return {
      success: true,
      expression: input.expression,
      stepConfig: input.stepConfig,
      allowed,
      verdict: allowed
        ? "ALLOWED — expression returned truthy"
        : "BLOCKED — expression returned falsy",
    };
  } catch (error: any) {
    return {
      success: false,
      expression: input.expression,
      stepConfig: input.stepConfig,
      error: `Expression evaluation failed (fail-closed): ${error.message}`,
      allowed: false,
      verdict: "BLOCKED — expression failed to evaluate (fail-closed)",
    };
  }
};

const findUserDefinition = (): ToolDefinition => ({
  name: "find_user",
  description:
    "Look up a user by email, name, or ID and return their info including all assigned roles. Use this to answer questions like 'what roles does user X have?' or 'which users have access to tool Y?'.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search term — matches against user email, name, or ID (case-insensitive)",
      },
      userType: {
        type: "string",
        enum: ["member", "end_user"],
        description: "Filter by user type. Omit to search all users.",
      },
    },
    required: ["query"],
  },
});

const runFindUser = async (
  input: { query: string; userType?: "member" | "end_user" },
  ctx: ToolExecutionContext,
) => {
  const arc = ctx.accessRulesContext;
  if (!arc) {
    return {
      success: false,
      error: "No access rules context available. This tool only works in the access rules view.",
    };
  }

  const q = input.query.toLowerCase();
  const matches = arc.users.filter((u) => {
    if (input.userType && u.userType !== input.userType) return false;
    return (
      u.id.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.name && u.name.toLowerCase().includes(q))
    );
  });

  if (matches.length === 0) {
    return { success: true, results: [], message: `No users found matching '${input.query}'.` };
  }

  const roleMap = new Map(arc.allRoles.map((r) => [r.id, r.name]));
  const results = matches.map((u) => ({
    email: u.email,
    name: u.name,
    userType: u.userType,
    roles: u.roleIds.map((rid) => ({ id: rid, name: roleMap.get(rid) || rid })),
  }));

  return { success: true, results };
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
  load_skill: {
    name: "load_skill",
    definition: loadSkillDefinition,
    execute: runLoadSkill,
  },
  inspect_tool: {
    name: "inspect_tool",
    definition: inspectToolDefinition,
    execute: runInspectTool,
  },
  inspect_system: {
    name: "inspect_system",
    definition: inspectSystemDefinition,
    execute: runInspectSystem,
  },
  inspect_role: {
    name: "inspect_role",
    definition: inspectRoleDefinition,
    execute: runInspectRole,
  },
  find_role: {
    name: "find_role",
    definition: findRoleDefinition,
    execute: runFindRole,
  },
  edit_role: {
    name: "edit_role",
    definition: editRoleDefinition,
    execute: runEditRole,
  },
  test_role_access: {
    name: "test_role_access",
    definition: testRoleAccessDefinition,
    execute: runTestRoleAccess,
  },
  find_user: {
    name: "find_user",
    definition: findUserDefinition,
    execute: runFindUser,
  },
};

export const BASE_TOOLS = [
  "load_skill",
  "find_tool",
  "find_system",
  "search_documentation",
  "call_system",
  "run_tool",
];

export const TOOL_BUILDING_TOOLS = ["build_tool", "save_tool"];
export const TOOL_EDITING_TOOLS = ["edit_tool", "save_tool"];
export const SYSTEMS_HANDLING_TOOLS = ["create_system", "edit_system", "authenticate_oauth"];

export const SKILL_GATED_TOOLS: Partial<Record<SkillName, string[]>> = {
  "tool-building": TOOL_BUILDING_TOOLS,
  "tool-editing": TOOL_EDITING_TOOLS,
  "systems-handling": SYSTEMS_HANDLING_TOOLS,
};

export const AGENT_TOOL_SET = [...BASE_TOOLS];

export const TOOL_PLAYGROUND_TOOL_SET = [...BASE_TOOLS, ...TOOL_EDITING_TOOLS, "inspect_tool"];

export const SYSTEM_PLAYGROUND_TOOL_SET = [
  "load_skill",
  "find_system",
  "search_documentation",
  "call_system",
  ...SYSTEMS_HANDLING_TOOLS,
  "inspect_system",
];

export const ACCESS_RULES_TOOL_SET = [
  "load_skill",
  "find_tool",
  "find_system",
  "search_documentation",
  "inspect_role",
  "find_role",
  "edit_role",
  "test_role_access",
  "find_user",
];
