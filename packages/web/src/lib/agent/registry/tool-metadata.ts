import { AgentType } from "./agents";
import {
  AGENT_TOOL_SET,
  TOOL_PLAYGROUND_TOOL_SET,
  SYSTEM_PLAYGROUND_TOOL_SET,
} from "./tool-definitions";
import { TOOL_POLICIES } from "./tool-policies";

export type ToolCategory = "building" | "systems" | "context" | "execution" | "other";

export interface ToolMeta {
  displayName: string;
  summary: string;
  category: ToolCategory;
}

export const TOOL_METADATA: Record<string, ToolMeta> = {
  build_tool: {
    displayName: "Build Tool",
    summary: "Creates a new superglue tool from natural language instructions",
    category: "building",
  },
  run_tool: {
    displayName: "Run Tool",
    summary:
      "Executes a superglue tool via tool id or draft id with an optional payload and returns results",
    category: "execution",
  },
  edit_tool: {
    displayName: "Edit Tool",
    summary:
      "Modifies an existing superglue tool's steps, transforms, or schemas based on edit instructions",
    category: "building",
  },
  save_tool: {
    displayName: "Save Tool",
    summary:
      "Saves a draft superglue tool so it can be viewed and executed via other interfaces and the SDK",
    category: "building",
  },
  create_system: {
    displayName: "Create System",
    summary: "Registers a new superglue system with URL, auth, and docs",
    category: "systems",
  },
  edit_system: {
    displayName: "Edit System",
    summary: "Updates an existing superglue system's configuration or credentials",
    category: "systems",
  },
  call_system: {
    displayName: "Call System",
    summary:
      "Used to test API endpoints, database queries of file server operations. Can reference file data and system credentials",
    category: "execution",
  },
  search_documentation: {
    displayName: "Search Docs",
    summary: "Searches through system documentation using keywords",
    category: "context",
  },
  authenticate_oauth: {
    displayName: "Authenticate OAuth",
    summary: "Initiates an OAuth flow to obtain access tokens for a system",
    category: "systems",
  },
  get_runs: {
    displayName: "Get Runs",
    summary: "Retrieves recent tool run results by tool id with optional filters",
    category: "context",
  },
  find_system_templates: {
    displayName: "Find Templates",
    summary: "Searches an internal library of pre-configured system information",
    category: "context",
  },
  find_tool: {
    displayName: "Find Tool",
    summary: "Looks up an existing superglue tool by ID or searches by description",
    category: "context",
  },
  find_system: {
    displayName: "Find System",
    summary: "Looks up an existing superglue system by ID or searches by description",
    category: "context",
  },
  edit_payload: {
    displayName: "Edit Payload",
    summary: "Modifies the tool input displayed in the tool playground UI",
    category: "building",
  },
  web_search: {
    displayName: "Web Search",
    summary: "Searches the web for information that may be useful for building tools or systems",
    category: "context",
  },
};

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  building: "Building & Editing",
  systems: "System Management",
  execution: "Execution",
  context: "Context & Retrieval",
  other: "Other",
};

export const CATEGORY_ORDER: ToolCategory[] = [
  "building",
  "systems",
  "execution",
  "context",
  "other",
];

export type ApprovalMode = "auto" | "approval_after" | "approval_before";

export function getApprovalMode(toolName: string): ApprovalMode {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return "auto";
  if (policy.defaultMode === "confirm_before_execution") return "approval_before";
  if (policy.defaultMode === "confirm_after_execution") return "approval_after";
  if (policy.computeModeFromInput) return "approval_before";
  return "auto";
}

export const APPROVAL_LABELS: Record<ApprovalMode, string> = {
  auto: "Runs automatically",
  approval_after: "Review after run",
  approval_before: "Asks before running",
};

export interface AgentSummary {
  title: string;
  description: string;
}

export const AGENT_SUMMARIES: Record<string, AgentSummary> = {
  [AgentType.MAIN]: {
    title: "superglue Agent",
    description:
      "The most comprehensive agent that builds, tests, and deploys system integrations end-to-end. Manages systems, builds multi-step tools, handles auth, and gathers context from the web, existing superglue systems and their documentation.",
  },
  [AgentType.PLAYGROUND]: {
    title: "Tool Playground Agent",
    description:
      "Focused agent for editing and testing a specific tool. Can modify steps, update payloads, run tests, and search system docs.",
  },
  [AgentType.SYSTEM_PLAYGROUND]: {
    title: "System Playground Agent",
    description:
      "Specialized agent for configuring and testing system authentication and set-up. Edits system settings, makes test calls, and handles OAuth flows.",
  },
};

export function getToolSetForAgent(agentType: AgentType): string[] {
  const DYNAMIC_TOOLS = ["web_search"];
  switch (agentType) {
    case AgentType.MAIN:
      return [...AGENT_TOOL_SET, ...DYNAMIC_TOOLS];
    case AgentType.PLAYGROUND:
      return [...TOOL_PLAYGROUND_TOOL_SET, ...DYNAMIC_TOOLS];
    case AgentType.SYSTEM_PLAYGROUND:
      return [...SYSTEM_PLAYGROUND_TOOL_SET, ...DYNAMIC_TOOLS];
  }
}

export interface GroupedTools {
  category: ToolCategory;
  label: string;
  tools: Array<{ name: string; meta: ToolMeta; approval: ApprovalMode }>;
}

export function getGroupedToolsForAgent(agentType: AgentType): GroupedTools[] {
  const toolSet = getToolSetForAgent(agentType);
  const grouped = new Map<ToolCategory, GroupedTools>();

  for (const toolName of toolSet) {
    const meta = TOOL_METADATA[toolName];
    if (!meta) continue;
    const category = meta.category;
    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        label: CATEGORY_LABELS[category],
        tools: [],
      });
    }
    grouped.get(category)!.tools.push({
      name: toolName,
      meta,
      approval: getApprovalMode(toolName),
    });
  }

  return CATEGORY_ORDER.filter((c) => grouped.has(c)).map((c) => grouped.get(c)!);
}
