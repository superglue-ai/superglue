import { Tool, ToolDiff, normalizeToolSchemas, normalizeToolDiffs } from "@superglue/shared";
import * as jsonpatch from "fast-json-patch";

// Types
export type DiffTargetType =
  | "step"
  | "newStep"
  | "outputTransform"
  | "inputSchema"
  | "outputSchema"
  | "instruction"
  | "toolInput"
  | "responseFilters"
  | "folder"
  | "name"
  | "id"
  | "archived"
  | "unknown";

export interface DiffTarget {
  type: DiffTargetType;
  stepId?: string;
  stepIndex?: number;
  detail?: string;
  systemId?: string;
}

export interface DiffLine {
  type: "context" | "removed" | "added";
  content: string;
  lineNumber?: number;
}

export interface EnrichedDiff {
  diff: ToolDiff;
  target: DiffTarget;
  oldValue: any;
  newValue: any;
  lines: DiffLine[];
  contextOld?: string;
  contextNew?: string;
}

// ============================================================================
// Normalization utilities for consistent diff comparison
// ============================================================================

// Try to parse stringified JSON, return original if not valid JSON
function tryParseJson(val: any): any {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
}

// Normalize a function/arrow function string by removing formatting differences
function normalizeFunction(str: string): string {
  if (typeof str !== "string") return str;
  // Check if it looks like a function
  if (!str.includes("=>") && !str.startsWith("function")) return str;
  // Remove all whitespace and normalize
  return str
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/\s*([{}(),:;=>\[\]])\s*/g, "$1") // remove space around punctuation
    .replace(/,}/g, "}") // remove trailing commas
    .trim();
}

// Check if a value is empty (null, undefined, empty array, empty object)
function isEmptyValue(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "object" && Object.keys(v).length === 0) return true;
  return false;
}

// Recursively normalize an object: parse stringified JSON, normalize functions, sort keys
function deepNormalize(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // Try to parse if it's a stringified JSON
  const parsed = tryParseJson(obj);

  if (Array.isArray(parsed)) {
    return parsed.map(deepNormalize);
  }

  if (typeof parsed === "object") {
    const result: any = {};
    for (const key of Object.keys(parsed).sort()) {
      result[key] = deepNormalize(parsed[key]);
    }
    return result;
  }

  // Normalize function strings
  if (typeof parsed === "string") {
    return normalizeFunction(parsed);
  }

  return parsed;
}

const isEmptySchema = (v: any) => !v || (typeof v === "object" && Object.keys(v).length === 0);

/**
 * Normalize a tool for comparison by:
 * 1. Stripping metadata fields (createdAt, updatedAt, etc.)
 * 2. Removing empty schemas and empty arrays (like responseFilters: [])
 * 3. Parsing stringified JSON fields (like body)
 * 4. Normalizing function strings to ignore formatting differences
 * 5. Sorting object keys for consistent comparison
 */
export function normalizeToolForComparison(tool: Tool | any): any {
  const { createdAt, updatedAt, name, id, folder, archived, systemIds, ...rest } = tool;
  if (isEmptySchema(rest.outputSchema)) delete rest.outputSchema;
  if (isEmptySchema(rest.inputSchema)) delete rest.inputSchema;
  // Treat empty responseFilters as non-existent
  if (isEmptyValue(rest.responseFilters)) delete rest.responseFilters;
  return deepNormalize(rest);
}

/**
 * Compute enriched diffs between two tool configurations.
 * This is the main entry point for diff calculation - use this instead of
 * calling jsonpatch.compare and enrichDiffsWithTargets separately.
 *
 * @param baseTool - The original/saved tool configuration
 * @param currentTool - The current/modified tool configuration
 * @returns Array of enriched diffs ready for display
 */
