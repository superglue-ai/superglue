import { System } from "./types.js";
import { toJsonSchema } from "./json-schema.js";
import { PatchSystemBody } from "./types.js";
import { Tool, isRequestConfig, RequestStepConfig } from "./types.js";
import truncateJsonLib from "truncate-json";

// Re-export cron utilities
export * from "./utils/cron.js";

// Re-export model context length utilities
export * from "./utils/model-context-length.js";

// Re-export token counting utilities
export * from "./utils/token-count.js";

export type ConnectionProtocol = "http" | "postgres" | "mssql" | "redis" | "sftp" | "smb";

export function inferProtocolFromUrl(url: string): ConnectionProtocol {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  if (url.startsWith("mssql://") || url.startsWith("sqlserver://")) return "mssql";
  if (url.startsWith("redis://") || url.startsWith("rediss://")) return "redis";
  if (url.startsWith("ftp://") || url.startsWith("ftps://") || url.startsWith("sftp://"))
    return "sftp";
  if (url.startsWith("smb://")) return "smb";
  return "http";
}

// Backward-compatible alias while the rest of OSS catches up to hosted naming.
export const getConnectionProtocol = inferProtocolFromUrl;

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return error.startsWith("AbortError:");
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.startsWith("AbortError:");
  }
  return false;
}

/**
 * Validate that a URL targets an external (public) host.
 *
 * Blocks:
 * - Non-HTTP(S) protocols
 * - Loopback addresses (127.0.0.0/8, ::1, localhost)
 * - RFC 1918 private networks (10/8, 172.16/12, 192.168/16)
 * - Link-local (169.254/16, fe80::/10)
 * - IPv4-mapped IPv6 (::ffff:x.x.x.x) pointing to private ranges
 * - IPv6 unique local (fc00::/7)
 * - Cloud metadata endpoints (.internal suffix)
 * - Unspecified addresses (0.0.0.0, ::)
 */
export function validateExternalUrl(raw: string): URL {
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  let host = parsed.hostname.toLowerCase();

  // Strip IPv6 brackets if present (URL parser may include them)
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  // Resolve IPv4-mapped IPv6 addresses to their IPv4 equivalents.
  // Node's URL parser converts these to hex form (e.g., ::ffff:10.0.0.1 → ::ffff:a00:1),
  // so we handle both decimal (::ffff:d.d.d.d) and hex (::ffff:HHHH:HHHH) formats.
  let ipv4Host = host;
  const ipv4MappedDecimal = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4MappedDecimal) {
    ipv4Host = ipv4MappedDecimal[1];
  } else {
    const ipv4MappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (ipv4MappedHex) {
      const high = parseInt(ipv4MappedHex[1], 16);
      const low = parseInt(ipv4MappedHex[2], 16);
      ipv4Host = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
    }
  }

  // Block loopback: localhost, 127.0.0.0/8, ::1
  if (
    ipv4Host === "localhost" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4Host) ||
    host === "::1"
  ) {
    throw new Error(`URL target is not allowed: ${host}`);
  }

  // Block unspecified addresses
  if (ipv4Host === "0.0.0.0" || host === "::") {
    throw new Error(`URL target is not allowed: ${host}`);
  }

  // Block RFC 1918 private networks
  if (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4Host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ipv4Host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ipv4Host)
  ) {
    throw new Error(`URL target is not allowed: ${host}`);
  }

  // Block link-local: 169.254.0.0/16 (IPv4), fe80::/10 (IPv6, covers fe80–febf)
  if (ipv4Host.startsWith("169.254.")) {
    throw new Error(`URL target is not allowed: ${host}`);
  }
  if (host.includes(":")) {
    const firstHextetMatch = host.match(/^([0-9a-f]{1,4})(?::|$)/);
    if (firstHextetMatch) {
      const firstHextet = parseInt(firstHextetMatch[1], 16);
      // fe80::/10 → top 10 bits = 0x3FA0, mask 0xFFC0 → match 0xFE80
      if ((firstHextet & 0xffc0) === 0xfe80) {
        throw new Error(`URL target is not allowed: ${host}`);
      }
      // fc00::/7 → top 7 bits, mask 0xFE00 → match 0xFC00 (covers fc00::–fdff::)
      if ((firstHextet & 0xfe00) === 0xfc00) {
        throw new Error(`URL target is not allowed: ${host}`);
      }
    }
  }

  // Block cloud metadata / internal service discovery
  if (host.endsWith(".internal")) {
    throw new Error(`URL target is not allowed: ${host}`);
  }

  return parsed;
}

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

