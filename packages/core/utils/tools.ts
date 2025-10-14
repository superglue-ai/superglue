import { HttpMethod, RequestOptions, SelfHealingMode } from "@superglue/client";
import { inferJsonSchema } from '@superglue/shared';
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { GraphQLResolveInfo } from "graphql";
import https from 'https';
import ivm from 'isolated-vm';
import jsonata from "jsonata";
import { Validator } from "jsonschema";
import { HttpMethodEnum } from "../mcp/mcp-server.js";
import { ApiCallError } from "./api.js";
import { parseJSON } from "./json-parser.js";
import { logMessage } from "./logs.js";
import { injectVMHelpersIndividually } from "./vm-helpers.js";

export function isRequested(field: string, info: GraphQLResolveInfo) {
  return info.fieldNodes.some(
    (node) => node.selectionSet && node.selectionSet.selections.some((selection) => selection.kind === 'Field' && selection.name.value === field)
  );
}

export interface TransformResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function applyJsonata(data: any, expr: string): Promise<any> {
  if (!expr) {
    return data;
  }
  try {
    const expression = superglueJsonata(expr);
    const result = await expression.evaluate(data);
    return result;
  } catch (error) {
    const errorPositions = (error as any).position ? expr.substring(error.position - 10, error.position + 10) : "";
    throw new Error(`Transformation failed: ${error.message} at ${errorPositions}.`);
  }
}

export function superglueJsonata(expr: string) {
  const expression = jsonata(expr, {
    recover: false
  });
  expression.registerFunction("max", (arr: any[]) => {
    if (Array.isArray(arr)) {
      return Math.max(...arr);
    }
    return arr;
  });
  expression.registerFunction("min", (arr: any[]) => {
    if (Array.isArray(arr)) {
      return Math.min(...arr);
    }
    return arr;
  });
  expression.registerFunction("number", (value: string) => parseFloat(String(value).trim()));
  expression.registerFunction("map", async (arr: any[], func: (item: any) => any[]) =>
    (Array.isArray(arr) ? await Promise.all(arr.map(func)) : await Promise.all([arr].map(func))) || []
  );
  expression.registerFunction("slice", (arr: any[], start: number, end?: number) => Array.isArray(arr) ? arr.slice(start, end) : arr);
  expression.registerFunction("isArray", async (arr: any) => Array.isArray(arr));
  expression.registerFunction("isString", async (str: any) => typeof str === "string");
  expression.registerFunction("isNull", async (arg: any) => arg === null || arg === undefined);
  expression.registerFunction("join", async (arr: any[], separator: string = ",") =>
    Array.isArray(arr) ? arr.join(separator) : arr
  );
  expression.registerFunction("substring", (str: string, start: number, end?: number) => String(str).substring(start, end));
  expression.registerFunction("replace", (obj: any, pattern: string, replacement: string) => {
    if (Array.isArray(obj)) {
      return obj.map(item => String(item).replace(pattern, replacement));
    }
    if (typeof obj === "object") {
      return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, String(value).replace(pattern, replacement)]));
    }
    return String(obj).replace(pattern, replacement);
  });
  expression.registerFunction("toDate", (date: string | number) => {
    try {
      // Handle numeric timestamps (milliseconds or seconds)
      if (typeof date === 'number' || /^\d+$/.test(date)) {
        const timestamp = typeof date === 'number' ? date : parseInt(date, 10);
        // If timestamp is in seconds (typically 10 digits), convert to milliseconds
        const millisTimestamp = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        return new Date(millisTimestamp).toISOString();
      }

      // Handle date strings in MM/DD/YYYY format
      const match = String(date).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
      if (match) {
        const [_, month, day, year, hours = "00", minutes = "00", seconds = "00"] = match;
        const isoDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
        return new Date(isoDate).toISOString();
      }

      // Default case: try standard Date parsing
      return new Date(date).toISOString();
    } catch (e) {
      throw new Error(`Invalid date: ${e.message}`);
    }
  });

  expression.registerFunction("now", () => new Date().toISOString());

  expression.registerFunction("seconds", () => Math.floor(Date.now() / 1000));
  expression.registerFunction("millis", () => Date.now());

  expression.registerFunction("dateMax", (dates: string[]) =>
    dates.reduce((max, curr) => new Date(max) > new Date(curr) ? max : curr));

  expression.registerFunction("dateMin", (dates: string[]) =>
    dates.reduce((min, curr) => new Date(min) < new Date(curr) ? min : curr));

  expression.registerFunction("dateDiff", (date1: string, date2: string, unit: string = 'days') => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d1.getTime() - d2.getTime());
    switch (unit.toLowerCase()) {
      case 'seconds': return Math.floor(diff / 1000);
      case 'minutes': return Math.floor(diff / (1000 * 60));
      case 'hours': return Math.floor(diff / (1000 * 60 * 60));
      case 'days': return Math.floor(diff / (1000 * 60 * 60 * 24));
      default: return diff; // milliseconds
    }
  });
  return expression;
}

