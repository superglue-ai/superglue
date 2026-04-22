import {
  ALLOWED_PATCH_SYSTEM_FIELDS,
  ExecutionFileEnvelope,
  RawFileBytes,
  getToolInputSchemaSections,
  maskCredentialValue,
  Message,
  System,
  SystemConfig,
  systems,
  Tool,
} from "@superglue/shared";
import * as jsonpatch from "fast-json-patch";
import { decodeBase64ToUint8Array } from "@/src/lib/file-utils";
import { EditToolSaveResult, ToolExecutionContext } from "./agent-types";
import { SKILL_INDEX } from "./skills/index";
import { findDraftInMessages } from "./agent-context";

export const needsSystemMessage = (messages: Message[]): boolean => {
  return !messages.some((m) => m.role === "system" && !m.isHidden);
};

export const stripLegacyToolFields = (tool: Tool): Tool => {
  return {
    ...tool,
    steps: tool.steps.map((step) => {
      const { inputMapping, responseMapping, ...cleanStep } = step as any;
      return cleanStep;
    }),
  };
};

const MAX_INLINE_FILE_BASE64_BYTES = 500 * 1024 * 1024;

function formatInlineFileLimit(limitBytes = MAX_INLINE_FILE_BASE64_BYTES): string {
  return `${Math.round(limitBytes / (1024 * 1024))} MB`;
}

function assertEnvelopeSupportsBase64(
  envelope: ExecutionFileEnvelope,
  ref: string,
  limitBytes = MAX_INLINE_FILE_BASE64_BYTES,
): void {
  if (envelope.size <= limitBytes) {
    return;
  }

  throw new Error(
    `File '${envelope.filename} (${ref})' is too large for base64 access. Limit is ${formatInlineFileLimit(limitBytes)}. Use .raw instead.`,
  );
}

function getEditToolSavedToolSuffix(saveResult: EditToolSaveResult): string {
  return saveResult?.success === true ? ` as "${saveResult.toolId}"` : "";
}

export function buildEditToolApprovalMessage({
  saveResult,
  approvedCount,
  rejectedCount,
}: {
  saveResult: EditToolSaveResult;
  approvedCount?: number;
  rejectedCount?: number;
}): string {
  if (approvedCount === undefined || rejectedCount === undefined) {
    if (saveResult?.success === true) {
      return `All changes approved, applied, and saved${getEditToolSavedToolSuffix(saveResult)}.`;
    }

    if (saveResult?.success === false) {
      return `All changes approved and applied to the draft only, but saving failed: ${saveResult.error}`;
    }

    return "All changes approved and applied to the draft only. Tool is not saved yet.";
  }

  if (saveResult?.success === true) {
    return `User partially approved the changes: ${approvedCount} applied and saved${getEditToolSavedToolSuffix(saveResult)}, ${rejectedCount} rejected.`;
  }

  if (saveResult?.success === false) {
    return `User partially approved the changes: ${approvedCount} applied to the draft only, ${rejectedCount} rejected, but saving failed: ${saveResult.error}`;
  }

  return `User partially approved the changes: ${approvedCount} applied to the draft only, ${rejectedCount} rejected. Tool is not saved yet.`;
}

function getEditToolPersistenceFields(saveResult: EditToolSaveResult): Record<string, any> {
  if (saveResult?.success === true) {
    return {
      persistence: "saved",
    };
  }

  if (saveResult?.success === false) {
    return {
      persistence: "draft_only",
      saveError: saveResult.error,
    };
  }

  return {
    persistence: "draft_only",
  };
}

export function buildEditToolConfirmationOutput(
  baseOutput: Record<string, any>,
  saveResult: EditToolSaveResult,
  options?: { keepDraftIdOnSave?: boolean },
): Record<string, any> {
  const nextOutput: Record<string, any> = {
    ...baseOutput,
    ...getEditToolPersistenceFields(saveResult),
  };
  delete nextOutput.originalConfig;
  delete nextOutput.confirmationState;
  delete nextOutput.confirmationData;
  if (saveResult?.success === true && !options?.keepDraftIdOnSave) {
    delete nextOutput.draftId;
  }
  return nextOutput;
}

export const filterSystemFields = (system: System) => {
  const credentials = system.credentials || {};
  const storedCredentials = Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [
      key,
      { placeholder: `<<${system.id}_${key}>>`, value: maskCredentialValue(key, value) },
    ]),
  );
  return {
    id: system.id,
    name: system.name,
    url: system.url,
    urlPlaceholder: system.url ? `<<${system.id}_url>>` : undefined,
    specificInstructions: system.specificInstructions,
    storedCredentials: Object.keys(storedCredentials).length > 0 ? storedCredentials : undefined,
    environment: system.environment,
  };
};

