import { applyJsonata } from "../../../utils/tools.js";

/**
 * Find a value by key in the data object, searching through nested objects
 * @param data The data object to search in
 * @param key The key to search for
 * @returns The found value or undefined
 */
export function findValue(data: Record<string, unknown>, key: string): unknown {
  if (key in data) {
    return data[key];
  }
  try {
    // Use JSONata to find the value with a simple search pattern at any level of nesting
    return applyJsonata(data, `**[$.${key}]`);
  } catch (error) {
    console.error(`Error finding value for key ${key}:`, error);
    return undefined;
  }
}

/**
 * Extract values by path from the data object
 * @param data The data object to extract from
 * @param path The path or JSONata expression to use
 * @returns Array of extracted values
 */
export function extractValues(data: Record<string, unknown>, path: string): unknown[] {
  if (!path || path === "$") {
    if (Array.isArray(data)) {
      return data;
    }
    // we can handle various patterns here, e.g. if certain APIs store stuff in certain keys
    // e.g. messages, results, data, etc.

    return Object.values(data);
  }

  try {
    // Convert simple dot notation to JSONata
    const jsonataExpr = path.includes("$") ? path : path.split(".").join(".");
    const result = applyJsonata(data, jsonataExpr);

    if (Array.isArray(result)) {
      return result;
    }

    if (result && typeof result === "object") {
      return Object.keys(result as Record<string, unknown>);
    }

    return result ? [result] : [];
  } catch (error) {
    console.error(`Error extracting values with path ${path}:`, error);
    return [];
  }
}
