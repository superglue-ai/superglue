import { AgentType } from "../registries/agent-registry";
import {
  AGENT_TOOL_SET,
  TOOL_PLAYGROUND_TOOL_SET,
  SYSTEM_PLAYGROUND_TOOL_SET,
  ACCESS_RULES_TOOL_SET,
  SKILL_GATED_TOOLS,
} from "../registries/tool-registry";
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
    summary: "Builds a tool and returns its persistence state",
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
    summary: "Applies JSON Patch operations and returns the resulting persistence state",
    category: "building",
  },
  save_tool: {
    displayName: "Save Tool",
    summary: "Persists a draft-only tool so it can be executed as a saved tool",
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
  find_tool: {
    displayName: "Find Tool",
    summary: "Looks up an existing superglue tool by ID or search query",
    category: "context",
  },
  find_system: {
    displayName: "Find System",
    summary: "Looks up systems by ID or URL and returns matching template info (OAuth, docs, etc.)",
    category: "context",
  },
  inspect_tool: {
    displayName: "Inspect Tool",
    summary:
      "Inspects the current tool playground draft, schemas, steps, payload, and execution results",
    category: "context",
  },
  inspect_system: {
    displayName: "Inspect System",
    summary: "Inspects the current unsaved system editor state in the system playground sidebar",
    category: "context",
  },
  web_search: {
    displayName: "Web Search",
    summary: "Searches the web for information that may be useful for building tools or systems",
    category: "context",
  },
  load_skill: {
    displayName: "Load Skill",
    summary: "Loads superglue skills into context",
    category: "context",
  },
  inspect_role: {
    displayName: "Inspect Role",
    summary: "Reads the current role configuration draft including tool and system permissions",
    category: "context",
  },
  find_role: {
    displayName: "Find Role",
    summary: "Look up a saved role by ID or list all roles",
    category: "context",
  },
  edit_role: {
    displayName: "Edit Role",
    summary: "Proposes changes to the current role's tool, system, and custom rule configuration",
    category: "building",
  },
  test_role_access: {
    displayName: "Test Expression",
    summary: "Tests a custom rule expression against a sample stepConfig",
    category: "execution",
  },
  find_user: {
    displayName: "Find User",
    summary: "Looks up users by email, name, or ID and returns their role assignments",
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
    title: "superglue agent",
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
  [AgentType.ACCESS_RULES]: {
    title: "Access Rules Agent",
    description:
      "Helps configure role-based access control. Edits tool and system permissions, creates custom rules, and tests whether configs allow or block actions.",
  },
};

export function getToolSetForAgent(agentType: AgentType, loadedSkills?: string[]): string[] {
  const DYNAMIC_TOOLS = ["web_search"];
  let base: string[];
  switch (agentType) {
    case AgentType.MAIN:
      base = [...AGENT_TOOL_SET, ...DYNAMIC_TOOLS];
      break;
    case AgentType.PLAYGROUND:
      base = [...TOOL_PLAYGROUND_TOOL_SET, ...DYNAMIC_TOOLS];
      break;
    case AgentType.SYSTEM_PLAYGROUND:
      base = [...SYSTEM_PLAYGROUND_TOOL_SET, ...DYNAMIC_TOOLS];
      break;
    case AgentType.ACCESS_RULES:
      base = [...ACCESS_RULES_TOOL_SET, ...DYNAMIC_TOOLS];
      break;
  }
  if (loadedSkills?.length) {
    const baseSet = new Set(base);
    for (const skill of loadedSkills) {
      const gated = SKILL_GATED_TOOLS[skill as keyof typeof SKILL_GATED_TOOLS];
      if (gated) {
        for (const t of gated) {
          if (!baseSet.has(t)) {
            base.push(t);
            baseSet.add(t);
          }
        }
      }
    }
  }
  return base;
}

export interface GroupedTools {
  category: ToolCategory;
  label: string;
  tools: Array<{ name: string; meta: ToolMeta; approval: ApprovalMode }>;
}

export function getGroupedToolsForAgent(
  agentType: AgentType,
  loadedSkills?: string[],
): GroupedTools[] {
  const toolSet = getToolSetForAgent(agentType, loadedSkills);
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