export function resolveFileReferences(
  value: any,
  filePayloads: Record<string, ExecutionFileEnvelope>,
  stringifyObjects = false,
): any {
  if (typeof value === "string") {
    if (value.includes("file::")) {
      const filePattern = /file::([^,\s)}\]"']+)/g;
      const matches = [...value.matchAll(filePattern)];

      if (matches.length > 0) {
        const availableKeys = Object.keys(filePayloads);
        const unresolvedFiles: string[] = [];

        if (matches.length === 1 && value.trim() === matches[0][0]) {
          const rawRef = matches[0][1];
          const resolved = resolveFileRef(rawRef, filePayloads, stringifyObjects);
          if (resolved === undefined) {
            throw new Error(
              `File reference 'file::${rawRef}' could not be resolved.\n` +
                `Available file keys: ${availableKeys.length > 0 ? availableKeys.join(", ") : "(none)"}\n` +
                `Make sure to use the exact sanitized key shown in the file reference list.`,
            );
          }
          return resolved;
        }

        let result = value;
        const fileContents: string[] = [];

        for (const match of matches) {
          const rawRef = match[1];
          const resolved = resolveFileRef(rawRef, filePayloads, true);
          if (resolved === undefined) {
            unresolvedFiles.push(rawRef);
          } else {
            const contentStr =
              typeof resolved === "string" ? resolved : JSON.stringify(resolved, null, 2);
            fileContents.push(contentStr);
          }
        }

        if (unresolvedFiles.length > 0) {
          throw new Error(
            `File reference${unresolvedFiles.length > 1 ? "s" : ""} could not be resolved: ${unresolvedFiles.map((f) => `'file::${f}'`).join(", ")}\n` +
              `Available file keys: ${availableKeys.length > 0 ? availableKeys.join(", ") : "(none)"}\n` +
              `Make sure to use the exact sanitized key shown in the file reference list.`,
          );
        }

        if (fileContents.length > 0) {
          result = fileContents.join("\n\n");
        }

        return result;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveFileReferences(item, filePayloads, stringifyObjects));
  }

  if (value !== null && typeof value === "object") {
    const resolved: any = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveFileReferences(val, filePayloads, stringifyObjects);
    }
    return resolved;
  }

  return value;
}

function resolveFileRef(
  rawRef: string,
  filePayloads: Record<string, ExecutionFileEnvelope>,
  stringifyObjects: boolean,
): any | undefined {
  if (rawRef.endsWith(".raw")) {
    const key = rawRef.slice(0, -4);
    const envelope = filePayloads[key];
    if (!envelope) return undefined;
    return {
      kind: "raw_file_bytes",
      base64: envelope.rawBase64,
      filename: envelope.filename,
      contentType: envelope.contentType,
    } as RawFileBytes;
  }

  if (rawRef.endsWith(".base64")) {
    const key = rawRef.slice(0, -7);
    const envelope = filePayloads[key];
    if (!envelope) return undefined;
    assertEnvelopeSupportsBase64(envelope, `file::${rawRef}`);
    return envelope.rawBase64;
  }

  if (rawRef.endsWith(".extracted")) {
    const key = rawRef.slice(0, -10);
    const envelope = filePayloads[key];
    if (!envelope) return undefined;
    if (stringifyObjects && typeof envelope.extracted !== "string") {
      return JSON.stringify(envelope.extracted ?? null, null, 2);
    }
    return envelope.extracted;
  }

  const envelope = filePayloads[rawRef];
  if (!envelope) return undefined;
  if (stringifyObjects) {
    return JSON.stringify(envelope.extracted ?? null, null, 2);
  }
  return envelope;
}

export const validateRequiredFields = (
  schema: any,
  payload: Record<string, any>,
): { valid: true } | { valid: false; missingFields: string[]; schema: any } => {
  const parsedSchema = getToolInputSchemaSections(schema).payloadSchema;
  if (!parsedSchema) return { valid: true };
  if (!parsedSchema?.required || !Array.isArray(parsedSchema.required)) {
    return { valid: true };
  }

  const missingFields = parsedSchema.required.filter(
    (field: string) => payload[field] === undefined || payload[field] === null,
  );

  if (missingFields.length > 0) {
    return { valid: false, missingFields, schema: parsedSchema };
  }

  return { valid: true };
};

