import { RequestOptions } from "@superglue/shared";
import axios, { AxiosRequestConfig } from "axios";
import { GraphQLResolveInfo } from "graphql";
import jsonata from "jsonata";
import { Validator } from "jsonschema";
import toJsonSchema from "to-json-schema";

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
    const expression = superglueJsonata(expr);
    const result = await expression.evaluate(data);
    return result;
  } catch (error) {
    throw new Error(`Mapping transformation failed: ${error.message}`);
  }
}

export function superglueJsonata(expr: string) {
  const expression = jsonata(expr);
  expression.registerFunction("max", (arr: any[]) => {
    if(Array.isArray(arr)) {
      return Math.max(...arr);
    }
    return arr;
  });
  expression.registerFunction("min", (arr: any[]) => {
    if(Array.isArray(arr)) {
      return Math.min(...arr);
    }
    return arr;
  });
  expression.registerFunction("number", (value: string) => parseFloat(value));
  expression.registerFunction("substring", (str: string, start: number, end?: number) => String(str).substring(start, end));
  expression.registerFunction("replace", (obj: any, pattern: string, replacement: string) => {
    if(Array.isArray(obj)) {
      return obj.map(item => String(item).replace(pattern, replacement));
    }
    if(typeof obj === "object") {
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
        const [_, month, day, year, hours="00", minutes="00", seconds="00"] = match;
        const isoDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
        return new Date(isoDate).toISOString();
      }
      
      // Default case: try standard Date parsing
      return new Date(date).toISOString();
    } catch (e) {
      throw new Error(`Invalid date: ${e.message}`);
    }
  });
  expression.registerFunction("dateMax", (dates: string[]) => 
    dates.reduce((max, curr) => new Date(max) > new Date(curr) ? max : curr));
  
  expression.registerFunction("dateMin", (dates: string[]) => 
    dates.reduce((min, curr) => new Date(min) < new Date(curr) ? min : curr));
  
  expression.registerFunction("dateDiff", (date1: string, date2: string, unit: string = 'days') => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d1.getTime() - d2.getTime());
    switch(unit.toLowerCase()) {
      case 'seconds': return Math.floor(diff / 1000);
      case 'minutes': return Math.floor(diff / (1000 * 60));
      case 'hours': return Math.floor(diff / (1000 * 60 * 60));
      case 'days': return Math.floor(diff / (1000 * 60 * 60 * 24));
      default: return diff; // milliseconds
    }
  });
  return expression;
}

export async function applyJsonataWithValidation(data: any, expr: string, schema: any): Promise<TransformResult> {
  try {
    const result = await applyJsonata(data, expr);
    if(result === null || result === undefined || result?.length === 0 || Object.keys(result).length === 0) {
      return { success: false, error: "Result is empty" };
    }
    const validator = new Validator();
    const optionalSchema = addNullableToOptional(schema);
    const validation = validator.validate(result, optionalSchema);
    if (!validation.valid) {
      return {
        success: false, 
        error: validation.errors.map(e => `${e.stack}. Source: ${e.instance ? JSON.stringify(e.instance) : "undefined"}`).join('\n').slice(0, 5000) 
      };
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
  const maxRateLimitWaitMs = 60 * 1000; // 60s is the max wait time for rate limit retries, hardcoded
  let rateLimitRetryCount = 0;
  let totalRateLimitWaitTime = 0;

  // Don't send body for GET, HEAD, DELETE, OPTIONS
  if(["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!)) {
    config.data = undefined;
  }
  
  do {
    try {
      const response = await axios({
        ...config,
        validateStatus: null, // Don't throw on any status
      });
      
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
          // Exponential backoff with jitter
          waitTime = Math.min(Math.pow(2, rateLimitRetryCount) * 1000 + Math.random() * 1000, 10000);
        }
        
        // Check if we've exceeded the maximum wait time
        if (totalRateLimitWaitTime + waitTime > maxRateLimitWaitMs) {
          console.log(`Rate limit retry would exceed maximum wait time of ${maxRateLimitWaitMs}ms (60s)`);
          return response; // Return the 429 response, caller will handle the error
        }
        
        console.log(`Rate limited (429). Waiting ${waitTime}ms before retry.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        totalRateLimitWaitTime += waitTime;
        rateLimitRetryCount++;
        continue; // Skip the regular retry logic and try again immediately
      }
      
      return response;
    } catch (error) {
      if (retryCount >= maxRetries) throw error;
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, delay * retryCount));
    }
  } while (retryCount < maxRetries || rateLimitRetryCount > 0);  // separate max retries and rate limit retries
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
  
  // Trim slashes in one pass
  const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

export function replaceVariables(template: string, variables: Record<string, any>): string {
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
      return match; // Keep original if final value is invalid
    }

    if(Array.isArray(value)) {
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
    const step = Math.floor(arrLength / sampleSize);
    return Array.from({ length: sampleSize }, (_, i) => sample(value[i * step], sampleSize));
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
    if (value && value.length > 0) {
      // Use global flag to replace all occurrences
      const regex = new RegExp(value, 'g');
      maskedMessage = maskedMessage.replace(regex, `{masked_${key}}`);
    }
  });
  return maskedMessage;
}

export function addNullableToOptional(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  const newSchema = { ...schema };

  if (schema.type === 'object' && schema.properties) {
    const required = new Set(schema.required || []);
    newSchema.properties = Object.entries(schema.properties).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: !required.has(key) ? makeNullable(value) : addNullableToOptional(value)
    }), {});
  }

  if (schema.type === 'array' && schema.items) {
    newSchema.items = addNullableToOptional(schema.items);
  }

  return newSchema;
}

function makeNullable(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  
  const newSchema = { ...schema };
  
  if (Array.isArray(schema.type)) {
    if (!schema.type.includes('null')) {
      newSchema.type = [...schema.type, 'null'];
    }
  } else if (schema.type) {
    newSchema.type = [schema.type, 'null'];
  }
  
  // Recursively process nested properties
  if (schema.properties) {
    newSchema.properties = Object.entries(schema.properties).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: makeNullable(value)
    }), {});
  }
  
  if (schema.items) {
    newSchema.items = makeNullable(schema.items);
  }
  
  return newSchema;
}

export function getSchemaFromData(data: any): string {
  if(!data) return null;
  return JSON.stringify(toJsonSchema(data, {required: true, arrays: {mode: 'first'}}), null, 2).slice(0, 5000);
}