export async function transformAndValidateSchema(data: any, expr: string, schema: any): Promise<TransformResult> {
  try {
    let result: TransformResult;
    if (!expr) {
      result = { success: true, data: data };
    }
    const ARROW_FUNCTION_PATTERN = /^\s*\([^)]+\)\s*=>/;

    if (ARROW_FUNCTION_PATTERN.test(expr)) {
      result = await executeAndValidateMappingCode(data, expr, schema);
    } else {
      result = await applyJsonataWithValidation(data, expr, schema);
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function applyJsonataWithValidation(data: any, expr: string, schema: any): Promise<TransformResult> {
  try {
    const result = await applyJsonata(data, expr);

    // if no schema is given, skip validation
    if (!schema) {
      return { success: true, data: result };
    }
    const validator = new Validator();
    const optionalSchema = addNullableToOptional(schema);
    const validation = validator.validate(result, optionalSchema);
    if (!validation.valid) {
      return {
        success: false,
        data: result,
        error: validation.errors.map(e => `${e.stack}. Computed result: ${e.instance ? JSON.stringify(e.instance) : "undefined"}.`).join('\n').slice(0, 1000) + `\n\nExpected schema: ${JSON.stringify(optionalSchema)}`
      };
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function executeAndValidateMappingCode(input: any, mappingCode: string, schema: any): Promise<TransformResult> {
  const isolate = new ivm.Isolate({ memoryLimit: 1024 }); // 32 MB
  const context = await isolate.createContext();

  // Inject helper functions into the context
  await injectVMHelpersIndividually(context);

  await context.global.set('input', JSON.stringify(input));

  let result: any;
  try {
    const scriptSource = `const fn = ${mappingCode}; const result = fn(JSON.parse(input)); return result === undefined ? null : JSON.stringify(result);`;
    result = parseJSON(await context.evalClosure(scriptSource, null, { timeout: 10000 }));
    // if no schema is given, skip validation
    if (!schema) {
      return { success: true, data: result };
    }
    const validatorInstance = new Validator();
    const optionalSchema = addNullableToOptional(schema);
    const validation = validatorInstance.validate(result, optionalSchema);
    if (!validation.valid) {
      return {
        success: false,
        data: result,
        error: validation.errors.map(e =>
          `${e.stack}. Computed result: ${e.instance ? JSON.stringify(e.instance) : "undefined"}. Expected schema: ${JSON.stringify(e.schema || {})}`)
          .join('\n').slice(0, 2000)
      };
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try {
      isolate.dispose();
    } catch (error) {
      console.error("Error disposing isolate", error);
    }
  }
}

export async function callAxios(config: AxiosRequestConfig, options: RequestOptions) {
  let retryCount = 0;
  const maxRetries = options?.retries ?? 2;
  const delay = options?.retryDelay || 1000;
  const maxRateLimitWaitMs = 60 * 60 * 1000 * 24; // 24 hours is the max wait time for rate limit retries, hardcoded
  let rateLimitRetryCount = 0;
  let totalRateLimitWaitTime = 0;
  const QUICK_RETRY_THRESHOLD_MS = 10000;
  let lastFailureStatus: number | undefined;

  config.headers = {
    "Accept": "*/*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ...config.headers,
  };

  // Don't send body for GET, HEAD, DELETE, OPTIONS
  if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!)) {
    config.data = undefined;
  }
  else if (config.data && config.data.trim().startsWith("{")) {
    try {
      config.data = parseJSON(config.data);
    } catch (error) { }
  }
  else if (!config.data) {
    config.data = undefined;
  }

  do {
    let response: AxiosResponse | null = null;
    try {
      const startTs = Date.now();
      response = await axios({
        ...config,
        responseType: 'arraybuffer', // ALWAYS use arraybuffer to preserve data integrity
        validateStatus: null, // Don't throw on any status
        maxContentLength: Infinity, // No limit on response size
        maxBodyLength: Infinity, // No limit on response body size
        decompress: true, // Ensure gzip/deflate responses are decompressed
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      });
      const durationMs = Date.now() - startTs;

      if (response.status === 429) {

        let waitTime = 0;
        if (response.headers['retry-after']) {
          // Retry-After can be a date or seconds
          const retryAfter = response.headers['retry-after'];
          if (/^\d+$/.test(retryAfter)) {
            waitTime = parseInt(retryAfter, 10) * 1000;
          } else {
            const retryDate = new Date(retryAfter);
            waitTime = retryDate.getTime() - Date.now();
          }
        } else {
          // Exponential backoff with jitter - max wait time is 1 hour
          waitTime = Math.min(Math.pow(10, rateLimitRetryCount) * 1000 + Math.random() * 100, 3600000);
        }

        // Check if we've exceeded the maximum wait time
        if (totalRateLimitWaitTime + waitTime > maxRateLimitWaitMs) {
          // Convert ArrayBuffer to Buffer even for error responses
          if (response.data instanceof ArrayBuffer) {
            response.data = Buffer.from(response.data);
          }
          return response; // Return the 429 response, caller will handle the error
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));

        totalRateLimitWaitTime += waitTime;
        rateLimitRetryCount++;
        continue; // Skip the regular retry logic and try again immediately
      }
      if (response.data instanceof ArrayBuffer) {
        response.data = Buffer.from(response.data);
      }
      if (response.status < 200 || response.status >= 300) {
        if (response.status !== 429 && retryCount < maxRetries && durationMs < QUICK_RETRY_THRESHOLD_MS) {
          lastFailureStatus = response.status;
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        (response as any)._retriesAttempted = retryCount;
        (response as any)._lastFailureStatus = lastFailureStatus ?? response.status;
        return response;
      }
      if (retryCount > 0) {
        const method = (config.method || "GET").toString().toUpperCase();
        const url = (config as any).url || "";
        logMessage("debug", `Automatic retry succeeded for ${method} ${url} after ${retryCount} retr${retryCount === 1 ? "y" : "ies"}${lastFailureStatus ? `; last failure status: ${lastFailureStatus}` : ""}`);
      }
      (response as any)._retriesAttempted = retryCount;
      (response as any)._lastFailureStatus = lastFailureStatus;
      return response;
    } catch (error) {
      if (retryCount >= maxRetries) {
        const baseMessage = (error as any).message || "Network error";
        const withRetryInfo = `${baseMessage} (retries attempted: ${retryCount}${lastFailureStatus ? `, last failure status: ${lastFailureStatus}` : ""})`;
        throw new ApiCallError(withRetryInfo, response?.status);
      }
      lastFailureStatus = response?.status;
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, delay * retryCount));
    }
  } while (retryCount <= maxRetries || rateLimitRetryCount > 0);  // separate max retries and rate limit retries
}

export function applyAuthFormat(format: string, credentials: Record<string, string>): string {
  return format.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!credentials[key]) {
      throw new Error(`Missing credential for ${key}`);
    }
    return credentials[key];
  });
}

