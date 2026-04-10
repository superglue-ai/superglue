type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

export type ToolObservationContext = {
  toolName: string;
  toolCallId?: string;
  executionMode?: string;
  awaitingConfirmation?: boolean;
  input: any;
  result?: any;
  error?: string;
};

export type ConfirmationObservationContext = {
  toolName: string;
  toolCallId: string;
  action: string;
  status: "completed" | "declined";
  input: any;
  normalizedOutput: Record<string, unknown>;
};

const MAX_ARRAY_VALUES = 12;

function truncateArray(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  return values.slice(0, MAX_ARRAY_VALUES);
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJsonish(value: unknown): Record<string, any> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toHost(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;

  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function toScopes(scopes: unknown): string[] | undefined {
  if (typeof scopes !== "string") return undefined;
  return truncateArray(scopes.split(/\s+/).filter(Boolean));
}

function getStepSystemIds(steps: unknown): string[] | undefined {
  if (!Array.isArray(steps)) return undefined;

  const systemIds = steps
    .map((step) => {
      if (!isRecord(step) || !isRecord(step.config)) return null;
      return typeof step.config.systemId === "string" ? step.config.systemId : null;
    })
    .filter((value): value is string => !!value);

  return truncateArray([...new Set(systemIds)]);
}

function getRunToolTargetKind(input: Record<string, any>): "draft" | "saved" | undefined {
  if (typeof input.draftId === "string" && input.draftId.length > 0) return "draft";
  if (typeof input.toolId === "string" && input.toolId.length > 0) return "saved";
  return undefined;
}

function getLookupMode(input: Record<string, any>): "id" | "query" | "all" {
  if (typeof input.id === "string" && input.id.length > 0) return "id";
  if (typeof input.query === "string") {
    const query = input.query.trim().toLowerCase();
    if (!query || query === "*" || query === "all") return "all";
    return "query";
  }
  return "all";
}

function getMatchedSystemIds(result: Record<string, any>): string[] | undefined {
  const systems = Array.isArray(result.systems) ? result.systems : [];

  const ids = systems
    .map((system) => (isRecord(system) && typeof system.id === "string" ? system.id : null))
    .filter((value): value is string => !!value);

  return truncateArray(ids);
}

function getMatchedTemplateIds(result: Record<string, any>): string[] | undefined {
  const templateIds = new Set<string>();

  for (const key of ["matchingSystemKnowledge"] as const) {
    const entries = result[key];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (isRecord(entry) && typeof entry.name === "string") {
        templateIds.add(entry.name);
      }
    }
  }

  return truncateArray([...templateIds]);
}

function getEditedSystemFields(input: Record<string, any>): string[] | undefined {
  return truncateArray(Object.keys(input).filter((key) => key !== "id" && key !== "environment"));
}

function getPatchPaths(patches: unknown): string[] | undefined {
  if (!Array.isArray(patches)) return undefined;

  return truncateArray(
    patches
      .map((patch) => (isRecord(patch) && typeof patch.path === "string" ? patch.path : null))
      .filter((value): value is string => !!value),
  );
}

function getSystemConfig(
  input: unknown,
  normalizedOutput: Record<string, unknown>,
): Record<string, any> | null {
  const confirmationData = isRecord(normalizedOutput.confirmationData)
    ? normalizedOutput.confirmationData
    : {};

  if (isRecord(confirmationData.systemConfig)) return confirmationData.systemConfig;
  if (isRecord(normalizedOutput.systemConfig)) return normalizedOutput.systemConfig;
  return isRecord(input) ? input : null;
}

function withString(key: string, value: unknown): Record<string, JsonLike> {
  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}

function withValue(key: string, value: JsonLike | undefined): Record<string, JsonLike> {
  return value === undefined ? {} : { [key]: value };
}

function getCommonToolMetadata(
  context: ToolObservationContext,
  success: boolean | undefined,
): Record<string, JsonLike> {
  return {
    toolName: context.toolName,
    ...withString("toolCallId", context.toolCallId),
    ...withString("executionMode", context.executionMode),
    ...withValue("awaitingConfirmation", context.awaitingConfirmation === true ? true : undefined),
    ...withValue("success", success),
    ...withString("error", context.error),
  };
}

export function buildToolObservationMetadata(
  context: ToolObservationContext,
): Record<string, JsonLike> {
  const safeInput = isRecord(context.input) ? context.input : {};
  const parsedResult =
    parseJsonish(context.result) ?? (isRecord(context.result) ? context.result : {});
  const success =
    typeof parsedResult.success === "boolean"
      ? parsedResult.success
      : context.error
        ? false
        : undefined;
  const common = getCommonToolMetadata(context, success);

  switch (context.toolName) {
    case "build_tool":
      return {
        ...common,
        ...withString("toolId", safeInput.id),
        ...withString("draftId", parsedResult.draftId),
        ...withValue("systemIds", getStepSystemIds(safeInput.steps)),
      };
    case "run_tool":
      return {
        ...common,
        ...withString("toolId", safeInput.toolId),
        ...withString("draftId", safeInput.draftId),
        ...withValue("targetKind", getRunToolTargetKind(safeInput)),
        ...withValue(
          "includeStepResults",
          safeInput.includeStepResults === true ? true : undefined,
        ),
        ...withValue("returnFullConfig", safeInput.returnFullConfig === true ? true : undefined),
      };
    case "edit_tool":
      return {
        ...common,
        ...withString("toolId", safeInput.toolId),
        ...withString("draftId", safeInput.draftId),
        ...withValue("targetKind", getRunToolTargetKind(safeInput)),
        ...withValue("patchPaths", getPatchPaths(safeInput.patches)),
      };
    case "save_tool":
      return {
        ...common,
        ...withString("draftId", safeInput.draftId),
        ...withString("toolId", parsedResult.toolId),
      };
    case "find_system":
      return {
        ...common,
        lookupMode: getLookupMode(safeInput),
        ...withString("environmentFilter", safeInput.environment),
        ...withValue("matchedSystemIds", getMatchedSystemIds(parsedResult)),
        ...withValue("matchedTemplateIds", getMatchedTemplateIds(parsedResult)),
      };
    case "create_system":
      return {
        ...common,
        ...withString("systemId", safeInput.id),
        ...withString("templateId", safeInput.templateId),
        ...withString("environment", safeInput.environment),
        ...withString("docsHost", toHost(safeInput.documentationUrl)),
        ...withString("openApiHost", toHost(safeInput.openApiUrl)),
      };
    case "edit_system":
      return {
        ...common,
        ...withString("systemId", safeInput.id),
        ...withString("environment", safeInput.environment),
        ...withValue("editedFields", getEditedSystemFields(safeInput)),
      };
    case "call_system":
      return {
        ...common,
        ...withString("systemId", safeInput.systemId),
        ...withString("environment", safeInput.environment),
        ...withString("protocol", parsedResult.protocol),
        ...withString("host", toHost(safeInput.url)),
      };
    case "authenticate_oauth":
      return {
        ...common,
        ...withString("systemId", safeInput.systemId),
        ...withString("environment", safeInput.environment),
        ...withString("grantType", safeInput.grant_type),
        ...withValue("scopes", toScopes(safeInput.scopes)),
      };
    case "search_documentation":
      return {
        ...common,
        ...withString("systemId", safeInput.systemId),
        ...withValue(
          "keywords",
          typeof safeInput.keywords === "string"
            ? truncateArray(safeInput.keywords.split(/\s+/).filter(Boolean))
            : undefined,
        ),
      };
    default:
      return common;
  }
}

function getConfirmationBase(context: ConfirmationObservationContext): Record<string, JsonLike> {
  return {
    toolName: context.toolName,
    toolCallId: context.toolCallId,
    action: context.action,
    status: context.status,
  };
}

function getConfirmationPatchPaths(normalizedOutput: Record<string, unknown>): {
  proposedPatchPaths?: string[];
  approvedPatchPaths?: string[];
  rejectedPatchPaths?: string[];
} {
  const confirmationData = isRecord(normalizedOutput.confirmationData)
    ? normalizedOutput.confirmationData
    : {};
  const diffs = Array.isArray(normalizedOutput.diffs) ? normalizedOutput.diffs : [];
  const approvedChanges = Array.isArray(confirmationData.appliedChanges)
    ? confirmationData.appliedChanges
    : [];
  const rejectedChanges = Array.isArray(confirmationData.rejectedChanges)
    ? confirmationData.rejectedChanges
    : [];

  const proposedPatchPaths = getPatchPaths(diffs);
  const approvedPatchPaths =
    normalizedOutput.confirmationState === "confirmed"
      ? getPatchPaths(diffs)
      : getPatchPaths(approvedChanges);
  const rejectedPatchPaths =
    normalizedOutput.confirmationState === "declined"
      ? getPatchPaths(diffs)
      : getPatchPaths(rejectedChanges);

  return { proposedPatchPaths, approvedPatchPaths, rejectedPatchPaths };
}

export function buildConfirmationObservationMetadata(
  context: ConfirmationObservationContext,
): Record<string, JsonLike> {
  const systemConfig = getSystemConfig(context.input, context.normalizedOutput);
  const base = getConfirmationBase(context);

  switch (context.toolName) {
    case "edit_tool":
    case "edit_payload": {
      const { approvedPatchPaths, rejectedPatchPaths } = getConfirmationPatchPaths(
        context.normalizedOutput,
      );

      return {
        ...base,
        ...withString("toolId", context.normalizedOutput.toolId),
        ...withString("draftId", context.normalizedOutput.draftId),
        ...withValue("approvedPatchPaths", approvedPatchPaths),
        ...withValue("rejectedPatchPaths", rejectedPatchPaths),
      };
    }
    case "authenticate_oauth":
      return {
        ...base,
        ...withString("systemId", context.input?.systemId),
        ...withString("environment", context.input?.environment),
      };
    case "create_system":
    case "edit_system":
      return {
        ...base,
        ...withString("systemId", systemConfig?.id),
        ...withString("environment", systemConfig?.environment),
      };
    case "call_system":
      return {
        ...base,
        ...withString("systemId", context.input?.systemId),
        ...withString("environment", context.input?.environment),
      };
    default:
      return base;
  }
}

export function buildConfirmationObservationInput(
  context: ConfirmationObservationContext,
): Record<string, JsonLike> {
  const systemConfig = getSystemConfig(context.input, context.normalizedOutput);

  switch (context.toolName) {
    case "edit_tool":
    case "edit_payload": {
      const { proposedPatchPaths } = getConfirmationPatchPaths(context.normalizedOutput);
      return {
        toolName: context.toolName,
        toolCallId: context.toolCallId,
        action: context.action,
        ...withString("toolId", context.normalizedOutput.toolId),
        ...withString("draftId", context.normalizedOutput.draftId),
        ...withValue("proposedPatchPaths", proposedPatchPaths),
      };
    }
    case "authenticate_oauth":
      return {
        toolName: context.toolName,
        toolCallId: context.toolCallId,
        action: context.action,
        ...withString("systemId", context.input?.systemId),
        ...withString("environment", context.input?.environment),
      };
    case "create_system":
    case "edit_system":
      return {
        toolName: context.toolName,
        toolCallId: context.toolCallId,
        action: context.action,
        ...withString("systemId", systemConfig?.id),
        ...withString("environment", systemConfig?.environment),
      };
    case "call_system":
      return {
        toolName: context.toolName,
        toolCallId: context.toolCallId,
        action: context.action,
        ...withString("systemId", context.input?.systemId),
        ...withString("environment", context.input?.environment),
      };
    default:
      return {
        toolName: context.toolName,
        toolCallId: context.toolCallId,
        action: context.action,
      };
  }
}

export function buildConfirmationObservationOutput(
  context: ConfirmationObservationContext,
): Record<string, JsonLike> {
  const systemConfig = getSystemConfig(context.input, context.normalizedOutput);

  switch (context.toolName) {
    case "edit_tool":
    case "edit_payload": {
      const { approvedPatchPaths, rejectedPatchPaths } = getConfirmationPatchPaths(
        context.normalizedOutput,
      );
      return {
        status: context.status,
        ...withValue("approvedPatchPaths", approvedPatchPaths),
        ...withValue("rejectedPatchPaths", rejectedPatchPaths),
      };
    }
    case "authenticate_oauth":
      return {
        status: context.status,
        ...withString("systemId", context.input?.systemId),
        ...withString("environment", context.input?.environment),
      };
    case "create_system":
    case "edit_system":
      return {
        status: context.status,
        ...withString("systemId", systemConfig?.id),
        ...withString("environment", systemConfig?.environment),
      };
    case "call_system":
      return {
        status: context.status,
        ...withString("systemId", context.input?.systemId),
        ...withString("environment", context.input?.environment),
      };
    default:
      return { status: context.status };
  }
}
