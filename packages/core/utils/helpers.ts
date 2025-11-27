import { RequestOptions, SelfHealingMode } from "@superglue/client";
import ivm from 'isolated-vm';
import { Validator } from "jsonschema";
import { z } from "zod";
import { parseJSON } from "../files/index.js";
import { oldReplaceVariables } from "./helpers.legacy.js";
import { injectVMHelpersIndividually } from "./vm-helpers.js";

export interface TransformResult {
  success: boolean;
  code: string;
  data?: any;
  error?: string;
}

export const HttpMethodEnum = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

export function ensureSourceDataArrowFunction(code: string | undefined | null): string {
  const fallback = `(sourceData) => {\n  return sourceData;\n}`;
  const text = (code ?? '').trim();
  if (!text) return fallback;
  
  const validPatterns = [
    /^\s*\(?\s*\(\s*sourceData\s*\)\s*=>\s*\{[\s\S]*\}\s*\)?\s*;?\s*$/, // block body
    /^\s*\(?\s*\(\s*sourceData\s*\)\s*=>\s*\([\s\S]*\)\s*\)?\s*;?\s*$/, // parenthesized expr
    /^\s*\(?\s*\(\s*sourceData\s*\)\s*=>[\s\S]*\)?\s*;?\s*$/              // tolerant bare expr
  ];
  
  if (validPatterns.some((re) => re.test(text))) {
    return text;
  }
  
  return `(sourceData) => {\n${text}\n}`;
}

export async function transformData(data: any, code: string): Promise<TransformResult> {
  try {
    if (!code) {
      return { success: true, code: code, data: null };
    }
    else if(code == "$") {
      return { success: true, code: code, data: data };
    }
    
    const wrappedCode = ensureSourceDataArrowFunction(code);
    
    const result = await runCodeInIVM(data, wrappedCode);
    
    return result;
  } catch (error) {
    return { success: false, code: code, error: error.message };
  }
}

export async function runCodeInIVM(input: any, code: string): Promise<TransformResult> {
  const isolate = new ivm.Isolate({ memoryLimit: 4096 }); // 32 MB
  const context = await isolate.createContext();
  await injectVMHelpersIndividually(context);

  await context.global.set('input', JSON.stringify(input));
  let result: any;

  try {
    const scriptSource = `const fn = ${code}; const result = fn(JSON.parse(input)); return result === undefined ? null : JSON.stringify(result);`;
    result = parseJSON(await context.evalClosure(scriptSource, null, { timeout: 10000 }));
    return { success: true, data: result, code: code };
  } catch (error) {
    return { success: false, error: error.message, code: code };
  } finally {
    try {
      isolate.dispose();
    } catch (error) {
      console.error("Error disposing isolate", error);
    }
  }
}

export function applyAuthFormat(format: string, credentials: Record<string, string>): string {
  return format.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!credentials[key]) {
      throw new Error(`Missing credential for ${key}`);
    }
    return credentials[key];
  });
}


export function composeUrl(host: string, path: string) {
  // Handle empty/undefined inputs
  if (!host) host = '';
  if (!path) path = '';

  // Add https:// if protocol is missing
  if (!/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//i.test(host)) {
    host = `https://${host}`;
  }

  // Trim slashes in one pass
  const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

export async function replaceVariables(template: string, payload: Record<string, any>): Promise<string> {
  if (!template) return "";

  const pattern = /<<([\s\S]*?)>>/g;

  let result = template;
  const matches = [...template.matchAll(pattern)];

  for (const match of matches) {
    const expression = match[1].trim();
    let resolvedValue: any;
    
    if (expression in payload && payload[expression] !== undefined) {
      resolvedValue = payload[expression];
    }
    else {
      const isArrowFunction = /^\s*\([^)]*\)\s*=>/.test(expression);
      
      if (isArrowFunction) {
        const transformResult = await transformData(payload, expression);
        if (!transformResult.success) {
          throw new Error(`Failed to run JS expression: ${expression} - ${transformResult.error}`);
        }
        resolvedValue = transformResult.data;
      } else {
        const availableKeys = Object.keys(payload).slice(0, 10).join(', ');
        const keyPreview = Object.keys(payload).length > 10 ? `${availableKeys}... (${Object.keys(payload).length} total)` : availableKeys;
        throw new Error(`Direct variable reference '${expression}' failed to resolve. Available top level keys: ${keyPreview}`);
      }
    }

    if (Array.isArray(resolvedValue) || typeof resolvedValue === 'object') {
      resolvedValue = JSON.stringify(resolvedValue);
    }

    result = result.replace(match[0], String(resolvedValue));
  }

  return oldReplaceVariables(result, payload);
}