export function computeToolDiffs(baseTool: Tool, currentTool: Tool): EnrichedDiff[] {
  const baseNorm = normalizeToolForComparison(normalizeToolSchemas(baseTool));
  const currentNorm = normalizeToolForComparison(normalizeToolSchemas(currentTool));
  const diffs = jsonpatch.compare(baseNorm, currentNorm) as ToolDiff[];
  // Pass normalized base tool so enrichDiffsWithTargets can traverse into parsed JSON fields
  const enriched = enrichDiffsWithTargets(diffs, baseNorm as Tool);
  return enriched.filter((d) => d.lines.length > 0);
}

// ============================================================================
// Internal helpers
// ============================================================================
const stringify = (v: any): string =>
  v === undefined
    ? ""
    : v === null
      ? "null"
      : typeof v === "string"
        ? v
        : JSON.stringify(v, null, 2);

const TOP_LEVEL_TARGETS: Record<string, DiffTargetType> = {
  outputTransform: "outputTransform",
  inputSchema: "inputSchema",
  outputSchema: "outputSchema",
  instruction: "instruction",
  responseFilters: "responseFilters",
  folder: "folder",
  name: "name",
  id: "id",
  archived: "archived",
};

const TARGET_LABELS: Record<DiffTargetType, string> = {
  step: "",
  newStep: "New Step",
  outputTransform: "Output Transform",
  inputSchema: "Input Schema",
  outputSchema: "Output Schema",
  instruction: "Instruction",
  toolInput: "Tool Input",
  responseFilters: "Response Filters",
  folder: "Folder",
  name: "Name",
  id: "ID",
  unknown: "Unknown",
  archived: "Archived",
};

const HIDDEN_DIFF_TARGETS: Set<DiffTargetType> = new Set(["archived"]);

// Exported functions
export function getValueAtPath(obj: any, path: string): any {
  if (!path || path === "/") return obj;
  const parts = path.split("/").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const idx = parseInt(part, 10);
    if (Array.isArray(current) && !isNaN(idx)) current = current[idx];
    else if (part === "-" && Array.isArray(current)) return undefined;
    else current = current[part];
  }
  return current;
}