type ParsedToolInputSchema = {
  rawSchema: any | null;
  payloadSchema: any | null;
  filesSchema: any | null;
  credentialsSchema: any | null;
  hasNestedSections: boolean;
};

function tryParseSchema(schema: any): any | null {
  if (!schema) return null;
  if (typeof schema === "string") {
    try {
      return JSON.parse(schema);
    } catch {
      return null;
    }
  }
  return schema;
}

function cloneSchema<T>(schema: T): T {
  return structuredClone(schema);
}

function stripTopLevelReservedSchemaKeys(schema: any, reservedKeys: string[]): any | null {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const cloned = cloneSchema(schema);
  const properties =
    cloned &&
    typeof cloned === "object" &&
    cloned.properties &&
    typeof cloned.properties === "object"
      ? cloned.properties
      : undefined;

  if (!properties) {
    return cloned;
  }

  let removedAny = false;
  for (const key of reservedKeys) {
    if (key in properties) {
      delete properties[key];
      removedAny = true;
    }
  }

  if (!removedAny) {
    return cloned;
  }

  if (Array.isArray(cloned.required)) {
    const filteredRequired = cloned.required.filter(
      (field: string) => !reservedKeys.includes(field),
    );
    if (filteredRequired.length > 0) {
      cloned.required = filteredRequired;
    } else {
      delete cloned.required;
    }
  }

  if (Object.keys(properties).length === 0) {
    delete cloned.properties;
  }

  const remainingProperties =
    cloned.properties && typeof cloned.properties === "object"
      ? Object.keys(cloned.properties)
      : [];
  const hasCompositeSchema =
    (Array.isArray(cloned.allOf) && cloned.allOf.length > 0) ||
    (Array.isArray(cloned.anyOf) && cloned.anyOf.length > 0) ||
    (Array.isArray(cloned.oneOf) && cloned.oneOf.length > 0) ||
    Boolean(cloned.patternProperties) ||
    Boolean(cloned.additionalProperties);

  if (remainingProperties.length === 0 && !hasCompositeSchema) {
    return null;
  }

  return cloned;
}

export function getToolInputSchemaSections(schema: any): ParsedToolInputSchema {
  const parsed = tryParseSchema(schema);
  const parsedProperties =
    parsed && typeof parsed === "object" && parsed.properties ? parsed.properties : undefined;
  const topLevelKeys =
    parsedProperties && typeof parsedProperties === "object" ? Object.keys(parsedProperties) : [];
  const hasLegacyCredentialSections = Boolean(
    parsedProperties?.payload &&
    parsedProperties?.credentials &&
    topLevelKeys.every((key) => ["payload", "credentials"].includes(key)),
  );

  if (!parsed) {
    return {
      rawSchema: null,
      payloadSchema: null,
      filesSchema: null,
      credentialsSchema: null,
      hasNestedSections: false,
    };
  }

  if (hasLegacyCredentialSections) {
    return {
      rawSchema: parsed,
      payloadSchema: parsedProperties?.payload || null,
      filesSchema: null,
      credentialsSchema: parsedProperties?.credentials || null,
      hasNestedSections: true,
    };
  }

  return {
    rawSchema: parsed,
    payloadSchema: stripTopLevelReservedSchemaKeys(parsed, ["__files"]),
    filesSchema: parsedProperties?.__files || null,
    credentialsSchema: null,
    hasNestedSections: false,
  };
}

function schemaSectionHasRequiredFields(sectionSchema: any): boolean {
  return Boolean(
    sectionSchema &&
    typeof sectionSchema === "object" &&
    Array.isArray(sectionSchema.required) &&
    sectionSchema.required.length > 0,
  );
}