export function sample(value: any, sampleSize = 10): any {
  if (Array.isArray(value)) {
    const arrLength = value.length;
    if (arrLength <= sampleSize) {
      return value.map(item => sample(item, sampleSize));
    }
    const newArray = value.slice(0, sampleSize).map(item => sample(item, sampleSize));
    newArray.push("sampled from " + (arrLength) + " items");
    return newArray;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => ({
      ...acc,
      [key]: sample(val, sampleSize)
    }), {});
  }

  return value;
}

export function maskCredentials(message: string, credentials?: Record<string, string>): string {
  if (!credentials) {
    return message;
  }

  let maskedMessage = message;
  Object.entries(credentials).forEach(([key, value]) => {
    const valueString = String(value);
    if (value && valueString) {
      const regex = new RegExp(valueString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      maskedMessage = maskedMessage.replace(regex, `{masked_${key}}`);
    }
  });
  return maskedMessage;
}

export function addNullableToOptional(schema: any, required: boolean = true): any {
  if (!schema || typeof schema !== 'object') return schema;

  const newSchema = { ...schema };
  if (!required && schema.required !== true && Array.isArray(schema.type)) {
    if (!schema.type.includes('null')) {
      newSchema.type = [...schema.type, 'null'];
    }
  } else if (!required && schema.required !== true && schema.type) {
    newSchema.type = [schema.type, 'null'];
  }
  if (schema?.$defs) {
    newSchema.$defs = Object.entries(schema.$defs).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: addNullableToOptional(value, required)
    }), {});
  }
  if (schema.oneOf) {
    newSchema.oneOf = schema.oneOf.map(item => addNullableToOptional(item, required));
  }
  if (schema.anyOf) {
    newSchema.anyOf = schema.anyOf.map(item => addNullableToOptional(item, required));
  }
  if (schema.allOf) {
    newSchema.allOf = schema.allOf.map(item => addNullableToOptional(item, required));
  }

  if ((schema.type === 'object' || schema.type?.includes('object')) && schema.properties) {
    newSchema.additionalProperties = false;
    const allRequired = new Set(Array.isArray(schema.required) ? schema.required : []);
    newSchema.required = Array.from(allRequired);
    newSchema.properties = Object.entries(schema.properties).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: addNullableToOptional(value, allRequired.has(key))
    }), {});
  }

  if ((schema.type === 'array' || schema.type?.includes('array')) && schema.items) {
    newSchema.items = addNullableToOptional(schema.items);
  }

  return newSchema;
}

export function isSelfHealingEnabled(options: RequestOptions | undefined, type: "transform" | "api"): boolean {
  const selfHealingMode = options?.selfHealing;

  if (selfHealingMode === undefined || selfHealingMode === null) {
    return true; // we default to enabled if options.selfHealing is not set
  }
  if (selfHealingMode === SelfHealingMode.DISABLED) {
    return false;
  }
  return type === "transform" ? (selfHealingMode === SelfHealingMode.ENABLED || selfHealingMode === SelfHealingMode.TRANSFORM_ONLY) : (selfHealingMode === SelfHealingMode.ENABLED || selfHealingMode === SelfHealingMode.REQUEST_ONLY);
}

