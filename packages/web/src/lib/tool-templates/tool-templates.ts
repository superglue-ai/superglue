import { Tool } from "@superglue/shared";
import toolTemplates from "./tool-templates.json";

export interface ToolTemplate extends Tool {
  description: string;
}

// Note: This JSON file stays server-side when used in Next.js server components.
// Only the specific template object gets serialized to the client, not the entire file.
const templates = toolTemplates as unknown as Record<string, ToolTemplate>;

export function loadToolTemplate(id: string): ToolTemplate | null {
  const fallbackIdWithDashes = id.replace(/_/g, "-");
  return templates[id] ?? templates[fallbackIdWithDashes] ?? null;
}
