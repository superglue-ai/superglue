import { observe, updateActiveObservation } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { AgentType } from "../registries/agent-registry";
import {
  buildConfirmationObservationInput,
  buildConfirmationObservationMetadata,
  buildConfirmationObservationOutput,
  buildToolObservationMetadata,
  type ConfirmationObservationContext,
  type ToolObservationContext,
} from "./langfuse-utils";

export function getLangfuseFunctionId(agentId?: string): string {
  switch (agentId) {
    case AgentType.MAIN:
      return "sg_main_agent";
    case AgentType.PLAYGROUND:
      return "sg_tp";
    case AgentType.SYSTEM_PLAYGROUND:
      return "sg_sp";
    case AgentType.ACCESS_RULES:
      return "sg_ar";
    default:
      return "sg_unknown_agent";
  }
}

export function updateActiveToolObservation(context: ToolObservationContext): void {
  const metadata = buildToolObservationMetadata(context);
  if (Object.keys(metadata).length === 0) return;

  updateActiveObservation({ metadata });
}

export async function recordConfirmationObservation(
  context: ConfirmationObservationContext,
): Promise<void> {
  if (!trace.getActiveSpan()) return;

  const metadata = buildConfirmationObservationMetadata(context);
  const input = buildConfirmationObservationInput(context);
  const output = buildConfirmationObservationOutput(context);

  const emit = observe(
    async () => {
      updateActiveObservation({ input, output, metadata });
    },
    { name: "agent.confirmation" },
  );

  await emit();
}