export function parsePathToTarget(path: string): DiffTarget {
  if (!path) return { type: "unknown" };

  const stepMatch = path.match(/^\/steps\/(\d+|-)(.*)$/);
  if (stepMatch) {
    const [, idx, subPath] = stepMatch;
    if (idx === "-") return { type: "newStep", detail: subPath.replace(/^\//, "") || undefined };

    let detail: string | undefined;
    if (subPath.startsWith("/apiConfig")) {
      detail = subPath.replace("/apiConfig", "").replace(/^\//, "") || "apiConfig";
    } else if (subPath.startsWith("/config")) {
      detail = subPath.replace("/config", "").replace(/^\//, "") || "config";
    } else if (subPath) {
      detail = subPath.replace(/^\//, "");
    }
    return { type: "step", stepIndex: parseInt(idx, 10), detail };
  }

  const topLevel = path.split("/")[1];
  if (topLevel && TOP_LEVEL_TARGETS[topLevel]) return { type: TOP_LEVEL_TARGETS[topLevel] };
  return { type: "unknown" };
}

export function buildUnifiedDiff(oldValue: any, newValue: any, op: string): DiffLine[] {
  const oldStr = stringify(oldValue);
  const newStr = stringify(newValue);
  const oldLines = oldStr === "" ? [] : oldStr.split("\n");
  const newLines = newStr === "" ? [] : newStr.split("\n");

  if (oldLines.length === 0 && newLines.length === 0) return [];

  if (op === "remove" && oldLines.length > 0 && newLines.length > 0) {
  } else if (op === "remove") {
    return oldLines.map((content) => ({ type: "removed" as const, content }));
  }

  if (op === "add" && oldLines.length > 0 && newLines.length > 0) {
  } else if (op === "add") {
    return newLines.map((content) => ({ type: "added" as const, content }));
  }

  // Find common prefix
  let commonPrefix = 0;
  while (
    commonPrefix < oldLines.length &&
    commonPrefix < newLines.length &&
    oldLines[commonPrefix] === newLines[commonPrefix]
  ) {
    commonPrefix++;
  }

  // Find common suffix
  let commonSuffix = 0;
  while (
    commonSuffix < oldLines.length - commonPrefix &&
    commonSuffix < newLines.length - commonPrefix &&
    oldLines[oldLines.length - 1 - commonSuffix] === newLines[newLines.length - 1 - commonSuffix]
  ) {
    commonSuffix++;
  }

  const lines: DiffLine[] = [];

  // Context from prefix (up to 2 lines)
  for (let i = Math.max(0, commonPrefix - 2); i < commonPrefix; i++) {
    lines.push({ type: "context", content: oldLines[i] });
  }

  // Removed lines
  for (let i = commonPrefix; i < oldLines.length - commonSuffix; i++) {
    lines.push({ type: "removed", content: oldLines[i] });
  }

  // Added lines
  for (let i = commonPrefix; i < newLines.length - commonSuffix; i++) {
    lines.push({ type: "added", content: newLines[i] });
  }

  // Context from suffix (up to 2 lines)
  for (let i = 0; i < Math.min(commonSuffix, 2); i++) {
    const idx = newLines.length - commonSuffix + i;
    if (idx < newLines.length) lines.push({ type: "context", content: newLines[idx] });
  }

  // Fallback if no changes detected but values differ
  if (lines.length === 0 && oldStr !== newStr) {
    oldLines.forEach((content) => lines.push({ type: "removed", content }));
    newLines.forEach((content) => lines.push({ type: "added", content }));
  }

  return lines;
}

export function enrichDiffsWithTargets(diffs: ToolDiff[], originalConfig?: Tool): EnrichedDiff[] {
  if (!diffs?.length) return [];

  const filteredDiffs = diffs.filter((d) => {
    const target = parsePathToTarget(d.path);
    return !HIDDEN_DIFF_TARGETS.has(target.type);
  });

  const normalizedConfig = originalConfig ? normalizeToolSchemas(originalConfig) : undefined;

  return filteredDiffs.map((diff) => {
    const target = parsePathToTarget(diff.path);
    const oldValue = normalizedConfig ? getValueAtPath(normalizedConfig, diff.path) : undefined;

    // Determine context path
    const stepConfigMatch = diff.path.match(/^(\/steps\/\d+\/config)(\/.*)?$/);
    const stepMatch = diff.path.match(/^(\/steps\/\d+)(\/.*)?$/);
    const topMatch = diff.path.match(
      /^(\/(?:outputTransform|inputSchema|outputSchema|instruction|responseFilters|folder|name|id))(\/.*)?$/,
    );

    let contextPath: string;
    if (stepConfigMatch) {
      contextPath = stepConfigMatch[1];
    } else if (stepMatch) {
      // For OpenAPI format, no apiConfig wrapper - use step path directly
      const stepPath = stepMatch[1];
      const subPath = stepMatch[2] || "";
      // If removing/adding an entire step (no subpath), use the step path directly
      if (!subPath && (diff.op === "remove" || diff.op === "add")) {
        contextPath = stepPath;
      } else if (subPath.startsWith("/apiConfig")) {
        contextPath = stepPath + "/apiConfig";
      } else if (subPath.startsWith("/config")) {
        contextPath = stepPath + "/config";
      } else {
        contextPath = stepPath;
      }
    } else if (topMatch) {
      contextPath = topMatch[1];
    } else {
      contextPath = diff.path;
    }

    const contextOldObj = normalizedConfig
      ? getValueAtPath(normalizedConfig, contextPath)
      : undefined;

    // Apply diff to get new context
    let contextNewObj = contextOldObj;
    if (diff.op === "remove" && contextOldObj !== undefined) {
      // For remove operations, determine what the new value should be
      const relativePath = diff.path.replace(contextPath, "") || "/";
      const parts = relativePath.split("/").filter(Boolean);
      if (parts.length === 0) {
        // Removing the entire context object (e.g., removing a whole step)
        contextNewObj = undefined;
      } else {
        // Removing a property within the context object
        let result = JSON.parse(JSON.stringify(contextOldObj));
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] === undefined || current[parts[i]] === null) {
            break;
          }
          current = current[parts[i]];
        }
        const lastKey = parts[parts.length - 1];
        // Use splice for array indices to properly shift elements (JSON Patch remove semantics)
        // Using delete would leave a hole that serializes to null
        if (Array.isArray(current) && /^\d+$/.test(lastKey)) {
          current.splice(parseInt(lastKey, 10), 1);
        } else {
          delete current[lastKey];
        }
        contextNewObj = result;
      }
    } else if (contextOldObj !== undefined && diff.value !== undefined) {
      const relativePath = diff.path.replace(contextPath, "") || "/";
      let result = contextOldObj === null ? {} : JSON.parse(JSON.stringify(contextOldObj));
      const parts = relativePath.split("/").filter(Boolean);
      if (parts.length === 0) {
        contextNewObj = diff.op === "remove" ? undefined : diff.value;
      } else {
        let current = result;
        let traversalFailed = false;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] === undefined || current[parts[i]] === null) {
            current[parts[i]] = {};
          }
          const next = current[parts[i]];
          // Guard against traversing into a string or primitive
          if (typeof next !== "object" || next === null) {
            traversalFailed = true;
            break;
          }
          current = next;
        }
        if (!traversalFailed) {
          const lastKey = parts[parts.length - 1];
          if (diff.op === "remove") {
            // Use splice for array indices to properly shift elements (JSON Patch remove semantics)
            if (Array.isArray(current) && /^\d+$/.test(lastKey)) {
              current.splice(parseInt(lastKey, 10), 1);
            } else {
              delete current[lastKey];
            }
          } else {
            current[lastKey] = diff.value;
          }
          contextNewObj = result;
        } else {
          // Fallback: just use the diff value directly
          contextNewObj = diff.value;
        }
      }
    } else if (diff.value !== undefined) {
      contextNewObj = diff.value;
    }

    // Enrich step targets
    if (
      target.type === "step" &&
      target.stepIndex !== undefined &&
      normalizedConfig?.steps?.[target.stepIndex]
    ) {
      const step = normalizedConfig.steps[target.stepIndex];
      target.stepId = step.id;
      // systemId is now on step.config for request steps
      if (step.config && "systemId" in step.config) {
        target.systemId = step.config.systemId;
      }
    }

    return {
      diff,
      target,
      oldValue,
      newValue: diff.value,
      lines: buildUnifiedDiff(contextOldObj, contextNewObj, diff.op),
      contextOld: stringify(contextOldObj),
      contextNew: stringify(contextNewObj),
    };
  });
}

