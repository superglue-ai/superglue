import { Tool, System, getToolSystemIds, isSensitiveCredentialKey } from "@superglue/shared";

export const CURRENT_EXPORT_VERSION = "2";
export const SUPPORTED_VERSIONS = ["1", "2"] as const;
export type SupportedVersion = (typeof SUPPORTED_VERSIONS)[number];

export interface ToolExportData {
  version: string;
  exportedAt: string;
  tools: ExportedTool[];
  systems: ExportedSystem[];
}

export type ExportedTool = Pick<
  Tool,
  | "id"
  | "name"
  | "steps"
  | "inputSchema"
  | "outputSchema"
  | "instruction"
  | "folder"
  | "outputTransform"
  | "responseFilters"
>;

export type ExportedSystem = Pick<
  System,
  | "id"
  | "name"
  | "url"
  | "credentials"
  | "specificInstructions"
  | "icon"
  | "metadata"
  | "templateName"
  | "environment"
>;

export type ConflictResolution = "skip" | "overwrite" | "rename";

export interface ImportToolItem {
  tool: ExportedTool;
  selected: boolean;
  conflict: boolean;
  existingTool?: Tool;
  resolution: ConflictResolution;
  newId?: string;
}

export interface ImportSystemItem {
  system: ExportedSystem;
  selected: boolean;
  conflict: boolean;
  existingSystem?: System;
  resolution: ConflictResolution;
  newId?: string;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  tools: ImportToolItem[];
  systems: ImportSystemItem[];
}

export function createExportData({
  tools,
  systems,
}: {
  tools: Tool[];
  systems: System[];
}): ToolExportData {
  const exportedTools: ExportedTool[] = tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    steps: tool.steps,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    instruction: tool.instruction,
    folder: tool.folder,
    outputTransform: tool.outputTransform,
    responseFilters: tool.responseFilters,
  }));

  const exportedSystems: ExportedSystem[] = systems.map((system) => ({
    id: system.id,
    name: system.name,
    url: system.url,
    credentials: system.credentials,
    specificInstructions: system.specificInstructions,
    icon: system.icon,
    metadata: system.metadata,
    templateName: system.templateName,
    environment: system.environment,
  }));

  return {
    version: CURRENT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    tools: exportedTools,
    systems: exportedSystems,
  };
}

export function getSystemsForTool(tool: Tool, allSystems: System[]): System[] {
  const systemIds = getToolSystemIds(tool);
  return allSystems.filter((s) => systemIds.includes(s.id));
}

export function getSensitiveCredentialFields(system: System): string[] {
  if (!system.credentials) return [];
  return Object.keys(system.credentials).filter((key) => isSensitiveCredentialKey(key));
}

export function hasSensitiveCredentials(systems: System[]): boolean {
  return systems.some((s) => getSensitiveCredentialFields(s).length > 0);
}

export function downloadJson(data: ToolExportData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: false, view: window }));
  URL.revokeObjectURL(url);
}

export function validateImportData(
  data: unknown,
  existingTools: Tool[],
  existingSystems: System[],
): ImportValidationResult {
  const errors: string[] = [];
  const tools: ImportToolItem[] = [];
  const systems: ImportSystemItem[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Invalid JSON structure"], tools, systems };
  }

  const obj = data as Record<string, unknown>;

  if (!obj.version || typeof obj.version !== "string") {
    return { valid: false, errors: ["Missing or invalid version field"], tools, systems };
  }

  const version = obj.version;
  if (!SUPPORTED_VERSIONS.includes(version as SupportedVersion)) {
    return {
      valid: false,
      errors: [
        `Unsupported version "${version}". Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`,
      ],
      tools,
      systems,
    };
  }

  return parseV1(obj, existingTools, existingSystems);
}

function parseV1(
  obj: Record<string, unknown>,
  existingTools: Tool[],
  existingSystems: System[],
): ImportValidationResult {
  const errors: string[] = [];
  const tools: ImportToolItem[] = [];
  const systems: ImportSystemItem[] = [];

  if (!obj.tools || !Array.isArray(obj.tools)) {
    errors.push("Missing or invalid tools array");
  } else {
    for (let i = 0; i < obj.tools.length; i++) {
      const tool = obj.tools[i];
      const toolErrors = validateTool(tool, i);
      if (toolErrors.length > 0) {
        errors.push(...toolErrors);
      } else {
        const existingTool = existingTools.find((t) => t.id === tool.id);
        tools.push({
          tool: tool as ExportedTool,
          selected: true,
          conflict: !!existingTool,
          existingTool,
          resolution: existingTool ? "skip" : "overwrite",
        });
      }
    }
  }

  if (obj.systems !== undefined && !Array.isArray(obj.systems)) {
    errors.push("Invalid systems field: expected an array");
  } else if (obj.systems && Array.isArray(obj.systems)) {
    for (let i = 0; i < obj.systems.length; i++) {
      const system = obj.systems[i];
      const systemErrors = validateSystem(system, i);
      if (systemErrors.length > 0) {
        errors.push(...systemErrors);
      } else {
        // For v2+, check both id AND environment for conflicts
        // For v1 imports (no environment), treat as prod and check against prod systems
        const importEnv = (system as ExportedSystem).environment || "prod";
        const existingSystem = existingSystems.find(
          (s) => s.id === system.id && (s.environment || "prod") === importEnv,
        );
        systems.push({
          system: system as ExportedSystem,
          selected: true,
          conflict: !!existingSystem,
          existingSystem,
          resolution: existingSystem ? "skip" : "overwrite",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    tools,
    systems,
  };
}

function validateTool(tool: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `Tool[${index}]`;

  if (!tool || typeof tool !== "object") {
    return [`${prefix}: Invalid tool object`];
  }

  const t = tool as Record<string, unknown>;

  if (!t.id || typeof t.id !== "string") {
    errors.push(`${prefix}: Missing or invalid id`);
  }

  if (!t.steps || !Array.isArray(t.steps)) {
    errors.push(`${prefix}: Missing or invalid steps array`);
  }

  return errors;
}

function validateSystem(system: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `System[${index}]`;

  if (!system || typeof system !== "object") {
    return [`${prefix}: Invalid system object`];
  }

  const s = system as Record<string, unknown>;

  if (!s.id || typeof s.id !== "string") {
    errors.push(`${prefix}: Missing or invalid id`);
  }

  return errors;
}

export function generateUniqueId(baseId: string, existingIds: string[]): string {
  let counter = 1;
  let newId = `${baseId}-${counter}`;
  while (existingIds.includes(newId)) {
    counter++;
    newId = `${baseId}-${counter}`;
  }
  return newId;
}

/**
 * Generate a unique system ID considering environment.
 * Systems with the same ID but different environments are allowed.
 */
export function generateUniqueSystemId(
  baseId: string,
  environment: "dev" | "prod" | undefined,
  existingSystems: System[],
): string {
  const env = environment || "prod";
  // Check if this exact id+env combo exists
  const existsWithEnv = (id: string) =>
    existingSystems.some((s) => s.id === id && (s.environment || "prod") === env);

  if (!existsWithEnv(baseId)) {
    return baseId;
  }

  let counter = 1;
  let newId = `${baseId}-${counter}`;
  while (existsWithEnv(newId)) {
    counter++;
    newId = `${baseId}-${counter}`;
  }
  return newId;
}
