"use client";

import { ToolCall } from "@superglue/shared";
import { useCallback } from "react";
import type { UseAgentToolsReturn } from "./types";

interface UseAgentToolsOptions {
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useAgentTools({ setMessages }: UseAgentToolsOptions): UseAgentToolsReturn {
  const handleToolInputChange = useCallback((_newInput: any) => {}, []);

  const handleToolUpdate = useCallback(
    (toolCallId: string, updates: Partial<ToolCall>) => {
      setMessages((prev) =>
        prev.map((msg) => {
          const updateTool = (tool: ToolCall): ToolCall =>
            tool.id === toolCallId ? { ...tool, ...updates } : tool;

          return {
            ...msg,
            tools: msg.tools?.map(updateTool),
            parts: msg.parts?.map((part: any) =>
              part.type === "tool" && part.tool ? { ...part, tool: updateTool(part.tool) } : part,
            ),
          };
        }),
      );
    },
    [setMessages],
  );

  return {
    handleToolInputChange,
    handleToolUpdate,
  };
}
