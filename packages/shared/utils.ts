import { System } from "./types.js";
import { toJsonSchema } from "./json-schema.js";
import { UserRole } from "./types.js";

// Re-export cron utilities
export * from "./utils/cron.js";

// Re-export AI model initialization utilities
export * from "./utils/ai-model-init.js";

// Re-export model context length utilities
export * from "./utils/model-context-length.js";

export const ALLOWED_FILE_EXTENSIONS = [
  ".json",
  ".csv",
  ".txt",
  ".xml",
  ".xlsx",
  ".xls",
  ".pdf",
  ".docx",
  ".zip",
  ".gz",
  ".yaml",
  ".yml",
  // Code files (extracted as plain text)
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".kt",
  ".scala",
  ".sh",
  ".bash",
  ".sql",
  ".html",
  ".css",
  ".scss",
  ".md",
  ".rst",
] as const;

// ---- Schema inference configuration (tunable) ----
const SMALL_ARRAY_THRESHOLD = 100; // Arrays smaller than this analyze all items
const SAMPLE_SIZE = 50; // Total samples for large arrays
const HEAD_SIZE = 15; // Samples from beginning of array
const TAIL_SIZE = 15; // Samples from end of array
const MAX_UNIQUE_SCHEMAS = 10; // Max unique schemas to detect for heterogeneous arrays
const DEEP_SIGNATURE_DEPTH = 5; // Depth for deep structure signature

const isPlainObject = (value: any): boolean => {
  return (
    value != null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
  );
};

const sampleLargeArray = (data: any[]): any[] => {
  const samples: any[] = [];
  for (let i = 0; i < Math.min(HEAD_SIZE, data.length); i++) samples.push(data[i]);
  const tailStart = Math.max(HEAD_SIZE, data.length - TAIL_SIZE);
  for (let i = tailStart; i < data.length; i++) samples.push(data[i]);
  const middleSize = SAMPLE_SIZE - samples.length;
  if (middleSize > 0 && data.length > HEAD_SIZE + TAIL_SIZE) {
    const middleStart = HEAD_SIZE;
    const middleEnd = tailStart;
    const reservoir: any[] = [];
    for (let i = middleStart; i < Math.min(middleStart + middleSize, middleEnd); i++)
      reservoir.push(data[i]);
    for (let i = middleStart + middleSize; i < middleEnd; i++) {
      const j = Math.floor(Math.random() * (i - middleStart + 1));
      if (j < middleSize) reservoir[j] = data[i];
    }
    samples.push(...reservoir);
  }
  return samples;
};

const getDeepStructureKey = (schema: any, depth: number = DEEP_SIGNATURE_DEPTH): string => {
  if (depth === 0 || !schema || typeof schema !== "object") return schema?.type || "unknown";
  if (schema.type === "object" && schema.properties) {
    const propSigs = Object.keys(schema.properties)
      .sort()
      .map((key) => `${key}:${getDeepStructureKey(schema.properties[key], depth - 1)}`);
    return `{${propSigs.join(",")}}`;
  }
  if (schema.type === "array" && schema.items) {
    return `[${getDeepStructureKey(schema.items, depth - 1)}]`;
  }
  if (schema.oneOf) {
    const sigs = schema.oneOf.map((s: any) => getDeepStructureKey(s, depth - 1));
    return `oneOf(${sigs.join("|")})`;
  }
  return schema.type || "unknown";
};