export function buildToolInputSchemaSections({
  payloadSchema,
  filesSchema,
}: {
  payloadSchema?: any | null;
  filesSchema?: any | null;
}): any | undefined {
  const hasFiles = Boolean(filesSchema);

  if (!hasFiles) {
    return payloadSchema || undefined;
  }

  const baseSchema =
    payloadSchema && typeof payloadSchema === "object"
      ? cloneSchema(payloadSchema)
      : { type: "object", properties: {} };
  const baseProperties =
    baseSchema.properties && typeof baseSchema.properties === "object"
      ? { ...baseSchema.properties }
      : {};

  baseProperties.__files = filesSchema;
  baseSchema.type = baseSchema.type || "object";
  baseSchema.properties = baseProperties;

  const required = Array.isArray(baseSchema.required)
    ? baseSchema.required.filter((field: string) => field !== "__files")
    : [];
  if (schemaSectionHasRequiredFields(filesSchema)) {
    required.push("__files");
  }

  if (required.length > 0) {
    baseSchema.required = Array.from(new Set(required));
  } else {
    delete baseSchema.required;
  }

  return baseSchema;
}

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
      // Use the system ID as the namespace
      // With composite key model, dev and prod systems share the same ID
      Object.entries(sys.credentials || {}).forEach(([key, value]) => {
        acc[`${sys.id}_${key}`] = value;
      });
      return acc;
    },
    {} as Record<string, string>,
  );
}

export function flattenAndNamespaceSystemUrls(systems: System[]): Record<string, string> {
  return systems.reduce(
    (acc, sys) => {
      // Use the system ID as the namespace
      // With composite key model, dev and prod systems share the same ID
      if (sys.url) {
        acc[`${sys.id}_url`] = sys.url;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "system";
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

const NON_SENSITIVE_CREDENTIAL_KEYS = new Set([
  "client_id",
  "auth_url",
  "token_url",
  "scopes",
  "grant_type",
  "redirect_uri",
  "audience",
  "host",
  "port",
  "database",
  "username",
  "region",
]);

export const isSensitiveCredentialKey = (key: string): boolean => {
  return !NON_SENSITIVE_CREDENTIAL_KEYS.has(key.toLowerCase().trim());
};

export const maskCredentialValue = (key: string, value: any): string => {
  if (value == null || value === "") return "";
  const strValue = String(value);
  if (!isSensitiveCredentialKey(key)) return strValue;
  if (strValue.length <= 4) return "****";
  return strValue.slice(0, 4) + "****";
};

export function isMaskedValue(value: any): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.startsWith("<<") && v.endsWith(">>")) return true;
  if (v.startsWith("{masked_") && v.endsWith("}")) return true;
  return false;
}

export function mergeCredentials(
  incoming: Record<string, any> | null | undefined,
  existing: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!incoming || Object.keys(incoming).length === 0) {
    return existing || {};
  }
  if (!existing || Object.keys(existing).length === 0) {
    return Object.fromEntries(
      Object.entries(incoming).filter(([_, v]) => !isMaskedValue(v) && v !== true),
    );
  }

  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (isMaskedValue(value)) continue;
    if (value === true) continue;
    merged[key] = value;
  }
  return merged;
}

export function maskCredentials(message: string, credentials?: Record<string, string>): string {
  if (!credentials) {
    return message;
  }
  let maskedMessage = message;
  const tokenMap: [string, string][] = [];
  let tokenIndex = 0;
  Object.entries(credentials)
    .sort(([, a], [, b]) => String(b).length - String(a).length)
    .forEach(([key, value]) => {
      const valueString = String(value);
      if (value && valueString) {
        const token = `\x00MASK_${tokenIndex++}\x00`;
        tokenMap.push([token, `{masked_${key}}`]);
        const regex = new RegExp(valueString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        maskedMessage = maskedMessage.replace(regex, token);
      }
    });
  for (const [token, masked] of tokenMap) {
    maskedMessage = maskedMessage.split(token).join(masked);
  }
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

export function safeStringify(value: any, indent: number = 2): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (key, val) => {
        // Handle circular references
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        // Handle BigInt
        if (typeof val === "bigint") return val.toString();
        // Handle functions
        if (typeof val === "function") return "[Function]";
        return val;
      },
      indent,
    );
  } catch (err) {
    // As a last resort, coerce to string
    return String(value ?? "");
  }
}