// i do not think we are actually using this anywhere since we always get an id for each request
export function generateId(host: string, path: string) {
  const domain = host?.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, '') || 'api';
  const lastPath = path?.split('/').filter(Boolean).pop() || '';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${domain}-${lastPath}-${rand}`;
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
    const path = match[1].trim();
    let value: any;
    if (payload[path]) {
      value = payload[path];
    }
    else {
      // Use transformAndValidateSchema to handle both JS and JSONata
      const result = await transformAndValidateSchema(payload, path, null);
      if (result.success) {
        value = result.data;
      } else {
        throw new Error(`Failed to run JS expression: ${path} - ${result.error}`);
      }
    }

    if (Array.isArray(value) || typeof value === 'object') {
      value = JSON.stringify(value);
    }

    result = result.replace(match[0], String(value));
  }

  return oldReplaceVariables(result, payload);
}

function oldReplaceVariables(template: string, variables: Record<string, any>): string {
  if (!template) return "";

  const variableNames = Object.keys(variables);
  const pattern = new RegExp(`\\{(${variableNames.join('|')})(?:\\.(\\w+))*\\}`, 'g');

  return String(template).replace(pattern, (match, path) => {
    const parts = path.split('.');
    let value = variables;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return match; // Keep original if path is invalid
      }
      value = value[part];
    }

    if (value === undefined || value === null) {
      if (path == 'cursor') {
        return "";
      }
      return match; // Keep original if final value is invalid
    }

    if (Array.isArray(value) || typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
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

export function getSchemaFromData(data: any): string {
  if (!data) return null;

  const schema = inferJsonSchema(data);
  return JSON.stringify(schema, null, 2).slice(0, 50000);
}

export function safeHttpMethod(method: any): HttpMethod {
  const validMethods = HttpMethodEnum.options;
  if (validMethods.includes(method)) return method as HttpMethod;
  const upper = method?.toUpperCase?.();
  if (upper && validMethods.includes(upper)) return upper as HttpMethod;
  return "GET" as HttpMethod;
}

export async function evaluateStopCondition(
  stopConditionCode: string,
  response: AxiosResponse,
  pageInfo: { page: number; offset: number; cursor: any; totalFetched: number }
): Promise<{ shouldStop: boolean; error?: string }> {


  const isolate = new ivm.Isolate({ memoryLimit: 128 });

  try {
    const context = await isolate.createContext();

    // Inject the response and pageInfo as JSON strings
    // legacy support for direct response data access
    await context.global.set('responseJSON', JSON.stringify({ data: response.data, headers: response.headers, ...response.data }));
    await context.global.set('pageInfoJSON', JSON.stringify(pageInfo));

    // if the stop condition code starts with return or is not a function, we need to wrap it in a function
    if (stopConditionCode.startsWith("return")) {
      stopConditionCode = `(response, pageInfo) => { ${stopConditionCode} }`;
    }
    else if (!stopConditionCode.startsWith("(response")) {
      stopConditionCode = `(response, pageInfo) => ${stopConditionCode}`;
    }

    // Create the evaluation script
    const script = `
          const response = JSON.parse(responseJSON);
          const pageInfo = JSON.parse(pageInfoJSON);
          const fn = ${stopConditionCode};
          const result = fn(response, pageInfo);
          // Return the boolean result
          return Boolean(result);
      `;

    const shouldStop = await context.evalClosure(script, null, { timeout: 3000 });

    return { shouldStop: Boolean(shouldStop) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let helpfulError = `Stop condition evaluation failed: ${errorMessage}`;

    return {
      shouldStop: false, // Default to continue on error
      error: helpfulError
    };
  } finally {
    try {
      isolate.dispose();
    } catch (error) {
      console.error("Error disposing isolate", error);
    }
  }
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

// Legacy function needs to stay for existing workflow backwards compatibility
export function flattenObject(obj: any, parentKey = '', res: Record<string, any> = {}): Record<string, any> {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const propName = parentKey ? `${parentKey}_${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        flattenObject(obj[key], propName, res);
      } else {
        res[propName] = obj[key];
      }
    }
  }
  return res;
}