// Build detailed array schema using samples and deep-structure uniqueness
function buildArraySchemaFromData(arr: any[]): any {
  if (!arr || arr.length === 0) return { type: "array", items: {} };

  const hasObjects = arr.some((item) => isPlainObject(item));
  const samples: any[] = arr.length <= SMALL_ARRAY_THRESHOLD ? arr : sampleLargeArray(arr);

  if (hasObjects) {
    const uniqueSchemas: any[] = [];
    const schemaCache = new Map<string, any>();
    for (const item of samples) {
      if (!isPlainObject(item)) continue;
      const itemSchema = toJsonSchema(item, {
        arrays: { mode: "all" },
        objects: { additionalProperties: true },
      });
      const key = getDeepStructureKey(itemSchema);
      if (!schemaCache.has(key)) {
        schemaCache.set(key, itemSchema);
        uniqueSchemas.push(itemSchema);
        if (uniqueSchemas.length >= MAX_UNIQUE_SCHEMAS) break;
      }
    }
    if (uniqueSchemas.length > 1) return { type: "array", items: { oneOf: uniqueSchemas } };
    if (uniqueSchemas.length === 1) return { type: "array", items: uniqueSchemas[0] };
  }

  // Fallback for primitives/mixed
  const base = toJsonSchema(samples, {
    arrays: { mode: "all" },
    objects: { additionalProperties: true },
  });
  return base?.type === "array" ? base : { type: "array", items: base };
}

// Recursively enhance nested array schemas using actual data
function enhanceSchemaWithData(value: any, schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(value)) {
    return buildArraySchemaFromData(value);
  }

  if (isPlainObject(value) && schema.type === "object" && schema.properties) {
    const enhanced: any = { ...schema, properties: { ...schema.properties } };
    for (const key of Object.keys(enhanced.properties)) {
      const childSchema = enhanced.properties[key];
      const childValue = value?.[key];
      if (Array.isArray(childValue) || isPlainObject(childValue)) {
        enhanced.properties[key] = enhanceSchemaWithData(childValue, childSchema);
      }
    }
    return enhanced;
  }

  if (schema.type === "array" && Array.isArray(value)) {
    return buildArraySchemaFromData(value);
  }

  return schema;
}

export function flattenAndNamespaceCredentials(systems: System[]): Record<string, string> {
  return systems.reduce(
    (acc, sys) => {
      Object.entries(sys.credentials || {}).forEach(([key, value]) => {
        acc[`${sys.id}_${key}`] = value;
      });
      return acc;
    },
    {} as Record<string, string>,
  );
}

export async function generateUniqueId({
  baseId,
  exists,
}: {
  baseId: string;
  exists: (id: string) => Promise<boolean> | boolean;
}): Promise<string> {
  if (!(await exists(baseId))) {
    return baseId;
  }

  let counter = 1;
  const match = baseId.match(/(.*)-(\d+)$/);
  let root = baseId;

  if (match) {
    root = match[1];
    counter = parseInt(match[2], 10) + 1;
  }

  while (true) {
    const newId = `${root}-${counter}`;
    if (!(await exists(newId))) {
      return newId;
    }
    counter++;
  }
}

interface SystemGetter {
  getSystem(id: string): Promise<System | null>;
  getManySystems?(ids: string[]): Promise<System[]>;
}

// Generic system polling utility that works with any system getter
// Assumes all systemIds are valid and exist
export async function waitForSystemProcessing(
  systemGetter: SystemGetter,
  systemIds: string[],
  timeoutMs: number = 90000,
): Promise<System[]> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    let systems: System[];
    if (systemGetter.getManySystems) {
      systems = await systemGetter.getManySystems(systemIds);
    } else {
      const settled = await Promise.allSettled(
        systemIds.map(async (id) => {
          try {
            return await systemGetter.getSystem(id);
          } catch {
            return null;
          }
        }),
      );
      systems = settled
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter(Boolean) as System[];
    }
    const hasPendingDocs = systems.some((i) => i.documentationPending === true);
    if (!hasPendingDocs) return systems;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  throw new Error(
    `Waiting for documentation processing to complete timed out after ${timeoutMs / 1000} seconds for: ${systemIds.join(", ")}. Please try again in a few minutes.`,
  );
}

/**
 * Infer JSON Schema from data with smart sampling for arrays
 *
 * For small arrays (≤100 items): analyzes all items
 * For large arrays (>100 items): uses head/tail/reservoir sampling
 * For heterogeneous arrays: detects up to 10 unique structures and uses oneOf
 *
 * @param data - The data to infer schema from
 * @returns JSON Schema object
 */