/**
 * Truncates a value for use in LLM prompts.
 * Uses sampleResultObject to intelligently sample large arrays/objects first,
 * then applies a hard character limit as a safety net.
 * Returns a string suitable for embedding in prompts.
 */
export function truncateForLLM(
  value: unknown,
  maxChars: number = 5000,
  sampleSize: number = 10,
): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string") {
    return value.length <= maxChars ? value : value.slice(0, maxChars) + "... [truncated]";
  }

  // Try full stringify first
  const fullStr = safeStringify(value);
  if (fullStr.length <= maxChars) return fullStr;

  // Sample if over limit
  const sampled = sampleResultObject(value, sampleSize);
  const sampledStr = safeStringify(sampled);
  if (sampledStr.length <= maxChars) return sampledStr;

  // Hard truncate as safety net
  return sampledStr.slice(0, maxChars) + "... [truncated]";
}

export function getDateMessage(): { role: "system"; content: string } {
  return {
    role: "system" as const,
    content: "The current date and time is " + new Date().toISOString(),
  };
}

// Icon utilities for handling both SimpleIcons and Lucide icons
// Format: "source:name" (e.g., "simpleicons:salesforce" or "lucide:database")
// For backwards compatibility, strings without prefix are assumed to be SimpleIcons

export type IconSource = "simpleicons" | "lucide";

export interface ParsedIcon {
  source: IconSource;
  name: string;
}

/**
 * Parse an icon string into its source and name components.
 * Supports formats:
 * - "simpleicons:salesforce" -> { source: "simpleicons", name: "salesforce" }
 * - "lucide:database" -> { source: "lucide", name: "database" }
 * - "salesforce" -> { source: "simpleicons", name: "salesforce" } (backwards compat)
 */
export function parseIconString(icon: string | null | undefined): ParsedIcon | null {
  if (!icon) return null;

  const colonIndex = icon.indexOf(":");
  if (colonIndex === -1) {
    // No prefix - assume SimpleIcons for backwards compatibility
    return { source: "simpleicons", name: icon };
  }

  const source = icon.substring(0, colonIndex) as IconSource;
  const name = icon.substring(colonIndex + 1);

  if (source !== "simpleicons" && source !== "lucide") {
    // Unknown source - fallback to treating the whole string as SimpleIcon name
    return { source: "simpleicons", name: icon };
  }

  return { source, name };
}

/**
 * Serialize an icon object into a storable string format.
 * @param icon - Object with name and source, or a simple string name
 * @returns Serialized icon string in "source:name" format
 */
export function serializeIcon(
  icon: { name: string; source: IconSource } | string | null | undefined,
): string | null {
  if (!icon) return null;

  if (typeof icon === "string") {
    // Already a string - check if it has a prefix
    const colonIndex = icon.indexOf(":");
    if (colonIndex !== -1) {
      return icon; // Already in correct format
    }
    // No prefix - add simpleicons prefix for consistency
    return `simpleicons:${icon}`;
  }

  // Object format from discovery
  return `${icon.source}:${icon.name}`;
}

export function normalizeToolDiff<T extends { op: string; path: string; value?: any }>(diff: T): T {
  if (diff.op === "remove" || diff.value === undefined || typeof diff.value !== "string") {
    return diff;
  }

  const shouldAlwaysBeObject =
    diff.path === "/inputSchema" ||
    diff.path === "/outputSchema" ||
    diff.path.startsWith("/inputSchema/properties/") ||
    diff.path.startsWith("/outputSchema/properties/") ||
    diff.path.match(/^\/steps\/\d+\/config\/pagination$/) ||
    diff.path.match(/^\/steps\/\d+\/config\/headers$/) ||
    diff.path.match(/^\/steps\/\d+\/config\/queryParams$/);

  if (shouldAlwaysBeObject) {
    try {
      return { ...diff, value: JSON.parse(diff.value) };
    } catch {
      return diff;
    }
  }

  return diff;
}

