import { BaseConfig, JSONata, JSONSchema } from "@superglue/shared";

export function oldReplaceVariables(template: string, variables: Record<string, any>): string {
  if (!template) return "";

  const variableNames = Object.keys(variables);
  const pattern = new RegExp(`\\{(${variableNames.join("|")})(?:\\.(\\w+))*\\}`, "g");

  return String(template).replace(pattern, (match, path) => {
    const parts = path.split(".");
    let value = variables;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return match; // Keep original if path is invalid
      }
      value = value[part];
    }

    if (value === undefined || value === null) {
      if (path == "cursor") {
        return "";
      }
      return match; // Keep original if final value is invalid
    }

    if (Array.isArray(value) || typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

// Legacy function needs to stay for existing workflow backwards compatibility
export function flattenObject(
  obj: any,
  parentKey = "",
  res: Record<string, any> = {},
): Record<string, any> {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const propName = parentKey ? `${parentKey}_${key}` : key;
      if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
        flattenObject(obj[key], propName, res);
      } else {
        res[propName] = obj[key];
      }
    }
  }
  return res;
}

export interface TransformConfig extends BaseConfig {
  instruction: string;
  responseSchema: JSONSchema;
  responseMapping?: JSONata;
}

export type TransformInputRequest = {
  id?: string;
  endpoint?: TransformConfig;
};