export function inferJsonSchema(data: any): any {
  // Handle primitives and non-arrays directly (and enhance nested arrays)
  if (!Array.isArray(data)) {
    const base = toJsonSchema(data, {
      arrays: { mode: "all" },
      objects: { additionalProperties: true },
    });
    return enhanceSchemaWithData(data, base);
  }

  // Empty array
  if (data.length === 0) {
    return { type: "array", items: {} };
  }

  // For arrays, first check if items are objects and potentially heterogeneous
  // Arrays
  return buildArraySchemaFromData(data);
}

export function mapUserRole(role: string): UserRole {
  switch (role) {
    case "admin":
      return UserRole.ADMIN;
    case "member":
      return UserRole.MEMBER;
    default:
      return UserRole.MEMBER;
  }
}

export function resolveOAuthCertAndKey(oauthCert: string, oauthKey: string) {
  let parsedCert: { content: string; filename: string } | null = null;
  let parsedKey: { content: string; filename: string } | null = null;

  try {
    if (oauthCert && oauthKey) {
      parsedCert = JSON.parse(oauthCert);
      parsedKey = JSON.parse(oauthKey);
    }
  } catch {
    return {
      cert: { content: undefined, filename: undefined },
      key: { content: undefined, filename: undefined },
    };
  }
  return { cert: parsedCert, key: parsedKey };
}

/**
 * Ensures code is wrapped as a valid arrow function with sourceData parameter.
 *
 * Special cases:
 * - Empty/null/undefined → returns `(sourceData) => { return {}; }` (for loopSelector - execute once with empty object)
 * - `$` → returns `(sourceData) => { return sourceData; }` (identity transform)
 * - Valid arrow function → returns as-is
 * - Raw code → wraps in arrow function
 */
export function isArrowFunction(code: string | undefined | null): boolean {
  const text = (code || "").trim();
  if (!text) return false;

  return /^\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(text);
}

export function assertValidArrowFunction(code: string | undefined | null): string {
  const text = (code || "").trim();
  if (!text) return `(sourceData) => {\n  return {};\n}`;
  if (text === "$") return `(sourceData) => {\n  return sourceData;\n}`;

  if (isArrowFunction(text)) {
    return text;
  }

  if (text.startsWith("//")) {
    throw new Error(`Found comment in code: ${text}.`);
  }

  throw new Error(`Invalid arrow function: ${text}. Expected a valid arrow function.`);
}

export function maskCredentials(message: string, credentials?: Record<string, string>): string {
  if (!credentials) {
    return message;
  }
  let maskedMessage = message;
  Object.entries(credentials).forEach(([key, value]) => {
    const valueString = String(value);
    if (value && valueString) {
      const regex = new RegExp(valueString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      maskedMessage = maskedMessage.replace(regex, `{masked_${key}}`);
    }
  });
  return maskedMessage;
}

export function sampleResultObject(value: any, sampleSize = 10, seen = new WeakSet()): any {
  if (value === null || value === undefined) return value;

  if (typeof value !== "object") return value;

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const arrLength = value.length;
    if (arrLength <= sampleSize) {
      return value.map((item) => sampleResultObject(item, sampleSize, seen));
    }
    const newArray = value
      .slice(0, sampleSize)
      .map((item) => sampleResultObject(item, sampleSize, seen));
    newArray.push(`sampled from ${arrLength} items`);
    return newArray;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map)
    return Object.fromEntries(
      Array.from(value.entries()).map(([k, v]) => [k, sampleResultObject(v, sampleSize, seen)]),
    );
  if (value instanceof Set) return sampleResultObject(Array.from(value), sampleSize, seen);
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message };

  if (!isPlainObject(value)) return String(value);

  return Object.entries(value).reduce(
    (acc, [key, val]) => ({
      ...acc,
      [key]: sampleResultObject(val, sampleSize, seen),
    }),
    {},
  );
}

export function safeStringify(value: any): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      2,
    );
  } catch (err) {
    // As a last resort, coerce to string
    return String(value ?? "");
  }
}

export function getDateMessage(): { role: "system"; content: string } {
  return {
    role: "system" as const,
    content: "The current date and time is " + new Date().toISOString(),
  };
}
