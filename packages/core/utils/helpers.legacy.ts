import jsonata from "jsonata";
import { Validator } from "jsonschema";
import { TransformResult, addNullableToOptional } from "./helpers.js";

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