export const validateRequiredFileInputs = (
  schema: any,
  files: Record<string, ExecutionFileEnvelope> | undefined,
): { valid: true } | { valid: false; missingFiles: string[]; schema: any } => {
  const parsedSchema = getToolInputSchemaSections(schema).filesSchema;
  if (!parsedSchema) return { valid: true };
  if (!parsedSchema.required || !Array.isArray(parsedSchema.required)) {
    return { valid: true };
  }

  const resolvedFiles = files || {};
  const missingFiles = parsedSchema.required.filter((field: string) => !resolvedFiles[field]);

  if (missingFiles.length > 0) {
    return { valid: false, missingFiles, schema: parsedSchema };
  }

  return { valid: true };
};

export function validateFileReferences(
  value: any,
  availableFiles: Record<string, ExecutionFileEnvelope>,
): { valid: true } | { valid: false; missingFiles: string[]; availableKeys: string[] } {
  const filePattern = /file::([^,\s)}\]"']+)/g;
  const valueStr = typeof value === "string" ? value : JSON.stringify(value || {});
  const matches = [...valueStr.matchAll(filePattern)];

  if (matches.length === 0) return { valid: true };

  const availableKeys = Object.keys(availableFiles || {});
  const referencedKeys = [
    ...new Set(
      matches.map((m) => {
        let key = m[1];
        if (key.endsWith(".raw")) key = key.slice(0, -4);
        else if (key.endsWith(".base64")) key = key.slice(0, -7);
        else if (key.endsWith(".extracted")) key = key.slice(0, -10);
        return key;
      }),
    ),
  ];
  const missingFiles = referencedKeys.filter((key) => !availableKeys.includes(key));

  if (missingFiles.length > 0) {
    return { valid: false, missingFiles, availableKeys };
  }

  return { valid: true };
}

export type FileResolutionSuccess = { success: true; resolved: any };
export type FileResolutionError = {
  success: false;
  error: string;
  availableFiles: string[];
};

export function resolvePayloadWithFiles(
  payload: any,
  filePayloads: Record<string, ExecutionFileEnvelope> | undefined,
  stringifyObjects = false,
): FileResolutionSuccess | FileResolutionError {
  const validation = validateFileReferences(
    payload,
    (filePayloads || {}) as Record<string, ExecutionFileEnvelope>,
  );
  if (validation.valid === false) {
    return {
      success: false,
      error: `File references not found: ${validation.missingFiles.map((f) => `file::${f}`).join(", ")}`,
      availableFiles: validation.availableKeys.map((k) => `file::${k}`),
    };
  }

  try {
    const resolved =
      filePayloads && Object.keys(filePayloads).length > 0
        ? resolveFileReferences(payload || {}, filePayloads, stringifyObjects)
        : payload || {};
    return { success: true, resolved };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      availableFiles: Object.keys(filePayloads || {}).map((k) => `file::${k}`),
    };
  }
}

export function resolveFileInputBindings(
  files: any,
  filePayloads: Record<string, ExecutionFileEnvelope> | undefined,
): FileResolutionSuccess | FileResolutionError {
  if (!files || typeof files !== "object") {
    return { success: true, resolved: {} };
  }

  const resolution = resolvePayloadWithFiles(files, filePayloads, false);
  if (!resolution.success) {
    return resolution;
  }

  const resolvedEntries = Object.entries(resolution.resolved as Record<string, unknown>);
  const invalidAliases = resolvedEntries.filter(
    ([, value]) =>
      !(
        typeof value === "object" &&
        value !== null &&
        (value as ExecutionFileEnvelope).kind === "execution_file"
      ),
  );

  if (invalidAliases.length > 0) {
    return {
      success: false,
      error:
        `Invalid file input binding${invalidAliases.length > 1 ? "s" : ""}: ` +
        invalidAliases
          .map(
            ([alias]) =>
              `'${alias}' must resolve to a full file envelope via a bare file:: reference`,
          )
          .join(", "),
      availableFiles: Object.keys(filePayloads || {}).map((k) => `file::${k}`),
    };
  }

  return {
    success: true,
    resolved: resolution.resolved as Record<string, ExecutionFileEnvelope>,
  };
}

export function validateDraftOrToolId(
  draftId?: string,
  toolId?: string,
): { valid: true } | { valid: false; error: string } {
  if (!draftId && !toolId) {
    return {
      valid: false,
      error: "Either draftId or toolId is required",
    };
  }
  if (draftId && toolId) {
    return { valid: false, error: "Provide either draftId or toolId, not both" };
  }
  return { valid: true };
}

