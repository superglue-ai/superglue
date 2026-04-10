import { Message, ToolCall, ToolInteractionEntry } from "@superglue/shared";

export interface ToolMutation {
  status?: ToolCall["status"];
  output?: ToolCall["output"];
  error?: ToolCall["error"] | null;
  startTime?: ToolCall["startTime"];
  endTime?: ToolCall["endTime"];
  interactionEntry?: ToolInteractionEntry;
  confirmationState?: string | null;
  confirmationData?: unknown;
}

function stripLegacyConfirmationMetadata(output: ToolCall["output"]): ToolCall["output"] {
  if (output === undefined || output === null) {
    return output;
  }

  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const nextOutput = { ...parsed };
        delete nextOutput.confirmationState;
        delete nextOutput.confirmationData;
        return JSON.stringify(nextOutput);
      }
      return output;
    } catch {
      return output;
    }
  }

  if (typeof output === "object" && !Array.isArray(output)) {
    const nextOutput = { ...(output as Record<string, unknown>) };
    delete nextOutput.confirmationState;
    delete nextOutput.confirmationData;
    return nextOutput;
  }

  return output;
}

export function createToolInteractionEntry(
  event: string,
  payload?: Record<string, unknown>,
): ToolInteractionEntry {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    event,
    createdAt: new Date().toISOString(),
    ...(payload && Object.keys(payload).length > 0 ? { payload } : {}),
  };
}

export function applyToolMutation(tool: ToolCall, mutation: ToolMutation): ToolCall {
  const interactionLog = mutation.interactionEntry
    ? (tool.interactionLog || []).some((entry) => entry.id === mutation.interactionEntry!.id)
      ? tool.interactionLog
      : [...(tool.interactionLog || []), mutation.interactionEntry]
    : tool.interactionLog;

  const shouldStripLegacyConfirmationMetadata =
    mutation.confirmationState !== undefined || mutation.confirmationData !== undefined;
  const nextOutput =
    mutation.output !== undefined
      ? mutation.output
      : shouldStripLegacyConfirmationMetadata
        ? stripLegacyConfirmationMetadata(tool.output)
        : tool.output;

  return {
    ...tool,
    ...(mutation.status !== undefined ? { status: mutation.status } : {}),
    ...(mutation.startTime !== undefined ? { startTime: mutation.startTime } : {}),
    ...(mutation.endTime !== undefined ? { endTime: mutation.endTime } : {}),
    ...(mutation.error !== undefined ? { error: mutation.error || undefined } : {}),
    ...(nextOutput !== undefined ? { output: nextOutput } : {}),
    ...(mutation.confirmationState !== undefined
      ? {
          confirmationState:
            mutation.confirmationState === null ? undefined : mutation.confirmationState,
        }
      : {}),
    ...(mutation.confirmationData !== undefined
      ? {
          confirmationData:
            mutation.confirmationData === null ? undefined : mutation.confirmationData,
        }
      : {}),
    ...(interactionLog ? { interactionLog } : {}),
  };
}

export function mutateToolCallInMessages(
  messages: Message[],
  toolCallId: string,
  mutation: ToolMutation,
): Message[] {
  return messages.map((msg) => {
    let changed = false;

    const nextTools = msg.tools?.map((tool) => {
      if (tool.id !== toolCallId) return tool;
      changed = true;
      return applyToolMutation(tool, mutation);
    });

    const nextParts = msg.parts?.map((part) => {
      if (part.type !== "tool" || !part.tool || part.tool.id !== toolCallId) {
        return part;
      }
      changed = true;
      return {
        ...part,
        tool: applyToolMutation(part.tool, mutation),
      };
    });

    return changed
      ? {
          ...msg,
          ...(nextTools ? { tools: nextTools } : {}),
          ...(nextParts ? { parts: nextParts } : {}),
        }
      : msg;
  });
}
