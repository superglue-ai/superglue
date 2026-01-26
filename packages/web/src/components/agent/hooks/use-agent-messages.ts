"use client";

import {
  requiresConfirmationBeforeExec,
  requiresConfirmationAfterExec,
} from "@/src/lib/agent/agent-helpers";
import { Message, ToolCall } from "@superglue/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseAgentMessagesReturn } from "./types";

export function useAgentMessages(
  stopDrip: () => void,
  streamDripBufferRef: React.MutableRefObject<string>,
): UseAgentMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const createStreamingAssistantMessage = useCallback(
    (idOffset = 0): Message => ({
      id: (Date.now() + idOffset).toString(),
      content: "",
      role: "assistant",
      timestamp: new Date(),
      tools: [],
      parts: [{ type: "content", content: "", id: "content-0" }],
      isStreaming: true,
    }),
    [],
  );

  const updateMessageWithData = useCallback(
    (msg: Message, data: any, targetMessage: Message): Message => {
      if (msg.id !== targetMessage.id) return msg;

      switch (data.type) {
        case "content":
          return { ...msg, content: msg.content + data.content };

        case "tool_call_start": {
          const existingToolIndex = msg.tools?.findIndex((t) => t.id === data.toolCall.id);
          const newTool: ToolCall = {
            id: data.toolCall.id,
            name: data.toolCall.name,
            input: data.toolCall.input,
            status: data.toolCall.input
              ? requiresConfirmationBeforeExec(data.toolCall.name)
                ? "awaiting_confirmation"
                : "running"
              : "pending",
            startTime: new Date(),
          };

          let updatedTools: ToolCall[];
          if (existingToolIndex !== undefined && existingToolIndex >= 0) {
            updatedTools = [...(msg.tools || [])];
            updatedTools[existingToolIndex] = newTool;
          } else {
            updatedTools = [...(msg.tools || []), newTool];
          }

          const parts = [...(msg.parts || [])];
          const existingPartIndex = parts.findIndex(
            (p) => p.type === "tool" && p.tool?.id === data.toolCall.id,
          );

          if (existingPartIndex === -1) {
            if (msg.content) {
              parts.push({ type: "content", content: msg.content, id: `content-${parts.length}` });
            }
            parts.push({ type: "tool", tool: newTool, id: `tool-${data.toolCall.id}` });
          } else {
            parts[existingPartIndex] = { ...parts[existingPartIndex], tool: newTool };
          }

          return { ...msg, tools: updatedTools, parts, content: "" };
        }

        case "tool_call_update": {
          const updateTools =
            msg.tools?.map((tool) => {
              if (tool.id !== data.toolCall.id) return tool;
              const updatedTool = {
                ...tool,
                logs: [...(tool.logs || []), ...(data.toolCall.logs || [])],
              };

              if (tool.name === "build_tool" && data.toolCall.logs) {
                for (const log of data.toolCall.logs) {
                  if (log.message.startsWith("TOOL_CALL_UPDATE:build_tool:TOOL_BUILD_SUCCESS:")) {
                    try {
                      const logParts = log.message.split(":");
                      if (logParts.length >= 4) {
                        updatedTool.buildResult = JSON.parse(logParts.slice(3).join(":"));
                      }
                    } catch {}
                  }
                }
              }

              if (tool.name === "edit_tool" && data.toolCall.logs) {
                for (const log of data.toolCall.logs) {
                  if (log.message.startsWith("TOOL_CALL_UPDATE:edit_tool:TOOL_FIX_SUCCESS:")) {
                    try {
                      const logParts = log.message.split(":");
                      if (logParts.length >= 4) {
                        updatedTool.buildResult = JSON.parse(logParts.slice(3).join(":"));
                      }
                    } catch {}
                  }
                }
              }

              return updatedTool;
            }) || [];

          const updateParts =
            msg.parts?.map((part) =>
              part.type === "tool" && part.tool?.id === data.toolCall.id
                ? {
                    ...part,
                    tool: {
                      ...part.tool,
                      logs: [...(part.tool.logs || []), ...(data.toolCall.logs || [])],
                      buildResult: updateTools.find((t) => t.id === data.toolCall.id)?.buildResult,
                    },
                  }
                : part,
            ) || [];

          return { ...msg, tools: updateTools, parts: updateParts };
        }

        case "tool_call_complete": {
          const existingTool = msg.tools?.find((t) => t.id === data.toolCall.id);
          const toolName = existingTool?.name || "";

          // Only skip if tool is already in a final state (completed/declined)
          // Don't skip based on confirmationState - that's just user intent, not actual completion
          const alreadyCompleted =
            existingTool?.status === "completed" || existingTool?.status === "declined";

          if (alreadyCompleted) {
            return msg;
          }

          let parsedOutput: any = null;
          try {
            parsedOutput =
              typeof data.toolCall.output === "string"
                ? JSON.parse(data.toolCall.output)
                : data.toolCall.output;
          } catch {}

          const hasConfirmableContent = parsedOutput?.diffs?.length > 0 || parsedOutput?.newPayload;
          const needsPostExecConfirmation =
            requiresConfirmationAfterExec(toolName) &&
            parsedOutput?.success === true &&
            hasConfirmableContent;

          const isPendingUserConfirmation =
            parsedOutput?.confirmationState === "PENDING_USER_CONFIRMATION";

          const finalStatus: "completed" | "declined" | "awaiting_confirmation" =
            needsPostExecConfirmation || isPendingUserConfirmation
              ? "awaiting_confirmation"
              : data.toolCall.status || "completed";

          const completedTools =
            msg.tools?.map((tool) =>
              tool.id === data.toolCall.id
                ? {
                    ...tool,
                    status: finalStatus,
                    output: data.toolCall.output,
                    endTime: needsPostExecConfirmation ? undefined : new Date(),
                  }
                : tool,
            ) || [];

          const updatedParts =
            msg.parts?.map((part) =>
              part.type === "tool" && part.tool?.id === data.toolCall.id
                ? {
                    ...part,
                    tool: {
                      ...part.tool,
                      status: finalStatus,
                      output: data.toolCall.output,
                      endTime: needsPostExecConfirmation ? undefined : new Date(),
                    },
                  }
                : part,
            ) || [];

          return { ...msg, tools: completedTools, parts: updatedParts };
        }

        case "tool_call_error": {
          const errorTools =
            msg.tools?.map((tool) =>
              tool.id === data.toolCall.id
                ? {
                    ...tool,
                    status: "error" as const,
                    error: data.toolCall.error,
                    endTime: new Date(),
                  }
                : tool,
            ) || [];

          const errorParts =
            msg.parts?.map((part) =>
              part.type === "tool" && part.tool?.id === data.toolCall.id
                ? {
                    ...part,
                    tool: {
                      ...part.tool,
                      status: "error" as const,
                      error: data.toolCall.error,
                      endTime: new Date(),
                    },
                  }
                : part,
            ) || [];

          return { ...msg, tools: errorTools, parts: errorParts };
        }

        case "done": {
          if (!msg.isStreaming) return msg;
          const finalTools =
            msg.tools?.map((tool) => {
              if (tool.status === "awaiting_confirmation") return tool;
              if (tool.status === "running" || tool.status === "pending") {
                return {
                  ...tool,
                  status: "completed" as const,
                  endTime: tool.endTime || new Date(),
                };
              }
              return tool;
            }) || [];

          const finalParts = [...(msg.parts || [])];
          if (msg.content) {
            const lastPart = finalParts[finalParts.length - 1];
            if (lastPart?.type === "content") {
              finalParts[finalParts.length - 1] = {
                ...lastPart,
                content: (lastPart.content || "") + msg.content,
              };
            } else {
              finalParts.push({
                type: "content",
                content: msg.content,
                id: `content-${finalParts.length}`,
              });
            }
          }

          const updatedFinalParts = finalParts.map((part) => {
            if (part.type === "tool" && part.tool) {
              if (part.tool.status === "awaiting_confirmation") return part;
              if (part.tool.status === "running" || part.tool.status === "pending") {
                return {
                  ...part,
                  tool: {
                    ...part.tool,
                    status: "completed" as const,
                    endTime: part.tool.endTime || new Date(),
                  },
                };
              }
            }
            return part;
          });

          return {
            ...msg,
            isStreaming: false,
            tools: finalTools,
            parts: updatedFinalParts,
            content: "",
          };
        }

        case "error":
          return { ...msg, content: msg.content + "\n\n❌ " + data.content, isStreaming: false };

        default:
          return msg;
      }
    },
    [],
  );

  const setAwaitingToolsToDeclined = useCallback(() => {
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        tools: msg.tools?.map((tool) =>
          tool.status === "awaiting_confirmation"
            ? {
                ...tool,
                status: "declined" as const,
                output: JSON.stringify({
                  success: false,
                  cancelled: true,
                  message: "Request auto-declined (user sent new message)",
                }),
                endTime: new Date(),
              }
            : tool,
        ),
        parts: msg.parts?.map((part) =>
          part.type === "tool" && part.tool?.status === "awaiting_confirmation"
            ? {
                ...part,
                tool: {
                  ...part.tool,
                  status: "declined" as const,
                  output: JSON.stringify({
                    success: false,
                    cancelled: true,
                    message: "Request auto-declined (user sent new message)",
                  }),
                  endTime: new Date(),
                },
              }
            : part,
        ),
      })),
    );
  }, []);

  const cleanupInterruptedStream = useCallback(
    (interruptionMessage: string) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.isStreaming
            ? {
                ...msg,
                isStreaming: false,
                content: msg.content + interruptionMessage,
                tools: msg.tools?.map((tool) =>
                  tool.status === "running" ||
                  tool.status === "pending" ||
                  tool.status === "awaiting_confirmation" ||
                  tool.status === "declined"
                    ? { ...tool, status: "stopped" as const, endTime: new Date() }
                    : tool,
                ),
                parts: msg.parts?.map((part) =>
                  part.type === "tool" &&
                  part.tool &&
                  (part.tool.status === "running" ||
                    part.tool.status === "pending" ||
                    part.tool.status === "awaiting_confirmation" ||
                    part.tool.status === "declined")
                    ? {
                        ...part,
                        tool: { ...part.tool, status: "stopped" as const, endTime: new Date() },
                      }
                    : part,
                ),
              }
            : msg,
        ),
      );
      stopDrip();
      streamDripBufferRef.current = "";
    },
    [stopDrip, streamDripBufferRef],
  );

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingContent("");
  }, []);

  return {
    messages,
    setMessages,
    messagesRef,
    isLoading,
    setIsLoading,
    createStreamingAssistantMessage,
    updateMessageWithData,
    setAwaitingToolsToDeclined,
    cleanupInterruptedStream,
    editingMessageId,
    setEditingMessageId,
    editingContent,
    setEditingContent,
    handleEditMessage,
    handleCancelEdit,
  };
}