export function smartMergeResponses(accumulated: any, newResponse: any): any {
  // First call - no accumulated data yet
  if (accumulated === undefined || accumulated === null) {
    return newResponse;
  }

  // Both are arrays - concatenate
  if (Array.isArray(accumulated) && Array.isArray(newResponse)) {
    return [...accumulated, ...newResponse];
  }

  // Both are objects (not arrays) - merge properties
  if (
    typeof accumulated === 'object' &&
    typeof newResponse === 'object' &&
    !Array.isArray(accumulated) &&
    !Array.isArray(newResponse) &&
    accumulated !== null &&
    newResponse !== null
  ) {
    const merged: Record<string, any> = { ...accumulated };

    for (const key in newResponse) {
      if (Object.prototype.hasOwnProperty.call(newResponse, key)) {
        // Recursively merge nested structures
        if (
          key in merged &&
          typeof merged[key] === 'object' &&
          typeof newResponse[key] === 'object' &&
          merged[key] !== null &&
          newResponse[key] !== null
        ) {
          merged[key] = smartMergeResponses(merged[key], newResponse[key]);
        } else {
          // For conflicts or new keys, take the new value
          merged[key] = newResponse[key];
        }
      }
    }

    return merged;
  }

  // Type conflict or primitives - take the most recent value
  return newResponse;
}


export function sanitizeInstructionSuggestions(raw: unknown): string[] {
  let arr: string[] = [];

  // Try to parse JSON if it's a string
  if (typeof raw === "string") {
    try {
      const parsed = parseJSON(raw);
      if (Array.isArray(parsed)) arr = parsed;
      else arr = [parsed];
    } catch {
      arr = [raw];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }

  // Flatten any multi-line strings
  arr = arr.flatMap((item) =>
    typeof item === "string" ? item.split(/\r?\n/).map((s) => s.trim()) : []
  );

  // Remove empty, header, or markdown lines
  const headerRegex = /^(\s*[#>*-]+\s*)?((integration suggestions|individual suggestions|example output|example:|output:)[^a-zA-Z0-9]*|[\-*#_]{2,}|\s*)$/i;

  // Remove lines that are just markdown separators or bullets
  const isSeparator = (line: string) => {
    const trimmed = line.trim();
    // Remove if only made up of separator chars, or is a single separator char
    return (
      /^[\s\-_*>#]+$/.test(trimmed) ||
      ["_", "-", "*", ">", "#"].includes(trimmed)
    );
  };

  // Format, filter, and deduplicate
  const seen = new Set<string>();
  const filtered = arr
    .map((s) =>
      s
        .replace(/^[-*#>\s]+/, "") // Remove leading markdown symbols and whitespace
        .replace(/[-*#>\s]+$/, "") // Remove trailing markdown symbols and whitespace
        .replace(/^"|"$/g, "") // Remove leading/trailing quotes
        .trim()
    )
    .filter(
      (s) =>
        s.length > 0 &&
        !headerRegex.test(s) &&
        !isSeparator(s) &&
        !seen.has(s) &&
        seen.add(s)
    );

  return filtered;
}

export function convertBasicAuthToBase64(headerValue: string) {
  if (!headerValue) return headerValue;
  // Get the part of the 'Basic '
  const credentials = headerValue.substring('Basic '.length).trim();
  // checking if it is already Base64 decoded
  const seemsEncoded = /^[A-Za-z0-9+/=]+$/.test(credentials);

  if (!seemsEncoded) {
    // if not encoded, convert to username:password to Base64
    const base64Credentials = Buffer.from(credentials).toString('base64');
    return `Basic ${base64Credentials}`;
  }
  return headerValue;
}

export async function validateSchema(data: any, schema: any): Promise<TransformResult> {
  const validator = new Validator();
  const optionalSchema = addNullableToOptional(schema);
  const validation = validator.validate(data, optionalSchema);
  if (!validation.valid) {
    return { success: false, code: "", error: validation.errors.map(e => `${e.stack}. Computed result: ${e.instance ? JSON.stringify(e.instance) : "undefined"}.`).join('\n').slice(0, 1000) + `\n\nExpected schema: ${JSON.stringify(optionalSchema)}` };
  }
  return { success: true, data: data, code: "" };
}