export function normalizeToolDiffs<T extends { op: string; path: string; value?: any }>(
  diffs: T[],
): T[] {
  return diffs.map((diff) => normalizeToolDiff(diff));
}

export function composeUrl(host: string, path: string) {
  // Handle empty/undefined inputs
  if (!host) host = "";
  if (!path) path = "";

  // Add https:// if protocol is missing
  if (!/^(https?|postgres(ql)?|ftp(s)?|sftp|smb|file):\/\//i.test(host)) {
    host = `https://${host}`;
  }

  // Trim slashes in one pass
  const cleanHost = host.endsWith("/") ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

// ============================================================================
// System Auth Status
// ============================================================================

export type SystemAuthType = "none" | "oauth" | "apikey" | "connection_string";

export interface SystemAuthStatus {
  authType: SystemAuthType;
  isComplete: boolean;
  label: string;
}

export interface ConnectionFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "number";
  required?: boolean;
  defaultValue?: string;
}

/**
 * Detect the authentication type from system credentials
 */
export const detectSystemAuthType = (
  credentials: Record<string, any> | undefined,
  options?: { url?: string; templateName?: string },
): SystemAuthType => {
  if (!credentials || Object.keys(credentials).length === 0) return "none";

  const oauthFields = [
    "auth_url",
    "token_url",
    "client_id",
    "client_secret",
    "access_token",
    "refresh_token",
  ];
  const hasOAuthFields = oauthFields.some((field) => field in credentials);

  if (hasOAuthFields) return "oauth";

  if (options?.url || options?.templateName) {
    const isConnectionStringProtocol =
      options.url?.match(/^(postgres|postgresql|redis|rediss|sftp|ftp|ftps|sqlserver):\/\//) ||
      options.templateName?.match(/^(postgres|redis_direct|azure_sql)$/);
    if (isConnectionStringProtocol) return "connection_string";
  }

  const connectionStringKeys = ["host", "hostname", "port", "database", "username"];
  const matchingKeys = connectionStringKeys.filter((k) => k in credentials);
  if (matchingKeys.length >= 2 && ("host" in credentials || "hostname" in credentials))
    return "connection_string";

  return "apikey";
};

/**
 * Get the authentication status for a system.
 * Handles both normal mode and multi-tenancy mode.
 */
export const getSystemAuthStatus = (system: {
  credentials?: Record<string, any>;
  multiTenancyMode?: string;
  url?: string;
  templateName?: string;
}): SystemAuthStatus => {
  const creds = system.credentials || {};
  const authType = detectSystemAuthType(creds, {
    url: system.url,
    templateName: system.templateName,
  });
  const isMultiTenancy = system.multiTenancyMode === "enabled";

  if (authType === "none") {
    return { authType: "none", isComplete: true, label: "No auth" };
  }

  if (authType === "connection_string") {
    const hasHost = Boolean(creds.host || creds.hostname);
    const hasAuth = Boolean(creds.username || creds.password);
    const isComplete = hasHost && hasAuth;
    if (isMultiTenancy) {
      return {
        authType: "connection_string",
        isComplete: hasHost,
        label: hasHost ? "Ready for end users" : "Connection fields incomplete",
      };
    }
    return {
      authType: "connection_string",
      isComplete,
      label: isComplete ? "Connected" : "Connection incomplete",
    };
  }

  if (authType === "oauth") {
    if (isMultiTenancy) {
      const hasAuthUrl = Boolean(creds.auth_url);
      const hasTokenUrl = Boolean(creds.token_url);
      const hasClientId = Boolean(creds.client_id);
      const isComplete = hasAuthUrl && hasTokenUrl && hasClientId;
      return {
        authType: "oauth",
        isComplete,
        label: isComplete ? "Ready for end users" : "OAuth template incomplete",
      };
    }

    const grantType = creds.grant_type || "authorization_code";
    const hasAccessToken = Boolean(creds.access_token);
    const hasRefreshToken = Boolean(creds.refresh_token);
    const isComplete =
      grantType === "client_credentials" ? hasAccessToken : hasAccessToken && hasRefreshToken;

    return {
      authType: "oauth",
      isComplete,
      label: isComplete ? "OAuth configured" : "OAuth incomplete",
    };
  }

  // API Key mode
  const hasKeys = Object.keys(creds).length > 0;
  if (isMultiTenancy) {
    return {
      authType: "apikey",
      isComplete: hasKeys,
      label: hasKeys ? "Ready for end users" : "No credential fields",
    };
  }

  return {
    authType: "apikey",
    isComplete: hasKeys,
    label: hasKeys ? "API Key configured" : "No credentials",
  };
};

export const ALLOWED_PATCH_SYSTEM_FIELDS: (keyof PatchSystemBody)[] = [
  "name",
  "url",
  "specificInstructions",
  "icon",
  "credentials",
  "metadata",
  "templateName",
  "multiTenancyMode",
  "documentationFiles",
  "tunnel",
  // Note: "environment" is NOT patchable because it's part of the composite primary key
];

/**
 * Truncate large data fields in a run result for display purposes.
 * Only truncates specific "sampleable" fields to preserve metadata.
 * Uses truncate-json library for safe JSON truncation that preserves structure.
 */
const SAMPLEABLE_KEYS = new Set([
  "data",
  "stepResults",
  "toolPayload",
  "rawData",
  "transformedData",
]);
const DEFAULT_MAX_LENGTH = 80000;

export function truncateRunResult(
  result: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): unknown {
  if (result === null || result === undefined) return result;

  // Handle string input - try to parse as JSON
  let data = result;
  if (typeof result === "string") {
    if (result.length <= maxLength) return result;

    try {
      data = JSON.parse(result);
    } catch {
      // Can't parse - return a safe summary
      return {
        _truncated: true,
        _message: "String result too large to parse",
        _size: result.length,
      };
    }
  }

  if (typeof data !== "object") return data;

  // Track truncation stats
  let truncatedCount = 0;
  let originalSize = 0;

  // Recursively find and truncate only sampleable keys
  const truncateSampleableFields = (value: any, depth: number = 0): any => {
    if (depth > 20) return value;
    if (value === null || typeof value !== "object") return value;

    if (Array.isArray(value)) {
      return value.map((item) => truncateSampleableFields(item, depth + 1));
    }

    const obj: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SAMPLEABLE_KEYS.has(key) && val !== null && typeof val === "object") {
        // This is a sampleable key - truncate its value using the library
        const valString = JSON.stringify(val);
        if (valString.length > maxLength) {
          originalSize += valString.length;
          try {
            const { jsonString: truncated, truncatedProps } = truncateJsonLib(valString, maxLength);
            obj[key] = JSON.parse(truncated);
            truncatedCount += truncatedProps.length;
          } catch {
            obj[key] = val;
          }
        } else {
          obj[key] = val;
        }
      } else {
        // Not a sampleable key - recurse to find nested sampleable keys
        obj[key] = truncateSampleableFields(val, depth + 1);
      }
    }
    return obj;
  };

  try {
    const fullString = JSON.stringify(data);
    if (fullString.length <= maxLength) return data;

    const truncated = truncateSampleableFields(data);
    if (truncatedCount > 0 && typeof truncated === "object" && truncated !== null) {
      (truncated as any)._note =
        `Result truncated: ${truncatedCount} items omitted (original ${originalSize} characters)`;
    }
    return truncated;
  } catch {
    return {
      _truncated: true,
      _message: "Result too large to display",
    };
  }
}

export function getToolSystemIds(tool: Tool): string[] {
  if (!tool.steps) return [];
  const ids = new Set<string>();
  for (const step of tool.steps) {
    if (
      step.config &&
      isRequestConfig(step.config) &&
      (step.config as RequestStepConfig).systemId
    ) {
      ids.add((step.config as RequestStepConfig).systemId!);
    }
  }
  return Array.from(ids);
}

export function isProductionSystem(system: System): boolean {
  return system.environment !== "dev";
}
