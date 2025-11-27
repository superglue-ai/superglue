import { BaseConfig, JSONata, JSONSchema, RequestOptions } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import jsonata from "jsonata";
import { generateWorkingTransform } from "../tools/tool-transform.js";
import { isSelfHealingEnabled, transformData, validateSchema } from "./helpers.js";

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


export function oldReplaceVariables(template: string, variables: Record<string, any>): string {
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

export interface TransformConfig extends BaseConfig {
  instruction: string;
  responseSchema: JSONSchema;
  responseMapping?: JSONata;
}

export type TransformInputRequest = {
  id?: string;
  endpoint?: TransformConfig;
};

export async function executeTransformLegacy(args: {
  datastore: DataStore,
  fromCache: boolean,
  input: TransformInputRequest,
  data: any,
  options?: RequestOptions,
  metadata: Metadata
}): Promise<{ data?: any; config?: TransformConfig }> {
  const { datastore, fromCache, input, data, metadata, options } = args;
  let currentConfig = input.endpoint;
  if (fromCache && datastore) {
    const cached = await datastore.getTransformConfig(input.id || input.endpoint.id, metadata.orgId);
    if (cached) {
      currentConfig = { ...cached, ...input.endpoint };
    }
  }
  if (!currentConfig) {
    throw new Error("No transform config found");
  }

  try {
    if (!currentConfig?.responseMapping) {
      throw new Error("No response mapping found");
    }

    const transformResult = await transformData(
      data,
      currentConfig.responseMapping
    );

    if (currentConfig.responseSchema) {
      const validatedResult = await validateSchema(transformResult.data, currentConfig.responseSchema);
      if (!validatedResult.success) {
        throw new Error(`Schema validation failed: ${validatedResult.error}`);
      }
    }

    if (!transformResult.success) {
      throw new Error(transformResult.error);
    }

    return {
      data: transformResult.data,
      config: currentConfig
    };
  } catch (error) {
    const rawErrorString = error?.message || JSON.stringify(error || {});
    const transformError = rawErrorString.slice(0, 200);
    let instruction = currentConfig.instruction;
    if (transformError && currentConfig.responseMapping) {
      instruction = `${instruction}\n\nThe previous error was: ${transformError} for the following mapping: ${currentConfig.responseMapping}`;
    }

    // if the transform is not self healing and there is an existing mapping, throw an error
    // if there is no mapping that means that the config is being generated for the first time and should generate regardless
    if (currentConfig.responseMapping && !isSelfHealingEnabled(options, "transform")) {
      throw new Error(transformError);
    }

    const result = await generateWorkingTransform({
      targetSchema: currentConfig.responseSchema,
      inputData: data,
      instruction: instruction,
      metadata: metadata
    });

    if (!result || !result?.transformCode) {
      throw new Error("Failed to generate transformation code.");
    }

    currentConfig = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...currentConfig,
      responseMapping: result.transformCode
    };

    return {
      data: data,
      config: currentConfig
    };
  }
}