export function resolveDocumentationFiles(
  documentation: string | undefined,
  filePayloads: Record<string, ExecutionFileEnvelope> | undefined,
  setDocUrl: (refs: string[]) => string,
): { documentation?: string; documentationUrl?: string } | { error: string } {
  if (!filePayloads || Object.keys(filePayloads).length === 0 || !documentation) {
    return { documentation };
  }

  const hasFileReference = typeof documentation === "string" && documentation.includes("file::");
  let documentationUrl: string | undefined;

  if (hasFileReference) {
    const fileRefs = documentation.split(",").map((ref) => ref.trim().replace(/^file::/, ""));
    documentationUrl = setDocUrl(fileRefs);
  }

  try {
    const resolved = resolveFileReferences(documentation, filePayloads, true);
    return { documentation: resolved, documentationUrl };
  } catch (error: any) {
    return { error: error.message };
  }
}

export function buildScrapeInput(
  scrapeUrl?: string,
  scrapeKeywords?: string | string[],
): { url: string; keywords?: string[] } | null {
  if (!scrapeUrl || typeof scrapeUrl !== "string" || scrapeUrl.trim().length === 0) {
    return null;
  }

  let keywords: string[] | undefined;
  if (typeof scrapeKeywords === "string") {
    const parsed = scrapeKeywords.split(/\s+/).filter((k) => k.length > 0);
    if (parsed.length > 0) keywords = parsed;
  } else if (Array.isArray(scrapeKeywords)) {
    const parsed = scrapeKeywords
      .filter((k) => typeof k === "string")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (parsed.length > 0) keywords = parsed;
  }

  return { url: scrapeUrl.trim(), ...(keywords ? { keywords } : {}) };
}

export function extractFilePayloadsForUpload(
  filesInput: string | undefined,
  filePayloads: Record<string, ExecutionFileEnvelope> | undefined,
):
  | {
      files: Array<{
        fileName: string;
        content: string | Uint8Array;
        contentType?: string;
        contentLength?: number;
      }>;
    }
  | { error: string } {
  if (!filesInput || !filePayloads || Object.keys(filePayloads).length === 0) {
    return { files: [] };
  }

  const hasFileReference = typeof filesInput === "string" && filesInput.includes("file::");
  if (!hasFileReference) {
    return { files: [] };
  }

  const fileRefs = filesInput.split(",").map((ref) => ref.trim().replace(/^file::/, ""));
  const availableKeys = Object.keys(filePayloads);
  const files: Array<{
    fileName: string;
    content: string | Uint8Array;
    contentType?: string;
    contentLength?: number;
  }> = [];

  for (const ref of fileRefs) {
    const isRawRef = ref.endsWith(".raw");
    const isExtractedRef = ref.endsWith(".extracted");
    let key = ref;
    if (isRawRef) key = key.slice(0, -4);
    else if (isExtractedRef) key = key.slice(0, -10);
    const envelope = filePayloads[key];
    if (envelope === undefined) {
      return {
        error:
          `File reference 'file::${ref}' could not be resolved.\n` +
          `Available file keys: ${availableKeys.length > 0 ? availableKeys.join(", ") : "(none)"}`,
      };
    }

    if (!isExtractedRef) {
      files.push({
        fileName: envelope.filename,
        content: decodeBase64ToUint8Array(envelope.rawBase64),
        contentType: envelope.contentType,
        contentLength: envelope.size,
      });
      continue;
    }

    const content =
      typeof envelope.extracted === "string"
        ? envelope.extracted
        : JSON.stringify(envelope.extracted);
    const baseName = envelope.filename.replace(/\.[^/.]+$/, "") || key;
    const fileName = `${baseName}.txt`;
    files.push({
      fileName,
      content,
      contentType: "text/plain; charset=utf-8",
      contentLength: new Blob([content]).size,
    });
  }

  return { files };
}

const MAX_RESPONSE_DATA_LENGTH = 25_000;

export const truncateResponseData = (result: any): any => {
  if (!result.data) return result;

  if (typeof result.data === "object") {
    const dataStr = JSON.stringify(result.data);
    if (dataStr.length > MAX_RESPONSE_DATA_LENGTH) {
      result.data = {
        _note: `Response data truncated for LLM context (original size: ${dataStr.length} chars)`,
        _truncated: true,
        preview: dataStr.substring(0, MAX_RESPONSE_DATA_LENGTH),
      };
    }
  } else if (typeof result.data === "string" && result.data.length > MAX_RESPONSE_DATA_LENGTH) {
    const originalLength = result.data.length;
    result.data =
      result.data.substring(0, MAX_RESPONSE_DATA_LENGTH) +
      `\n\n[Truncated from ${originalLength} chars]`;
  }

  return result;
};