export function getEarliestAffectedStepIndex(enrichedDiffs: EnrichedDiff[]): number | null {
  let earliest: number | null = null;
  for (const ed of enrichedDiffs) {
    if (
      (ed.target.type === "step" || ed.target.type === "newStep") &&
      ed.target.stepIndex !== undefined &&
      ed.target.stepIndex >= 0
    ) {
      if (earliest === null || ed.target.stepIndex < earliest) earliest = ed.target.stepIndex;
    }
  }
  return earliest;
}

export function applyDiffsToConfig(config: Tool, diffs: ToolDiff[]): Tool {
  if (!diffs?.length) return config;
  const configCopy = JSON.parse(JSON.stringify(config));

  const normalizedConfig = normalizeToolSchemas(configCopy);
  const normalizedDiffs = normalizeToolDiffs(diffs);

  const result = jsonpatch.applyPatch(
    normalizedConfig,
    normalizedDiffs as jsonpatch.Operation[],
    true,
    true,
  );
  return result.newDocument || normalizedConfig;
}

export function formatTargetLabel(target: DiffTarget) {
  return {
    type: target.type,
    stepNumber: target.type === "step" ? (target.stepIndex ?? 0) + 1 : undefined,
    stepId: target.stepId,
    systemId: target.systemId,
    path: target.detail,
    label:
      target.type === "step"
        ? target.stepId || `Step ${(target.stepIndex ?? 0) + 1}`
        : TARGET_LABELS[target.type],
  };
}
