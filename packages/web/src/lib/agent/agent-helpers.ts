import { System, Tool } from "@superglue/shared";
import {
  TOOLS_REQUIRING_CONFIRMATION_BEFORE_EXEC,
  TOOLS_REQUIRING_CONFIRMATION_AFTER_EXEC,
} from "./agent-tools";

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
      const filePattern = /file::([^,\s)}\]]+)/g;
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

export const requiresConfirmationBeforeExec = (toolName: string): boolean => {
  return TOOLS_REQUIRING_CONFIRMATION_BEFORE_EXEC.has(toolName);
};

export const requiresConfirmationAfterExec = (toolName: string): boolean => {
  return TOOLS_REQUIRING_CONFIRMATION_AFTER_EXEC.has(toolName);
};
