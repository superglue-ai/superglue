import { GraphQLResolveInfo } from "graphql";
import { RedisService } from "./redis.js";
import { RequestOptions } from "@superglue/shared";
import axios, { AxiosRequestConfig } from "axios";
import jsonata from "jsonata";
import { Validator } from "jsonschema";
import { createDataStore } from "./datastore.js";

export function isRequested(field: string, info: GraphQLResolveInfo) {
    return info.fieldNodes.some(
      (node) => node.selectionSet && node.selectionSet.selections.some((selection) => selection.kind === 'Field' && selection.name.value === field)
    );
  }

interface TransformResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function applyJsonata(data: any, expr: string): Promise<any> {
  try {
    const result = await jsonata(expr).evaluate(data);
    return result;
  } catch (error) {
    throw new Error(`Mapping transformation failed: ${error.message}`);
  }
}
export async function applyJsonataWithValidation(data: any, expr: string, schema: any): Promise<TransformResult> {
  try {
    const result = await applyJsonata(data, expr);
    const validator = new Validator();
    const requiredSchema = makeRequired(schema);
    const validation = validator.validate(result, requiredSchema, { required: true });
    if (!validation.valid) {
      return { success: false, error: validation.errors.map(e => e.stack).join(', ') };
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
function makeRequired(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  const newSchema = { ...schema };

  if (schema.type === 'object' && schema.properties) {
    newSchema.required = Object.keys(schema.properties);
    newSchema.properties = Object.entries(schema.properties).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: makeRequired(value)
    }), {});
  }

  if (schema.type === 'array' && schema.items) {
    newSchema.items = makeRequired(schema.items);
  }

  return newSchema;
}

export async function callAxios(config: AxiosRequestConfig, options: RequestOptions) {
  let retryCount = 0;
  const maxRetries = options?.retries || 0;
  const delay = options?.retryDelay || 1000;

  // Don't send body for GET, HEAD, DELETE, OPTIONS
  if(["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!)) {
    config.data = undefined;
  }

  do {
    try {
      return await axios({
        ...config,
        validateStatus: null, // Don't throw on any status
      });
    } catch (error) {
      if (retryCount >= maxRetries) throw error;
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, delay * retryCount));
    }
  } while (retryCount < maxRetries);
}

export function applyAuthFormat(format: string, credentials: Record<string, string>): string {
  return format.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!credentials[key]) {
      throw new Error(`Missing credential for ${key}`);
    }
    return credentials[key];
  });
}


export function getAllKeys(obj: any): string[] {
  let keys: string[] = [];
  for (const key in obj) {
    keys.push(key);
    if (obj[key] && typeof obj[key] === 'object') {
      keys = keys.concat(getAllKeys(obj[key]));
    }
  }
  return keys.sort();
}

export function composeUrl(host: string, path: string) {
  // Handle empty/undefined inputs
  if (!host) host = '';
  if (!path) path = '';
  
  // Trim slashes in one pass
  const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

export function replaceVariables(template: string, variables: Record<string, any>): string {
  const variableNames = Object.keys(variables);
  const pattern = new RegExp(`\\{(${variableNames.join('|')})(?:\\.(\\w+))*\\}`, 'g');
  
  return template.replace(pattern, (match, path) => {
    const parts = path.split('.');
    let value = variables;
    
    for (const part of parts) {
      if (value === undefined || value === null) {
        return match; // Keep original if path is invalid
      }
      value = value[part];
    }

    if (value === undefined || value === null) {
      return match; // Keep original if final value is invalid
    }

    return String(value);
  });
}
