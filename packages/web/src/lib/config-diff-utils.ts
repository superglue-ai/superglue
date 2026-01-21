import { Tool, ToolDiff } from "@superglue/shared";
import * as jsonpatch from "fast-json-patch";

// Types
export type DiffTargetType =
  | "step"
  | "newStep"
  | "finalTransform"
  | "inputSchema"
  | "responseSchema"
  | "instruction"
  | "toolInput"
  | "responseFilters"
  | "folder"
  | "name"
  | "id"
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

// Internal helpers
const stringify = (v: any): string =>
  v === undefined
    ? ""
    : v === null
      ? "null"
      : typeof v === "string"
        ? v
        : JSON.stringify(v, null, 2);

const TOP_LEVEL_TARGETS: Record<string, DiffTargetType> = {
  finalTransform: "finalTransform",
  outputTransform: "finalTransform", // OpenAPI alias
  inputSchema: "inputSchema",
  responseSchema: "responseSchema",
  outputSchema: "responseSchema", // OpenAPI alias
  instruction: "instruction",
  responseFilters: "responseFilters",
  folder: "folder",
  name: "name",
  id: "id",
};

const TARGET_LABELS: Record<DiffTargetType, string> = {
  step: "",
  newStep: "New Step",
  finalTransform: "Final Transform",
  inputSchema: "Input Schema",
  responseSchema: "Response Schema",
  instruction: "Instruction",
  toolInput: "Tool Input",
  responseFilters: "Response Filters",
  folder: "Folder",
  name: "Name",
  id: "ID",
  unknown: "Unknown",
};

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
  if (op === "remove") return oldLines.map((content) => ({ type: "removed" as const, content }));
  if (op === "add") return newLines.map((content) => ({ type: "added" as const, content }));

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

  return diffs.map((diff) => {
    const target = parsePathToTarget(diff.path);
    const oldValue = originalConfig ? getValueAtPath(originalConfig, diff.path) : undefined;

    // Determine context path
    const stepApiMatch = diff.path.match(/^(\/steps\/\d+\/apiConfig)(\/.*)?$/);
    const stepMatch = diff.path.match(/^(\/steps\/\d+)(\/.*)?$/);
    const topMatch = diff.path.match(
      /^(\/(?:finalTransform|outputTransform|inputSchema|responseSchema|outputSchema|instruction|responseFilters|folder|name|id))(\/.*)?$/,
    );

    let contextPath: string;
    if (stepApiMatch) {
      contextPath = stepApiMatch[1];
    } else if (stepMatch) {
      // For OpenAPI format, no apiConfig wrapper - use step path directly
      const stepPath = stepMatch[1];
      const hasApiConfig = originalConfig
        ? getValueAtPath(originalConfig, stepPath + "/apiConfig") !== undefined
        : false;
      contextPath = hasApiConfig ? stepPath + "/apiConfig" : stepPath;
    } else if (topMatch) {
      contextPath = topMatch[1];
    } else {
      contextPath = diff.path;
    }

    const contextOldObj = originalConfig ? getValueAtPath(originalConfig, contextPath) : undefined;

    // Apply diff to get new context
    let contextNewObj = contextOldObj;
    if (contextOldObj !== undefined && diff.value !== undefined) {
      const relativePath = diff.path.replace(contextPath, "") || "/";
      const result = JSON.parse(JSON.stringify(contextOldObj));
      const parts = relativePath.split("/").filter(Boolean);
      if (parts.length === 0) {
        contextNewObj = diff.op === "remove" ? undefined : diff.value;
      } else {
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] === undefined) current[parts[i]] = {};
          current = current[parts[i]];
        }
        const lastKey = parts[parts.length - 1];
        if (diff.op === "remove") delete current[lastKey];
        else current[lastKey] = diff.value;
        contextNewObj = result;
      }
    } else if (diff.value !== undefined) {
      contextNewObj = diff.value;
    }

    // Enrich step targets
    if (
      target.type === "step" &&
      target.stepIndex !== undefined &&
      originalConfig?.steps?.[target.stepIndex]
    ) {
      const step = originalConfig.steps[target.stepIndex];
      target.stepId = step.id;
      target.systemId = step.systemId;
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
  const result = jsonpatch.applyPatch(configCopy, diffs as jsonpatch.Operation[], true, true);
  return result.newDocument || configCopy;
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
