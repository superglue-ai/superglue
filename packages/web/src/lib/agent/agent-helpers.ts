import { System, Tool } from "@superglue/shared";

export const stripLegacyToolFields = (tool: Tool): Tool => {
  return {
    ...tool,
    steps: tool.steps.map((step) => {
      const { inputMapping, responseMapping, ...cleanStep } = step as any;
      return cleanStep;
    }),
  };
};

export const filterSystemFields = (system: System) => {
  const { openApiSchema, documentation, credentials, ...filtered } = system;

  const maskedCredentials = credentials
    ? Object.fromEntries(Object.keys(credentials).map((key) => [key, `<<masked_${key}>>`]))
    : undefined;

  return { ...filtered, credentials: maskedCredentials };
};

export function resolveFileReferences(
  value: any,
  filePayloads: Record<string, any>,
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
          const filename = matches[0][1];
          const fileData = filePayloads[filename];
          if (fileData === undefined) {
            throw new Error(
              `File reference 'file::${filename}' could not be resolved.\n` +
                `Available file keys: ${availableKeys.length > 0 ? availableKeys.join(", ") : "(none)"}\n` +
                `Make sure to use the exact sanitized key shown in the file reference list.`,
            );
          }

          if (stringifyObjects && typeof fileData !== "string") {
            return JSON.stringify(fileData, null, 2);
          }

          return fileData;
        }

        let result = value;
        const fileContents: string[] = [];

        for (const match of matches) {
          const filename = match[1];
          const fileData = filePayloads[filename];
          if (fileData === undefined) {
            unresolvedFiles.push(filename);
          } else {
            const contentStr =
              typeof fileData === "string" ? fileData : JSON.stringify(fileData, null, 2);
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

export const validateRequiredFields = (
  schema: any,
  payload: Record<string, any>,
): { valid: true } | { valid: false; missingFields: string[]; schema: any } => {
  if (!schema) return { valid: true };

  let parsedSchema = typeof schema === "string" ? JSON.parse(schema) : schema;
  parsedSchema = parsedSchema.properties?.payload;
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

export function validateFileReferences(
  value: any,
  availableFiles: Record<string, any>,
): { valid: true } | { valid: false; missingFiles: string[]; availableKeys: string[] } {
  const filePattern = /file::([^,\s)}\]"']+)/g;
  const valueStr = typeof value === "string" ? value : JSON.stringify(value || {});
  const matches = [...valueStr.matchAll(filePattern)];

  if (matches.length === 0) return { valid: true };

  const availableKeys = Object.keys(availableFiles || {});
  const referencedKeys = [...new Set(matches.map((m) => m[1]))];
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
  suggestion: string;
};

export function resolvePayloadWithFiles(
  payload: any,
  filePayloads: Record<string, any> | undefined,
  stringifyObjects = false,
): FileResolutionSuccess | FileResolutionError {
  const validation = validateFileReferences(payload, filePayloads || {});
  if (validation.valid === false) {
    return {
      success: false,
      error: `File references not found: ${validation.missingFiles.map((f) => `file::${f}`).join(", ")}`,
      availableFiles: validation.availableKeys.map((k) => `file::${k}`),
      suggestion:
        validation.availableKeys.length > 0
          ? `Available file keys: ${validation.availableKeys.map((k) => `file::${k}`).join(", ")}`
          : "No files are currently available. Ask the user to upload the required files.",
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
      suggestion:
        "Use the exact sanitized file key from the file reference list (e.g., file::my_data_csv)",
    };
  }
}

export function validateDraftOrToolId(
  draftId?: string,
  toolId?: string,
): { valid: true } | { valid: false; error: string; suggestion?: string } {
  if (!draftId && !toolId) {
    return {
      valid: false,
      error: "Either draftId or toolId is required",
      suggestion: "Provide draftId (from build_tool) or toolId (for saved tools)",
    };
  }
  if (draftId && toolId) {
    return { valid: false, error: "Provide either draftId or toolId, not both" };
  }
  return { valid: true };
}

export function resolveDocumentationFiles(
  documentation: string | undefined,
  filePayloads: Record<string, any> | undefined,
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

export const getProtocol = (url: string): "http" | "postgres" | "sftp" => {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  if (url.startsWith("ftp://") || url.startsWith("ftps://") || url.startsWith("sftp://"))
    return "sftp";
  return "http";
};