export const resolveBodyFileReferences = (
  body: string | undefined,
  filePayloads: Record<string, ExecutionFileEnvelope> | undefined,
): { success: true; body: string | undefined } | { success: false; error: string } => {
  if (!body || !filePayloads || Object.keys(filePayloads).length === 0) {
    if (body?.includes("file::")) {
      return {
        success: false,
        error: `Body contains file references but no files are available: ${body}`,
      };
    }
    return { success: true, body };
  }

  const validation = validateFileReferences(body, filePayloads);
  if (validation.valid === false) {
    return {
      success: false,
      error: `File references not found: ${validation.missingFiles.map((f) => `file::${f}`).join(", ")}`,
    };
  }

  return { success: true, body };
};

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

export function hasPatchableSystemFields(payload: Record<string, unknown>): boolean {
  return ALLOWED_PATCH_SYSTEM_FIELDS.some((k) => payload[k] !== undefined);
}

export async function tryTriggerScrapeJob(
  ctx: ToolExecutionContext,
  systemId: string,
  scrapeInput: { url: string; keywords?: string[] } | null,
): Promise<string | null> {
  if (!scrapeInput) return null;
  try {
    await ctx.superglueClient.triggerSystemDocumentationScrapeJob(systemId, scrapeInput);
    return null;
  } catch (error: any) {
    return `Documentation scrape failed to start: ${error.message}`;
  }
}

export const skillIndexDescription = Object.entries(SKILL_INDEX)
  .map(([name, desc]) => `- ${name}: ${desc}`)
  .join("\n");

export const validatePatches = (
  patches: jsonpatch.Operation[],
): { valid: boolean; error?: string } => {
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    if (!patch.op) {
      return { valid: false, error: `Patch ${i + 1}: missing 'op' field` };
    }
    if (!patch.path || typeof patch.path !== "string") {
      return { valid: false, error: `Patch ${i + 1}: 'path' must be a string` };
    }
    if (["add", "replace", "test"].includes(patch.op) && !("value" in patch)) {
      return {
        valid: false,
        error: `Patch ${i + 1}: '${patch.op}' operation requires 'value' field`,
      };
    }
    if (["move", "copy"].includes(patch.op) && !("from" in patch)) {
      return {
        valid: false,
        error: `Patch ${i + 1}: '${patch.op}' operation requires 'from' field`,
      };
    }
    if (!patch.path.startsWith("/")) {
      return {
        valid: false,
        error: `Patch ${i + 1}: path must start with '/' (RFC 6902), got '${patch.path}'`,
      };
    }
  }
  return { valid: true };
};

export const resolveOriginalConfig = async (
  draftId: string,
  toolId: string | undefined,
  ctx: ToolExecutionContext,
): Promise<any | null> => {
  if (draftId === "playground-draft" && ctx.playgroundDraft) {
    return ctx.playgroundDraft.config;
  }

  const draft = findDraftInMessages(ctx.messages || [], draftId);
  if (draft?.config) return draft.config;

  if (toolId) {
    try {
      return await ctx.superglueClient.getWorkflow(toolId);
    } catch {}
  }

  return null;
};

export const formatSystemKnowledgeForOutput = (template: SystemConfig) => {
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

export const resolveSensitiveCredentials = (raw: unknown): Record<string, boolean> | null => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, boolean>;
  return null;
};

export const buildSystemPendingOutput = (input: any) => {
  let systemConfig = { ...input };
  const { templateId, sensitiveCredentials: rawCreds, ...rest } = systemConfig;

  if (rawCreds && typeof rawCreds === "object") {
    rest.credentials = {
      ...rest.credentials,
      ...Object.fromEntries(Object.keys(rawCreds).map((k) => [k, ""])),
    };
  }

  if (templateId) {
    const template = systems[templateId];
    if (template) {
      const oauthCreds: Record<string, any> = {};
      if (template.oauth) {
        oauthCreds.auth_url = template.oauth.authUrl;
        oauthCreds.token_url = template.oauth.tokenUrl;
        oauthCreds.scopes = template.oauth.scopes;
      }
      systemConfig = {
        name: template.name,
        url: template.apiUrl,
        templateName: templateId,
        ...rest,
        credentials: { ...oauthCreds, ...rest.credentials },
      };
    }
  } else {
    systemConfig = { ...rest };
  }

  return { systemConfig };
};
