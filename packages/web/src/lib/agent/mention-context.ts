import { MessageReference, Run, Tool, isRequestConfig, safeStringify } from "@superglue/shared";
import { ToolExecutionContext } from "./agent-types";
import { filterSystemFields } from "./agent-helpers";
import { dedupeReferences, mentionTokenText } from "./mentions";

export const MENTION_CONTEXT_MARKER = "[REFERENCED ENTITIES]";

/**
 * Projection of a tool for the LLM. Deliberately narrow: enough to reason about what the
 * tool does and which systems it touches, without the full step payloads that would
 * dominate the context window.
 */
function projectTool(tool: Tool) {
  const steps = Array.isArray(tool.steps) ? tool.steps : [];
  const systemIds = [
    ...new Set(
      steps
        .map((step) => (isRequestConfig(step.config) ? step.config.systemId : undefined))
        .filter((systemId): systemId is string => !!systemId),
    ),
  ];

  return {
    id: tool.id,
    name: tool.name,
    instruction: tool.instruction,
    systemIds,
    inputSchema: tool.inputSchema,
    steps: steps.map((step) => ({
      id: step.id,
      instruction: step.instruction,
      ...(isRequestConfig(step.config)
        ? { systemId: step.config.systemId, method: step.config.method, url: step.config.url }
        : { type: "transform" }),
    })),
  };
}

/**
 * Projection of a run. The payload and step results are dropped - they can be megabytes,
 * and the agent can still pull them with get_runs when it actually needs them.
 */
function projectRun(run: Run) {
  const failedStep = run.stepResults?.find((step: any) => step?.success === false);

  return {
    runId: run.runId,
    toolId: run.toolId,
    status: run.status,
    error: run.error,
    startedAt: run.metadata?.startedAt,
    completedAt: run.metadata?.completedAt,
    durationMs: run.metadata?.durationMs,
    requestSource: run.requestSource,
    stepCount: run.stepResults?.length,
    failedStepId: (failedStep as any)?.stepId,
    failedStepError: (failedStep as any)?.error,
  };
}

async function resolveReference(
  reference: MessageReference,
  ctx: ToolExecutionContext,
): Promise<string> {
  const token = mentionTokenText(reference);
  const missing = `${reference.type.toUpperCase()} ${token} (id: ${reference.id})\nTHIS ${reference.type.toUpperCase()} NO LONGER EXISTS - it was deleted after the user mentioned it. State this plainly in your answer. Do not guess, do not substitute a similarly named ${reference.type}, and do not try to look it up with tools.`;

  try {
    if (reference.type === "tool") {
      const tool = await ctx.superglueClient.getWorkflow(reference.id);
      if (!tool) return missing;
      return `TOOL ${token}\n\`\`\`json\n${safeStringify(projectTool(tool), 2)}\n\`\`\``;
    }

    if (reference.type === "system") {
      // filterSystemFields masks credential values and swaps in <<system_key>> placeholders.
      const system = await ctx.superglueClient.getSystem(reference.id);
      if (!system) return missing;
      // The token carries the display name, so the real id is spelled out for the agent.
      return `SYSTEM ${token} (id: ${reference.id})\n\`\`\`json\n${safeStringify(filterSystemFields(system), 2)}\n\`\`\``;
    }

    const run = await ctx.superglueClient.getRun(reference.id);
    if (!run) return missing;
    return `RUN ${token} (full id: ${run.runId})\n\`\`\`json\n${safeStringify(projectRun(run), 2)}\n\`\`\``;
  } catch (error: any) {
    return `${reference.type.toUpperCase()} ${token}\nCould not be loaded: ${error?.message || "unknown error"}`;
  }
}

/**
 * Resolves @-mentions server-side and renders them as one context block.
 *
 * Resolution happens on every send rather than being cached on the message, so an entity
 * that was deleted after the original send is reported as missing instead of silently
 * handing the agent stale data.
 */
export async function buildMentionContext(
  references: MessageReference[],
  ctx: ToolExecutionContext,
): Promise<string | null> {
  const unique = dedupeReferences(references);
  if (unique.length === 0) return null;

  const blocks = await Promise.all(unique.map((reference) => resolveReference(reference, ctx)));
  if (blocks.length === 0) return null;

  return `${MENTION_CONTEXT_MARKER}
The user @-mentioned these superglue objects in the next message. They are the authoritative targets - use these ids directly instead of searching by name.

${blocks.join("\n\n")}`;
}
