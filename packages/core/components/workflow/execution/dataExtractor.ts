/**
 * Utility class for extracting data from complex nested objects
 * This class provides methods to find values in JSON objects by key or path
 */
export class DataExtractor {
  constructor(private data: Record<string, unknown>) {}

  /**
   * Find a value by key in the data object, searching through nested objects
   * @param key The key to search for
   * @returns The found value or undefined
   */
  findValue(key: string): unknown {
    // Check if it exists directly on the data object
    if (key in this.data) {
      return this.data[key];
    }

    // Look for it in nested objects
    return this.searchNestedObjects(this.data, key);
  }

  /**
   * Extract values by path from the data object
   * Handles both simple paths (e.g., "data.items") and array paths (e.g., "data.items[].id")
   * @param path The path to extract values from
   * @returns Array of extracted values
   */
  extractValues(path: string): unknown[] {
    // If path is empty, search for values at top level
    if (!path || path === "$") {
      const values: unknown[] = [];

      // If data is already an array, return it
      if (Array.isArray(this.data)) {
        return this.data;
      }

      // If data has a message property that's an object, get its keys (common in APIs)
      if ("message" in this.data && typeof this.data.message === "object" && this.data.message !== null) {
        const messageObj = this.data.message as Record<string, unknown>;

        if (!Array.isArray(messageObj) && Object.keys(messageObj).length > 0) {
          return Object.keys(messageObj);
        }

        // If message is an array, return it
        return Object.values(messageObj);
      }

      // Return the object's values as a fallback
      return Object.values(this.data);
    }

    // Handle JsonPath-like notation
    try {
      const pathParts = path.split(".");
      let current: unknown = this.data;

      for (const part of pathParts) {
        if (!current || typeof current !== "object") {
          return []; // Path doesn't exist
        }

        // Handle array indexing or collection
        if (part.includes("[") && part.includes("]")) {
          const [propName, indexOrEmpty] = part.split("[");

          // Get the property
          if (propName && propName in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[propName];
          } else {
            return []; // Property doesn't exist
          }

          // Handle empty brackets '[]' - return all items in array
          if (indexOrEmpty === "]") {
            if (Array.isArray(current)) {
              return current;
            }

            // If it's an object, return its values
            if (current && typeof current === "object") {
              return Object.values(current as Record<string, unknown>);
            }
          }
          // Handle specific index
          else {
            const index = Number.parseInt(indexOrEmpty.slice(0, -1));
            if (Array.isArray(current) && index >= 0 && index < current.length) {
              current = current[index];
            } else {
              return []; // Invalid index
            }
          }
        }
        // Regular property access
        else if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[part];
        }
        // Try "message" as a fallback (common in many APIs)
        else if (
          current &&
          typeof current === "object" &&
          "message" in (current as Record<string, unknown>) &&
          typeof (current as Record<string, unknown>).message === "object"
        ) {
          const messageObj = (current as Record<string, unknown>).message as Record<string, unknown>;

          if (part in messageObj) {
            current = messageObj[part];
          } else {
            return []; // Path doesn't exist in message object
          }
        } else {
          return []; // Path doesn't exist
        }
      }

      // If we found something, return it as an array
      if (current !== undefined) {
        if (Array.isArray(current)) {
          return current;
        }
        if (current && typeof current === "object") {
          // If it's an object, return either its values or its keys
          // For Dog API: return object keys as values to use as breeds
          if (Object.keys(current as Record<string, unknown>).length > 0) {
            return Object.keys(current as Record<string, unknown>);
          }
          return Object.values(current as Record<string, unknown>);
        }
        return [current];
      }

      return [];
    } catch (error) {
      console.error(`Error extracting values from path ${path}:`, error);
      return [];
    }
  }

  /**
   * Recursively search nested objects for a key
   * @param obj The object to search in
   * @param targetKey The key to find
   * @returns The found value or undefined
   */
  private searchNestedObjects(obj: Record<string, unknown>, targetKey: string): unknown {
    // Check special cases first (common in APIs)

    // Check in "message" object, which is common in many APIs
    if ("message" in obj && typeof obj.message === "object" && obj.message !== null) {
      const messageObj = obj.message as Record<string, unknown>;

      // Direct match in message
      if (targetKey in messageObj) {
        return messageObj[targetKey];
      }

      // If message is an object with keys that might be what we're looking for (e.g., breeds)
      if (!Array.isArray(messageObj) && Object.keys(messageObj).length > 0) {
        // Return first key as a sample value if we're looking for that type of data
        // This is useful for APIs that return data like { message: { breed1: [], breed2: [] } }
        return Object.keys(messageObj)[0];
      }
    }

    // For each property in the object
    for (const [key, value] of Object.entries(obj)) {
      // Direct match
      if (key === targetKey) {
        return value;
      }

      // If value is an object, search recursively
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const found = this.searchNestedObjects(value as Record<string, unknown>, targetKey);
        if (found !== undefined) {
          return found;
        }
      }

      // If value is an array, search each item
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            const found = this.searchNestedObjects(item as Record<string, unknown>, targetKey);
            if (found !== undefined) {
              return found;
            }
          }
        }
      }
    }

    return undefined;
  }
}
